export type UserRole = 'admin' | 'tester' | 'developer'
export type MemberRole = Exclude<UserRole, 'admin'>
export type AccountStatus = 'pending' | 'active' | 'disabled'

interface UserIdentity {
  id: number
  username: string
  email: string
}

interface UserProfile extends UserIdentity {
  role: UserRole | null
}

export interface User extends UserProfile {
  can_grant_admin: boolean
}

export interface ManagedAccount extends UserProfile {
  status: AccountStatus
}

export interface AccountUpdate {
  role?: MemberRole
  status?: Exclude<AccountStatus, 'pending'>
}

interface AccountPage {
  items: ManagedAccount[]
  has_next: boolean
}

export const roleLabels: Record<UserRole, string> = {
  admin: '管理员',
  tester: '测试',
  developer: '开发',
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

export async function requestResponse(path: string, options: RequestInit = {}): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`/api/${path}`, { ...options, credentials: 'same-origin' })
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
  return response
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await requestResponse(path, options)
  return (response.status === 204 ? undefined : await response.json()) as T
}

function write<T>(method: 'POST' | 'PATCH' | 'PUT', path: string, data?: object): Promise<T> {
  return request<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  })
}

export const authApi = {
  register: (data: { username: string; email: string; password: string; confirm_password: string }) =>
    write<UserIdentity>('POST', 'auth/register', data),
  login: (data: { identifier: string; password: string }) => write<User>('POST', 'auth/login', data),
  me: () => request<User>('auth/me'),
  logout: () => write<void>('POST', 'auth/logout'),
}

export const adminApi = {
  accounts: (page: number) => request<AccountPage>(`admin/accounts?page=${page}`),
  updateAccount: (id: number, data: AccountUpdate) => write<ManagedAccount>('PATCH', `admin/accounts/${id}`, data),
  authorizations: (page: number) => request<AccountPage>(`admin/authorizations?page=${page}`),
  grantAdmin: (id: number) => write<ManagedAccount>('PUT', `admin/authorizations/${id}`),
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : '服务暂时不可用，请重试。'
}
