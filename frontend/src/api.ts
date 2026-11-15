export interface User {
  id: number
  username: string
  email: string
}

interface ErrorDetail {
  code: string
  message: string
  fields?: Record<string, string>
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message)
  }
}

function isErrorDetail(detail: unknown): detail is ErrorDetail {
  return typeof detail === 'object' && detail !== null
    && 'code' in detail && typeof detail.code === 'string'
    && 'message' in detail && typeof detail.message === 'string'
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api/auth/${path}`, { ...options, credentials: 'same-origin' })
  } catch {
    throw new ApiError(0, 'network_error', '网络连接失败，请重试。')
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const detail: unknown = body?.detail
    if (isErrorDetail(detail)) {
      throw new ApiError(response.status, detail.code, detail.message, detail.fields)
    }
    throw new ApiError(response.status, 'request_failed', '服务暂时不可用，请重试。')
  }
  return (response.status === 204 ? undefined : await response.json()) as T
}

function post<T>(path: string, data?: object): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  })
}

export const authApi = {
  register: (data: { username: string; email: string; password: string; confirm_password: string }) =>
    post<User>('register', data),
  login: (data: { identifier: string; password: string }) => post<User>('login', data),
  me: () => request<User>('me'),
  logout: () => post<void>('logout'),
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : '服务暂时不可用，请重试。'
}
