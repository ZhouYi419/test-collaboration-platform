<script lang="ts">
let dashboardReturn: { path: string; userId: number; elementId: string; scroll: number } | undefined
</script>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import AccountWorkspace from './AccountWorkspace.vue'
import DashboardActivity from './DashboardActivity.vue'
import IssueIcon from './IssueIcon.vue'
import { ApiError, authApi, errorMessage, type User } from './api'
import { dashboardApi, dashboardQuery, type Dashboard, type DashboardRange, type SubmittedStatus } from './dashboardApi'
import { queueStatuses, statusLabels, type DeveloperQueue } from './issuesApi'
import './dashboard.css'

const route = useRoute()
const router = useRouter()
const user = shallowRef<User | null>(null)
const stats = shallowRef<Dashboard>()
const busy = ref(true)
const forbidden = ref(false)
const problem = ref('')
const invalidRange = ref(false)
const initialRetry = ref<HTMLButtonElement>()
const submittedStatuses = ['pending_claim', 'pending_work', 'in_progress', 'pending_verify', 'closed'] as const
const scopeLabels = { tester: '我提交的事项', developer: '我负责的事项', admin: '全站已提交事项' }
let request: AbortController | undefined

const selection = computed<DashboardRange>(() => {
  const from = route.query.start
  const to = route.query.end
  if (typeof from === 'string' && typeof to === 'string') return { kind: 'custom', start: from, end: to }
  return { kind: route.query.days === '30' ? '30' : '7' }
})

function destination(state: SubmittedStatus | 'assigned'): RouteLocationRaw | undefined {
  if (stats.value?.role === 'tester' && state !== 'assigned') return { name: 'issues', query: { status: state } }
  if (stats.value?.role !== 'developer') return
  if (state === 'assigned') return { name: 'development', query: { queue: 'assigned' } }
  const queue = (Object.keys(queueStatuses) as DeveloperQueue[]).find(key => queueStatuses[key].includes(state))
  return { name: 'development', query: { queue, status: state } }
}

const distribution = computed(() => {
  const data = stats.value
  if (!data) return []
  return submittedStatuses.filter(state => data.status_counts[state] !== undefined).map(state => ({
    state, id: 'dashboard-status-' + state, count: data.status_counts[state] ?? 0,
    label: statusLabels[state], to: destination(state),
  }))
})
const total = computed(() => distribution.value.reduce((sum, item) => sum + item.count, 0))

interface WorkItem {
  id: string
  label: string
  count: number
  to?: RouteLocationRaw
  shared?: boolean
}

const work = computed<WorkItem[]>(() => {
  const data = stats.value
  if (!data) return []
  const count = (state: SubmittedStatus) => data.status_counts[state] ?? 0
  const item = (state: SubmittedStatus, label = statusLabels[state]): WorkItem => ({
    id: 'dashboard-work-' + state, label, count: count(state), to: destination(state),
  })
  const processing = count('pending_work') + count('in_progress')
  if (data.role === 'tester') return [item('pending_verify')]
  if (data.role === 'developer') return [
    { id: 'dashboard-work-assigned', label: '我的待办', count: processing, to: destination('assigned') },
    item('pending_work'),
    item('in_progress'),
    { id: 'dashboard-work-shared', label: '待领取队列', count: data.available_to_claim ?? 0,
      to: destination('pending_claim'), shared: true },
  ]
  return [
    { id: 'dashboard-work-open', label: '全站未关闭', count: total.value - count('closed') },
    item('pending_claim'),
    { id: 'dashboard-work-processing', label: '待处理或处理中', count: processing },
    item('pending_verify'),
  ]
})

async function load() {
  if (route.name !== 'dashboard') return
  request?.abort()
  const controller = new AbortController()
  request = controller
  const range = selection.value
  busy.value = true
  problem.value = ''
  forbidden.value = false
  invalidRange.value = false
  try {
    if (!user.value) {
      const profile = await authApi.me()
      if (controller.signal.aborted) return
      user.value = profile
    }
    const result = await dashboardApi.read(range, controller.signal)
    if (controller.signal.aborted) return
    if (user.value.role !== result.role) {
      const profile = await authApi.me()
      if (controller.signal.aborted) return
      user.value = profile
      if (profile.role !== result.role) {
        stats.value = undefined
        problem.value = '账号角色已变化，请重新加载。'
        return
      }
    }
    stats.value = result
    await nextTick()
    const origin = dashboardReturn
    if (!controller.signal.aborted && origin?.path === route.fullPath && origin.userId === user.value.id) {
      window.scrollTo(0, origin.scroll)
      document.getElementById(origin.elementId)?.focus({ preventScroll: true })
      dashboardReturn = undefined
    }
  } catch (error) {
    if (controller.signal.aborted) return
    if (error instanceof ApiError && error.status === 401) {
      stats.value = undefined
      await router.replace('/login')
      return
    }
    if (error instanceof ApiError && error.status === 403) {
      stats.value = undefined
      forbidden.value = true
    }
    invalidRange.value = error instanceof ApiError && error.status === 422
    problem.value = errorMessage(error)
  } finally {
    if (request === controller) {
      busy.value = false
      request = undefined
    }
  }
}

