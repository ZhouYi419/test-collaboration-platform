import { request, writeJson } from './http'

export const notificationLabels = {
  assigned: '指派给你',
  claimed: '事项已领取',
  started: '开始处理',
  feedback: '处理结果待验证',
  passed: '验证通过',
  returned: '验证退回',
}

export interface NotificationItem {
  id: number
  issue_id: string
  title: string
  event: keyof typeof notificationLabels
  created_at: number
  read_at: number | null
}

interface NotificationPage {
  items: NotificationItem[]
  next_before: number | null
}

interface NotificationSummary {
  unread_count: number
  recent: NotificationItem[]
}

export const notificationsApi = {
  list: (signal: AbortSignal, before: number | null) =>
    request<NotificationPage>(before === null ? 'notifications' : 'notifications?before=' + before, { signal }),
  summary: (signal: AbortSignal) => request<NotificationSummary>('notifications/summary', { signal, timeoutMs: 4500 }),
  markRead: (id: number, issueId: string) =>
    writeJson<{ read_at: number }>('PUT', 'notifications/' + id + '/read', { issue_id: issueId }),
  markAllRead: () => writeJson<void>('PUT', 'notifications/read'),
}

const clockFormat = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
const dayFormat = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' })

export function notificationTime(timestamp: number) {
  const value = new Date(timestamp)
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  const day = value.toDateString()
  const prefix = day === today.toDateString() ? '' : day === yesterday.toDateString() ? '昨天 ' : dayFormat.format(value) + ' '
  return prefix + clockFormat.format(value)
}
