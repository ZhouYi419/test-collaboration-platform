import { request, writeJson } from './http'

export { ApiError, errorMessage } from './http'

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

export const authApi = {
  register: (data: { username: string; email: string; password: string; confirm_password: string }) =>
    writeJson<UserIdentity>('POST', 'auth/register', data),
  login: (data: { identifier: string; password: string }) => writeJson<User>('POST', 'auth/login', data),
  me: () => request<User>('auth/me'),
  logout: () => writeJson<void>('POST', 'auth/logout'),
}

export const adminApi = {
  accounts: (page: number) => request<AccountPage>(`admin/accounts?page=${page}`),
  updateAccount: (id: number, data: AccountUpdate) => writeJson<ManagedAccount>('PATCH', `admin/accounts/${id}`, data),
  authorizations: (page: number) => request<AccountPage>(`admin/authorizations?page=${page}`),
  grantAdmin: (id: number) => writeJson<ManagedAccount>('PUT', `admin/authorizations/${id}`),
}
