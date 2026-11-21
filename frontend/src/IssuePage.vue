<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import AccountWorkspace from './AccountWorkspace.vue'
import IssueEditor from './IssueEditor.vue'
import IssueHistory from './IssueHistory.vue'
import IssueIcon from './IssueIcon.vue'
import IssueListQuery from './IssueListQuery.vue'
import IssueVerification from './IssueVerification.vue'
import IssueVerificationResult from './IssueVerificationResult.vue'
import IssueWorkflow from './IssueWorkflow.vue'
import { ApiError, authApi, errorMessage, type User } from './api'
import { useNotificationSession } from './notificationSession'
import { notificationsApi } from './notificationsApi'
import {
  defaultIssueFilters, fieldsByType, fileSize, issueDate, issuePageLimit, issueQueryParams, issueSearchLimit, issueSortLabels,
  issuesApi, priorityOptions, queueStatuses, queues, statusLabels, typeLabels,
  type Attachment, type DeveloperQueue, type IssueDetail, type IssueFilters, type IssueSort, type IssueStatus, type IssueSummary,
  type IssueType, type VerificationOutcome, type WorkflowAction,
} from './issuesApi'

const router = useRouter()
const route = useRoute()
const notifications = useNotificationSession()
const user = ref<User | null>(null)
const items = ref<IssueSummary[]>([])
const hasNext = ref(false)
const detail = ref<IssueDetail | null>(null)
const busy = ref(true)
const failure = ref<{ message: string; status: number }>()
const downloadError = ref('')
const notificationReadError = ref(false)
const notificationReading = ref(false)
const editor = ref<InstanceType<typeof IssueEditor>>()
const workflow = ref<InstanceType<typeof IssueWorkflow>>()
const verification = ref<InstanceType<typeof IssueVerification>>()
const view = ref<HTMLElement>()
const changedId = ref('')
const notice = ref('')
const workflowNotice = ref('')
const feedbackReceipt = ref(false)
const verificationReceipt = ref('')
const developerPage = computed(() => route.name === 'development')
const pageTitle = computed(() => developerPage.value ? '开发事项' : '我的事项')
const queue = computed<DeveloperQueue>(() => {
  const value = String(route.query.queue ?? 'inbox')
  return Object.hasOwn(queues, value) ? value as DeveloperQueue : 'inbox'
})
const statuses = computed(() => developerPage.value ? queueStatuses[queue.value] : Object.keys(statusLabels) as IssueStatus[])

function selected<T extends string>(value: unknown, options: readonly T[]): T | '' {
  return typeof value === 'string' && options.includes(value as T) ? value as T : ''
}

const filters = computed<IssueFilters>(() => ({
  q: typeof route.query.q === 'string' ? route.query.q.trim().slice(0, issueSearchLimit) : '',
  type: selected(route.query.type, Object.keys(typeLabels) as IssueType[]),
  priority: selected(route.query.priority, priorityOptions),
  status: selected(route.query.status, statuses.value),
  sort: selected(route.query.sort, Object.keys(issueSortLabels) as IssueSort[]) || 'recent',
}))
const page = computed(() => {
  const number = typeof route.query.page === 'string' ? Number(route.query.page) : 1
  return Number.isSafeInteger(number) && number > 0 && number <= issuePageLimit ? number : 1
})
const isFiltered = computed(() => !!(filters.value.q || filters.value.type || filters.value.priority || filters.value.status))

function listLocation(criteria: IssueFilters, number: number) {
  const query = issueQueryParams(criteria, number)
  if (developerPage.value) query.queue = queue.value
  return { path: developerPage.value ? '/development' : '/issues', query }
}

const listPath = computed(() => listLocation(filters.value, page.value))
const notificationId = computed(() => {
  const id = typeof route.query.notification === 'string' ? Number(route.query.notification) : 0
  return Number.isInteger(id) && id > 0 && id <= 2_147_483_647 ? id : undefined
})
const notificationFrom = computed(() => notifications.origin.value?.destination === route.fullPath
  ? notifications.origin.value.from : undefined)
