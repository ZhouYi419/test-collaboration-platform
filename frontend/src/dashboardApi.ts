import type { UserRole } from './api'
import { request } from './http'
import type { IssueStatus } from './issuesApi'

export type SubmittedStatus = Exclude<IssueStatus, 'draft'>
export type DashboardRange = { kind: '7' | '30' } | { kind: 'custom'; start: string; end: string }

export const activityLabels = {
  feedback: '处理反馈',
  passed: '验证通过',
  returned: '验证退回',
}
export const activityKinds = ['feedback', 'passed', 'returned'] as const
export type ActivityCounts = Record<(typeof activityKinds)[number], number>

export interface ActivityBucket extends ActivityCounts {
  start: string
  end: string
}

export interface DashboardActivity {
  start: string
  end: string
  today: string
  totals: ActivityCounts
  buckets: ActivityBucket[]
}

export interface Dashboard {
  role: UserRole
  as_of: number
  status_counts: Partial<Record<SubmittedStatus, number>>
  available_to_claim: number | null
  activity: DashboardActivity
}

export function dashboardQuery(range: DashboardRange): Record<string, string> {
  if (range.kind === 'custom') return { start: range.start, end: range.end }
  return range.kind === '30' ? { days: '30' } : {}
}

export const dashboardApi = {
  read: (range: DashboardRange, signal: AbortSignal) => {
    const query = new URLSearchParams(dashboardQuery(range))
    return request<Dashboard>(query.size ? 'dashboard?' + query : 'dashboard', { signal })
  },
}