function select(range: DashboardRange) {
  const target = { name: 'dashboard', query: dashboardQuery(range) }
  if (router.resolve(target).fullPath === route.fullPath) void load()
  else void router.replace(target)
}

function remember(event: MouseEvent, elementId: string, to?: RouteLocationRaw) {
  if (!to || !user.value || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
  dashboardReturn = { path: route.fullPath, userId: user.value.id, elementId, scroll: window.scrollY }
}

async function retry() {
  await load()
  if (problem.value && !stats.value) {
    await nextTick()
    initialRetry.value?.focus({ preventScroll: true })
  }
}

watch(() => route.fullPath, load, { immediate: true })
onUnmounted(() => { request?.abort(); request = undefined })
</script>

<template>
  <AccountWorkspace :user="user" class="issue-workspace">
    <div class="issue-surface dashboard-page">
      <header class="dashboard-title"><h1 tabindex="-1">统计看板</h1></header>
      <template v-if="stats">
        <div class="dash-panel dashboard-grid">
          <section class="snapshot-cell" :class="{ 'is-primary-only': stats.role === 'tester' }" aria-labelledby="work-title">
            <h2 id="work-title">当前待办</h2>
            <component :is="work[0].to ? RouterLink : 'div'" :id="work[0].id" class="work-summary" :to="work[0].to"
              @click="remember($event, work[0].id, work[0].to)">
              <span class="work-summary-label">{{ work[0].label }}</span>
              <span class="work-summary-right">
                <strong class="work-summary-count">{{ work[0].count }}</strong><IssueIcon v-if="work[0].to" name="arrow" />
              </span>
            </component>
            <div v-if="work.length > 1" class="work-list">
              <component :is="item.to ? RouterLink : 'div'" v-for="item in work.slice(1)" :id="item.id" :key="item.id"
                class="work-row" :to="item.to" @click="remember($event, item.id, item.to)">
                <span>{{ item.label }}<span v-if="item.shared" class="shared-label">共享</span></span>
                <span class="work-summary-right"><strong>{{ item.count }}</strong><IssueIcon v-if="item.to" name="arrow" /></span>
              </component>
            </div>
          </section>
          <section class="snapshot-cell" aria-labelledby="dashboard-status-title">
            <div class="panel-heading">
              <h2 id="dashboard-status-title">状态分布</h2><span class="panel-scope">{{ scopeLabels[stats.role] }} · {{ total }} 条</span>
            </div>
            <div class="status-bar" aria-hidden="true">
              <span v-for="item in distribution.filter(entry => entry.count > 0)" :key="item.state"
                class="status-part" :data-status="item.state" :style="{ flex: item.count }"></span>
            </div>
            <div class="status-rows">
              <component :is="item.to ? RouterLink : 'div'" v-for="item in distribution" :id="item.id" :key="item.state"
                class="status-row" :to="item.to" @click="remember($event, item.id, item.to)">
                <span class="status-dot" :data-status="item.state" aria-hidden="true"></span><span>{{ item.label }}</span>
                <strong>{{ item.count }}</strong><IssueIcon v-if="item.to" name="arrow" />
              </component>
            </div>
          </section>
        </div>
        <DashboardActivity :value="stats.activity" :selection="selection" :loading="busy" :error="problem"
          @select="select" @retry="retry" />
      </template>
      <p v-else-if="busy" class="dash-panel dash-state" role="status">正在读取统计…</p>
      <section v-else-if="forbidden" class="dash-panel dash-state">
        <h2>当前账号无权访问</h2>
        <p>请联系管理员分配角色。</p>
      </section>
      <section v-else class="dash-panel dash-state">
        <h2>统计读取失败</h2><p role="alert">{{ problem }}</p>
        <button v-if="invalidRange" type="button" class="admin-button" @click="select({ kind: '7' })">恢复最近 7 天</button>
        <button v-else ref="initialRetry" type="button" class="admin-button" @click="retry">重新加载</button>
      </section>
    </div>
  </AccountWorkspace>
</template>