const detailBack = computed(() => {
  if (notificationFrom.value) return notificationFrom.value
  if (!developerPage.value || !detail.value) return listPath.value
  const state = detail.value.status
  const destination = state === 'pending_claim' ? 'inbox' : ['pending_verify', 'closed'].includes(state) ? 'feedback' : 'assigned'
  return destination === queue.value ? listPath.value : { path: '/development', query: { queue: destination } }
})
const canProcess = computed(() => developerPage.value && detail.value && (
  detail.value.status === 'pending_claim' || detail.value.assignee?.id === user.value?.id
) && ['pending_claim', 'pending_work', 'in_progress'].includes(detail.value.status))
const canVerify = computed(() => !developerPage.value && detail.value?.status === 'pending_verify'
  && detail.value.creator.id === user.value?.id)
const reworking = computed(() => canProcess.value && detail.value?.status === 'in_progress'
  && detail.value.latest_verification?.outcome === 'returned')
const canReadHistory = computed(() => detail.value && detail.value.status !== 'draft'
  && (developerPage.value ? detail.value.assignee?.id : detail.value.creator.id) === user.value?.id
  && !!user.value)
const editing = computed(() => !developerPage.value && (itemId.value === 'new' || detail.value?.status === 'draft'))
const itemId = computed(() => String(route.params.issueId ?? ''))
const listView = computed(() => !itemId.value && failure.value?.status !== 403)
const emptyListTitle = computed(() => page.value > 1 ? '当前页没有事项' : isFiltered.value ? '没有符合条件的事项' :
  developerPage.value ? { inbox: '暂无待领取事项', assigned: '暂无待办', feedback: '暂无已反馈事项' }[queue.value] : '暂无事项')
const specifics = computed(() => detail.value?.type
  ? fieldsByType[detail.value.type].filter(field => detail.value?.form[field.key])
  : [])
let listPosition: { path: string; scroll: number } | undefined
let noticeTimer: ReturnType<typeof setTimeout> | undefined
let loadVersion = 0
let focusQueue = false
let focusResults = false
let returnScroll: number | undefined

async function load() {
  const version = ++loadVersion
  const target = itemId.value
  const restoreScroll = returnScroll
  returnScroll = undefined
  busy.value = true
  failure.value = undefined
  hasNext.value = false
  detail.value = null
  feedbackReceipt.value = false
  verificationReceipt.value = ''
  downloadError.value = ''
  notificationReadError.value = false
  notificationReading.value = false
  if (target) {
    notice.value = ''
    changedId.value = ''
  }
  try {
    const profile = await authApi.me()
    if (version !== loadVersion) return
    user.value = profile
    if (profile.role !== (developerPage.value ? 'developer' : 'tester')) {
      failure.value = { message: developerPage.value ? '开发事项仅向开发人员开放。' : '我的事项仅向测试人员开放。', status: 403 }
    } else if (!target) {
      const result = await issuesApi.list(filters.value, page.value, developerPage.value ? queue.value : undefined)
      if (version === loadVersion) {
        items.value = result.items
        hasNext.value = result.has_next && page.value < issuePageLimit
      }
    } else if (target !== 'new' || developerPage.value) {
      const result = await issuesApi.get(target)
      if (version === loadVersion) {
        detail.value = result
        void markNotificationRead()
      }
    }
  } catch (error) {
    if (version !== loadVersion) return
    if (error instanceof ApiError && error.status === 401) {
      void login()
      return
    }
    failure.value = { message: errorMessage(error), status: error instanceof ApiError ? error.status : 0 }
  } finally {
    if (version === loadVersion) busy.value = false
  }

  await nextTick()
  if (version !== loadVersion) return
  const nextFocus = focusQueue ? '.queue-tab[aria-current="page"]' : focusResults ? '.issue-list-results [tabindex="-1"]' : 'h1'
  focusQueue = false
  focusResults = false
  const previous = listPosition
  if (restoreScroll !== undefined && !failure.value) {
    listPosition = undefined
    window.scrollTo(0, restoreScroll)
    view.value?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true })
    return
  }
  if (!target) {
    if (!failure.value) listPosition = undefined
    const origin = changedId.value
      ? view.value?.querySelector<HTMLElement>('.recently-changed .issue-title')
      : previous && view.value?.querySelector<HTMLElement>(`a[href=${CSS.escape(previous.path)}]`)
    if (origin) {
      if (previous) window.scrollTo(0, previous.scroll)
      const bounds = origin.getBoundingClientRect()
      const headerBottom = document.querySelector('.workspace-header')?.getBoundingClientRect().bottom ?? 0
      if (bounds.top < headerBottom || bounds.bottom > window.innerHeight) origin.scrollIntoView({ block: 'center' })
      origin.focus({ preventScroll: true })
      return
    }
    const retry = view.value?.querySelector<HTMLElement>('.issue-list-retry')
    if (retry) {
      retry.focus()
      return
    }
  }
  window.scrollTo(0, 0)
  const next = view.value?.querySelector<HTMLElement>(nextFocus) ?? view.value?.querySelector<HTMLElement>('h1')
  next?.focus({ preventScroll: true })
  if (next && next.getBoundingClientRect().top > innerHeight - 90) next.scrollIntoView({ block: 'start' })
}

