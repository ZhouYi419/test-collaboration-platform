<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue'
import { ApiError, errorMessage } from './api'
import IssueIcon from './IssueIcon.vue'
import { issueDate, issuesApi, type IssueRound } from './issuesApi'

const props = defineProps<{ issueId: string; version: number }>()
const emit = defineEmits<{ expired: [] }>()
const panel = ref<HTMLDetailsElement>()
const summary = ref<HTMLElement>()
const body = ref<HTMLElement>()
const rounds = ref<IssueRound[]>()
const busy = ref(false)
const failure = ref('')
const outcomes = { pending: '待验证', passed: '验证通过', returned: '验证未通过，已退回' }
let controller: AbortController | undefined

function focus(selector: string) {
  const target = body.value?.querySelector<HTMLElement>(selector)
  target?.focus({ preventScroll: true })
  target?.scrollIntoView({ block: 'nearest' })
}

async function load(trigger: 'open' | 'retry' | 'refresh' = 'open') {
  if (busy.value) return
  const request = new AbortController()
  controller = request
  busy.value = true
  failure.value = ''
  try {
    const result = await issuesApi.history(props.issueId, request.signal)
    if (request.signal.aborted) return
    rounds.value = result
  } catch (cause) {
    if (request.signal.aborted) return
    if (cause instanceof ApiError && cause.status === 401) {
      emit('expired')
      return
    }
    failure.value = errorMessage(cause)
  } finally {
    if (!request.signal.aborted) busy.value = false
  }
  await nextTick()
  if (request.signal.aborted || !panel.value?.open || trigger === 'refresh') return
  if (failure.value) focus('.history-feedback button')
  else if (trigger === 'retry') focus(rounds.value?.length ? 'h3' : '.history-feedback')
  else if (summary.value && summary.value.getBoundingClientRect().top > innerHeight * 0.64) {
    summary.value.scrollIntoView({ block: 'start' })
  }
}

function toggle() {
  if (panel.value?.open && !rounds.value && !failure.value) void load()
}

watch(() => props.version, () => {
  controller?.abort()
  rounds.value = undefined
  failure.value = ''
  busy.value = false
  if (panel.value?.open) void load('refresh')
})
onUnmounted(() => controller?.abort())
</script>

<template>
  <details ref="panel" class="issue-history" @toggle="toggle">
    <summary ref="summary" class="history-toggle"><h2>处理与验证历史</h2><IssueIcon name="chevron" /></summary>
    <div ref="body" class="history-body" :aria-busy="busy || undefined">
      <p v-if="busy" class="history-feedback" role="status">正在加载历史…</p>
      <div v-else-if="failure" class="history-feedback">
        <p role="alert">{{ failure }}</p>
        <button type="button" class="admin-button" @click="load('retry')">重新加载</button>
      </div>
      <p v-else-if="rounds && !rounds.length" class="history-feedback" tabindex="-1">暂无处理与验证历史。</p>
      <ol v-else-if="rounds" class="history-rounds">
        <li v-for="round in rounds" :key="round.number" class="history-round">
          <div class="history-round-header">
            <h3 tabindex="-1">第 {{ round.number }} 轮</h3>
            <span class="history-round-status" :data-outcome="round.verification?.outcome ?? 'pending'">
              {{ outcomes[round.verification?.outcome ?? 'pending'] }}
            </span>
          </div>
          <div class="history-round-content">
            <div>
              <h4>处理反馈</h4>
              <p class="detail-text">{{ round.feedback }}</p>
              <p class="history-round-meta">{{ round.developer.username }} ·
                <time :datetime="new Date(round.feedback_at).toISOString()">{{ issueDate(round.feedback_at) }}</time>
              </p>
            </div>
            <div v-if="round.verification">
              <h4>验证结果</h4>
              <p v-if="round.verification.reason" class="detail-text">{{ round.verification.reason }}</p>
              <p class="history-round-meta">{{ round.verification.tester.username }} ·
                <time :datetime="new Date(round.verification.verified_at).toISOString()">{{ issueDate(round.verification.verified_at) }}</time>
              </p>
            </div>
          </div>
        </li>
      </ol>
    </div>
  </details>
</template>
