import { request, requestBlob, writeJson } from './http'

export const priorityOptions = ['P0', 'P1', 'P2', 'P3']
export const typeLabels = { bug: 'Bug 修复', request: '需求' }
export type IssueType = keyof typeof typeLabels
export type IssueStatus = 'draft' | 'pending_claim' | 'pending_work' | 'in_progress' | 'pending_verify' | 'closed'
export const statusLabels: Record<IssueStatus, string> = {
  draft: '草稿', pending_claim: '待领取', pending_work: '待处理', in_progress: '处理中', pending_verify: '待验证',
  closed: '已关闭',
}
export const queues = { inbox: '待领取', assigned: '我的待办', feedback: '已反馈' }
export type DeveloperQueue = keyof typeof queues
export type WorkflowAction = 'claim' | 'start' | 'finish'
export interface IssuePerson { id: number; username: string }
export type VerificationOutcome = 'passed' | 'returned'

export interface VerificationResult {
  outcome: VerificationOutcome
  reason: string | null
  tester: IssuePerson
  verified_at: number
}

export interface IssueFieldSpec {
  key: string
  label: string
  options?: string[]
  multiline?: boolean
  pair?: boolean
  optional?: boolean
  type?: 'date'
  limit?: number
  placeholder?: string
}

export const commonFields: IssueFieldSpec[] = [
  { key: 'priority', label: '优先级', options: priorityOptions },
  { key: 'title', label: '标题', limit: 100, placeholder: '简要说明问题或需求' },
  { key: 'description', label: '详细描述', multiline: true },
]

export const fieldsByType: Record<IssueType, IssueFieldSpec[]> = {
  bug: [
    { key: 'environment', label: '发生环境', options: ['dev', 'uat', 'prd'] },
    { key: 'severity', label: '严重程度', options: ['致命', '严重', '一般', '轻微'] },
    { key: 'steps', label: '复现步骤', multiline: true },
    { key: 'actual', label: '实际结果', multiline: true, pair: true },
    { key: 'expected', label: '预期结果', multiline: true, pair: true },
    { key: 'version_affected', label: '影响版本', optional: true },
  ],
  request: [
    { key: 'background', label: '需求背景', multiline: true },
    { key: 'outcome', label: '期望效果', multiline: true },
    { key: 'acceptance', label: '验收标准', multiline: true },
    { key: 'scope', label: '影响范围', optional: true },
    { key: 'due', label: '期望完成日期', type: 'date', optional: true },
  ],
}

export interface Attachment {
  id: number
  name: string
  size: number
}

export interface IssueSummary {
  id: string
  type: IssueType | null
  title: string | null
  priority: string | null
  status: IssueStatus
  updated_at: number
}

export interface IssueDetail extends IssueSummary {
  version: number
  form: Record<string, string | null>
  attachments: Attachment[]
  creator: IssuePerson
  assignee: IssuePerson | null
  feedback: string | null
  feedback_at: number | null
  latest_verification: VerificationResult | null
}

interface IssueWrite {
  version: number | null
  write_id: string
  form: Record<string, string | null>
  submit: boolean
  assignee_id: number | null
  keep_attachments: number[]
}

export const issuesApi = {
  list: () => request<IssueSummary[]>('issues'),
  developers: () => request<IssuePerson[]>('issues/developers'),
  development: (queue: DeveloperQueue) => request<IssueSummary[]>(`issues/development?queue=${queue}`),
  act: (id: string, action: WorkflowAction, version: number, write_id: string, feedback?: string) =>
    writeJson<IssueDetail>('POST', `issues/${id}/actions`, { action, version, write_id, feedback }),
  verify: (id: string, outcome: VerificationOutcome, version: number, write_id: string, reason: string | null) =>
    writeJson<IssueDetail>('POST', `issues/${id}/verification`, { outcome, version, write_id, reason }),
  get: (id: string) => request<IssueDetail>(`issues/${encodeURIComponent(id)}`),
  save(id: string, data: IssueWrite, files: File[]) {
    const body = new FormData()
    body.set('data', JSON.stringify(data))
    files.forEach(file => body.append('files', file))
    return request<IssueDetail>(`issues/${id}`, { method: 'PUT', body })
  },
  delete: (id: string, version: number) => request<void>(`issues/${id}?version=${version}`, { method: 'DELETE' }),
  async download(id: string, file: Attachment) {
    saveFile(await requestBlob(`issues/${id}/attachments/${file.id}`), file.name)
  },
}

export function saveFile(content: Blob, name: string) {
  const url = URL.createObjectURL(content)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function fileSize(bytes: number) {
  if (bytes < 1000) return `${bytes} B`
  if (bytes < 1000000) return `${(bytes / 1000).toFixed(1)} KB`
  return `${(bytes / 1000000).toFixed(1)} MB`
}

const dateFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short',
})
export const issueDate = (timestamp: number) => dateFormat.format(timestamp)