async function markNotificationRead() {
  const id = notificationId.value
  const issue = detail.value
  if (!id || !issue || notificationReading.value) return
  const version = loadVersion
  notificationReading.value = true
  try {
    await notificationsApi.markRead(id, issue.id)
    notifications.read(id)
    if (version === loadVersion) notificationReadError.value = false
  } catch {
    if (version === loadVersion) notificationReadError.value = true
  } finally {
    if (version === loadVersion) notificationReading.value = false
  }
}

function retryRead() {
  focusResults = listView.value
  return load()
}

function applyFilters(criteria: IssueFilters) {
  const target = listLocation(criteria, 1)
  if (router.resolve(target).fullPath === route.fullPath) {
    focusResults = true
    void load()
  } else {
    void router.push(target)
  }
}

function login() {
  return router.replace('/login')
}

function showSaved(id: string, message: string) {
  changedId.value = id
  notice.value = message
  listPosition = undefined
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { notice.value = ''; changedId.value = '' }, 3300)
  void router.push('/issues')
}

function itemPath(id: string) {
  return { path: `${listPath.value.path}/${id}`, query: listPath.value.query }
}

async function updated(issue: IssueDetail, action: WorkflowAction) {
  const scroll = window.scrollY
  detail.value = issue
  notice.value = ''
  clearTimeout(noticeTimer)
  if (action === 'claim') {
    notice.value = '事项已领取'
    noticeTimer = setTimeout(() => { notice.value = '' }, 3300)
  }
  await nextTick()
  if (action === 'start') {
    window.scrollTo(0, scroll)
    workflow.value?.focusInput()
  } else if (action === 'finish') {
    feedbackReceipt.value = true
    await nextTick()
    const section = view.value?.querySelector<HTMLElement>('.issue-feedback')
    section?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
    section?.scrollIntoView({ block: 'nearest' })
  } else {
    workflow.value?.focusAction()
  }
}

function focusVerificationResult() {
  const result = view.value?.querySelector<HTMLElement>('#verification-result')
  result?.focus({ preventScroll: true })
  result?.scrollIntoView({ block: 'start' })
}

async function presentVerification(issue: IssueDetail, outcome?: VerificationOutcome) {
  detail.value = issue
  verificationReceipt.value = ''
  if (outcome === 'passed' && issue.status === 'closed') {
    verificationReceipt.value = '事项已关闭'
  } else if (outcome === 'returned' && issue.status === 'in_progress' && issue.latest_verification?.outcome === 'returned') {
    verificationReceipt.value = `已退回给${issue.assignee?.username ?? '负责人'}重新处理`
  }
  await nextTick()
  if (canVerify.value) verification.value?.focusHeading()
  else focusVerificationResult()
}

async function unavailable(message: string) {
  workflowNotice.value = message
  listPosition = undefined
  await router.replace('/development?queue=inbox')
}

async function download(file: Attachment) {
  if (!detail.value) return
  downloadError.value = ''
  try {
    await issuesApi.download(detail.value.id, file)
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) void login()
    else downloadError.value = errorMessage(error)
  }
}

