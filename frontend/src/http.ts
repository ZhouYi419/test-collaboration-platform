export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields: Record<string, string>

  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }
}

interface RequestOptions extends RequestInit {
  timeoutMs?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function responseError(response: Response): Promise<ApiError> {
  let body: unknown
  try {
    body = await response.json()
  } catch (error) {
    // 网关可能返回 HTML；读取中断则交由请求层保留网络或超时语义。
    if (!(error instanceof SyntaxError)) throw error
  }
  const detail = isRecord(body) ? body.detail : undefined
  if (isRecord(detail) && typeof detail.code === 'string' && typeof detail.message === 'string') {
    const fields = isRecord(detail.fields)
      ? Object.fromEntries(Object.entries(detail.fields).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
      : {}
    return new ApiError(response.status, detail.code, detail.message, fields)
  }
  return new ApiError(response.status, 'request_failed', '服务暂时不可用，请重试。')
}

async function send<T>(
  path: string, consume: (response: Response) => Promise<T>, options: RequestOptions,
): Promise<T> {
  const { timeoutMs = 60_000, signal: callerSignal, ...init } = options
  const timeout = AbortSignal.timeout(timeoutMs)
  const signal = callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout
  try {
    const response = await fetch(`/api/${path}`, { ...init, signal, credentials: 'same-origin' })
    if (!response.ok) throw await responseError(response)
    // 超时覆盖响应体读取；写入不自动重试，调用方沿用原请求标识重试。
    return await consume(response)
  } catch (error) {
    if (callerSignal?.aborted) throw new ApiError(0, 'request_cancelled', '请求已取消。')
    if (timeout.aborted) throw new ApiError(0, 'request_timeout', '请求超时，请重试。')
    if (error instanceof ApiError) throw error
    if (error instanceof SyntaxError) throw new ApiError(0, 'invalid_response', '服务返回的数据无效，请重试。')
    if (error instanceof TypeError) throw new ApiError(0, 'network_error', '网络连接失败，请重试。')
    throw error
  }
}

export function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return send(path, async response => (response.status === 204 ? undefined : await response.json()) as T, options)
}

export function requestBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  return send(path, response => response.blob(), options)
}

export function writeJson<T>(method: 'POST' | 'PATCH' | 'PUT', path: string, data?: object): Promise<T> {
  return request<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  })
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : '服务暂时不可用，请重试。'
}