onBeforeRouteUpdate(async (to, from) => {
  if (editor.value && !await editor.value.confirmLeave()) return false
  if (workflow.value && !await workflow.value.confirmLeave()) return false
  if (verification.value && !await verification.value.confirmLeave()) return false
  const origin = notifications.origin.value
  returnScroll = origin?.destination === from.fullPath && origin.from === to.fullPath ? origin.scroll : undefined
  if (!from.params.issueId && to.params.issueId) listPosition = { path: to.fullPath, scroll: window.scrollY }
  const changingList = !from.params.issueId && !to.params.issueId
  focusQueue = developerPage.value && changingList && to.query.queue !== from.query.queue
  focusResults = changingList && !focusQueue
  if (changingList) {
    listPosition = undefined
    changedId.value = ''
  }
  if (to.params.issueId) workflowNotice.value = ''
  return true
})
onBeforeRouteLeave(async () => {
  if (editor.value && !await editor.value.confirmLeave()) return false
  if (workflow.value && !await workflow.value.confirmLeave()) return false
  return verification.value?.confirmLeave()
})
onUnmounted(() => {
  loadVersion++
  clearTimeout(noticeTimer)
})
watch(() => route.fullPath, load, { immediate: true })
</script>

<template>
  <AccountWorkspace :user="user" class="issue-workspace">
    <div ref="view" class="issue-surface" :class="{ 'issue-reading': editing && !failure }">
      <template v-if="listView">
        <div class="issue-head" :class="{ 'is-queue': developerPage }">
          <h1 tabindex="-1">{{ pageTitle }}</h1>
          <RouterLink v-if="user?.role === 'tester'" class="admin-primary create-button" to="/issues/new">
            <IssueIcon name="plus" />新建事项
          </RouterLink>
        </div>
        <nav v-if="user?.role === 'developer'" class="queue-tabs" aria-label="开发事项分类">
          <RouterLink v-for="(label, key) in queues" :key="key" class="queue-tab" :to="`/development?queue=${key}`"
            :aria-current="queue === key ? 'page' : undefined"><IssueIcon :name="key" />{{ label }}</RouterLink>
        </nav>
        <IssueListQuery v-if="user?.role === (developerPage ? 'developer' : 'tester')" :key="queue"
          :filters="filters" :statuses="statuses" @apply="applyFilters" />
      </template>

      <template v-if="failure">
        <div v-if="!listView" class="issue-head">
          <h1 tabindex="-1">{{ failure.status === 403 ? '无权访问' : failure.status === 404 ? '事项不可用' : pageTitle }}</h1>
        </div>
        <div class="issue-empty" :class="{ 'query-placeholder': listView }">
          <p role="alert">{{ failure.message }}</p>
          <RouterLink v-if="failure.status === 403" class="admin-button create-button" to="/account">返回我的账号</RouterLink>
          <RouterLink v-else-if="failure.status === 404" class="admin-button create-button" :to="notificationFrom ?? listPath">
            {{ notificationFrom ? '返回原页面' : '返回列表' }}
          </RouterLink>
          <button v-else type="button" class="admin-button" :class="{ 'issue-list-retry': listView }"
            @click="retryRead">重新加载</button>
        </div>
      </template>

      <template v-else-if="busy">
        <div v-if="!listView" class="issue-head"><h1 tabindex="-1">{{ pageTitle }}</h1></div>
        <p class="issue-empty" :class="{ 'query-placeholder': listView }" role="status">正在加载事项…</p>
      </template>

      <div v-else-if="!itemId" class="issue-list-results">
        <p v-if="workflowNotice" class="action-error workflow-notice" role="alert">{{ workflowNotice }}</p>
        <div v-if="items.length" class="issue-list-panel" tabindex="-1">
          <table class="issue-table" :class="{ 'uniform-queue': developerPage && queue === 'inbox' }"
            :aria-label="developerPage ? queues[queue] : pageTitle">
            <colgroup><col><col><col><col><col></colgroup>
            <thead><tr><th scope="col">标题</th><th scope="col">类型</th><th scope="col">优先级</th><th scope="col">状态</th><th scope="col">更新时间</th></tr></thead>
            <tbody>
              <tr v-for="item in items" :key="item.id" :class="{ 'recently-changed': changedId === item.id }">
                <th scope="row">
                  <div class="issue-title-cell">
                    <span class="item-symbol" :data-type="item.type ?? 'draft'"><IssueIcon :name="item.type ?? 'draft'" /></span>
                    <RouterLink class="issue-title" :to="itemPath(item.id)">{{ item.title || '未命名草稿' }}</RouterLink>
                  </div>
                </th>
                <td class="issue-type">{{ item.type ? typeLabels[item.type] : '未选择' }}</td>
                <td>
                  <span v-if="item.priority" class="issue-priority" :data-priority="item.priority">{{ item.priority }}</span>
                  <span v-else class="unset-priority" aria-label="未选择优先级">—</span>
                </td>
                <td><span class="issue-state" :data-status="item.status" :class="{ 'is-draft': item.status === 'draft' }">{{ statusLabels[item.status] }}</span></td>
                <td class="issue-time">
                  <time :datetime="new Date(item.updated_at).toISOString()">{{ issueDate(item.updated_at) }}</time>
                  <IssueIcon class="row-arrow" name="arrow" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="issue-empty query-placeholder" tabindex="-1">
          <h2>{{ emptyListTitle }}</h2>
          <button v-if="isFiltered" type="button" class="admin-button" @click="applyFilters(defaultIssueFilters)">清空条件</button>
        </div>
        <nav v-if="page > 1 || hasNext" class="issue-pagination" aria-label="事项分页">
          <span>第 {{ page }} 页</span>
          <div class="page-actions">
            <RouterLink v-if="page > 1" class="admin-button" :to="listLocation(filters, page - 1)">上一页</RouterLink>
            <button v-else type="button" class="admin-button" disabled>上一页</button>
            <RouterLink v-if="hasNext" class="admin-button" :to="listLocation(filters, page + 1)">下一页</RouterLink>
            <button v-else type="button" class="admin-button" disabled>下一页</button>
          </div>
        </nav>
      </div>

      <template v-else>
        <RouterLink class="back-link" :to="detailBack"><span aria-hidden="true">←</span>
          {{ notificationFrom ? '返回原页面' : developerPage ? '开发事项' : '我的事项' }}
        </RouterLink>
        <template v-if="editing">
          <div class="issue-head form-head">
            <h1 tabindex="-1">{{ detail ? '编辑草稿' : '新建事项' }}</h1>
            <p class="reporter">申请人<strong>{{ user?.username }}</strong></p>
          </div>
          <IssueEditor :key="itemId" ref="editor" :issue="detail" @saved="showSaved" @expired="login" />
        </template>
        <template v-else-if="detail">
          <div class="detail-head">
            <h1 tabindex="-1">{{ detail.title }}</h1>
            <div class="workflow-heading">
              <span class="issue-state" :data-status="detail.status">{{ statusLabels[detail.status] }}</span>
              <span class="workflow-updated">更新于 <time :datetime="new Date(detail.updated_at).toISOString()">{{ issueDate(detail.updated_at) }}</time></span>
              <button v-if="canVerify" type="button" class="admin-button feedback-jump"
                @click="verification?.focusHeading()">测试验证<IssueIcon name="jump" /></button>
              <button v-else-if="reworking" type="button" class="admin-button feedback-jump"
                @click="focusVerificationResult">查看退回原因<IssueIcon name="jump" /></button>
              <button v-else-if="canProcess && detail.status === 'in_progress'" type="button" class="admin-button feedback-jump"
                @click="workflow?.focusInput()">处理反馈<IssueIcon name="down" /></button>
            </div>
          </div>
          <div v-if="notificationReadError" class="action-error" role="alert">
            消息仍为未读。
            <button class="admin-button" type="button" :disabled="notificationReading" @click="markNotificationRead">
              {{ notificationReading ? '正在标记…' : '重试标为已读' }}
            </button>
          </div>
          <div class="detail-layout">
            <section class="detail-section detail-properties" aria-labelledby="property-heading">
              <h2 id="property-heading">事项属性</h2>
              <dl class="detail-summary">
                <div><dt>申请人</dt><dd>{{ detail.creator.username }}</dd></div>
                <div><dt>负责人</dt><dd>{{ detail.assignee?.username ?? '未指定' }}</dd></div>
                <div><dt>申请类型</dt><dd>{{ detail.type && typeLabels[detail.type] }}</dd></div>
                <div><dt>优先级</dt><dd class="issue-priority" :data-priority="detail.priority">{{ detail.priority }}</dd></div>
              </dl>
            </section>
            <div class="detail-content">
              <section class="detail-section">
                <h2>详细描述</h2><p class="detail-text">{{ detail.form.description }}</p>
              </section>
              <section class="detail-section">
                <h2>{{ detail.type === 'bug' ? '复现信息' : '需求信息' }}</h2>
                <dl class="detail-grid">
                  <div v-for="field in specifics" :key="field.key" :class="{ wide: field.multiline && !field.pair, comparison: field.pair }"
                    :data-comparison="field.pair ? field.key : undefined">
                    <dt>{{ field.label }}</dt><dd>{{ detail.form[field.key] }}</dd>
                  </div>
                </dl>
              </section>
              <section class="detail-section">
                <h2>{{ detail.attachments.length ? `附件（${detail.attachments.length}）` : '附件' }}</h2>
                <ul v-if="detail.attachments.length" class="file-list">
                  <li v-for="file in detail.attachments" :key="file.id">
                    <button type="button" class="file-download" @click="download(file)">
                      <IssueIcon name="down" /><span>{{ file.name }}</span>
                    </button>
                    <span class="file-size">{{ fileSize(file.size) }}</span>
                  </li>
                </ul>
                <p v-else class="file-hint">无附件</p>
                <p v-if="downloadError" class="field-error file-error" role="alert">{{ downloadError }}</p>
              </section>
            </div>
            <div v-if="canProcess || canVerify || detail.feedback" class="detail-workflow">
              <div v-if="detail.feedback || canVerify" class="workflow-panel issue-review-panel">
                <IssueVerificationResult v-if="reworking && detail.latest_verification" :result="detail.latest_verification" />
                <section v-if="detail.feedback" class="detail-section issue-feedback">
                  <div class="feedback-heading">
                    <h2 tabindex="-1" :aria-describedby="feedbackReceipt ? 'feedback-receipt' : undefined">
                      {{ detail.status === 'in_progress' ? '上次处理反馈' : '处理反馈' }}
                    </h2>
                    <p v-if="feedbackReceipt" id="feedback-receipt" class="feedback-receipt">
                      <IssueIcon name="check" />处理结果已提交
                    </p>
                  </div>
                  <p class="detail-text">{{ detail.feedback }}</p>
                  <p class="feedback-time">{{ detail.assignee?.username }} · {{ detail.feedback_at && issueDate(detail.feedback_at) }}</p>
                </section>
                <IssueVerificationResult v-if="!reworking && detail.latest_verification" :result="detail.latest_verification"
                  :previous="detail.status === 'pending_verify'" :receipt="verificationReceipt" />
                <IssueWorkflow v-if="reworking" ref="workflow" :issue="detail" @updated="updated"
                  @unavailable="unavailable" @expired="login" />
                <IssueVerification v-if="canVerify" ref="verification" :issue="detail" @updated="presentVerification"
                  @refreshed="presentVerification" @unavailable="load" @expired="login" />
              </div>
              <IssueWorkflow v-else-if="canProcess" ref="workflow" :issue="detail" @updated="updated"
                @unavailable="unavailable" @expired="login" />
            </div>
          </div>
          <IssueHistory v-if="canReadHistory" :key="detail.id" :issue-id="detail.id" :version="detail.version" @expired="login" />
        </template>
      </template>
      <p v-if="listView" class="verification-announcement" role="status">
        {{ !busy && !failure ? (items.length ? `第 ${page} 页，${items.length} 条事项` : emptyListTitle) : '' }}
      </p>
    </div>
    <div class="issue-notice" role="status">{{ notice }}</div>
  </AccountWorkspace>
</template>

<style src="./issues.css"></style>
<style src="./issue-review.css"></style>
<style src="./issue-editor.css"></style>
<style src="./issue-search.css"></style>
