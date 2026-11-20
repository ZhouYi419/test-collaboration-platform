<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { ApiError, errorMessage } from './api'
import ConfirmDialog from './ConfirmDialog.vue'
import { issuesApi, type IssueDetail, type WorkflowAction } from './issuesApi'

const props = defineProps<{ issue: IssueDetail }>()
const emit = defineEmits<{ updated: [issue: IssueDetail, action: WorkflowAction]; unavailable: [message: string]; expired: [] }>()
const feedback = ref('')
const error = ref('')
const fieldError = ref('')
const busy = ref(false)
const panel = ref<HTMLElement>()
const input = ref<HTMLTextAreaElement>()
const actionButton = ref<HTMLButtonElement>()
const confirmation = ref<InstanceType<typeof ConfirmDialog>>()
let retry: { action: WorkflowAction; writeId: string; feedback: string } | undefined
const action = computed<WorkflowAction>(() => ({
  pending_claim: 'claim', pending_work: 'start', in_progress: 'finish',
} as const)[props.issue.status as 'pending_claim' | 'pending_work' | 'in_progress'])
const buttonText = computed(() => ({ claim: '领取事项', start: '开始处理', finish: '提交处理结果' })[action.value])
const busyText = computed(() => ({ claim: '领取中…', start: '更新中…', finish: '提交中…' })[action.value])

async function confirmLeave() {
  if (busy.value) return false
  if (!feedback.value) return true
  return confirmation.value?.ask({ title: '放弃本次修改？', message: '本次修改尚未保存。', label: '放弃修改' }) ?? false
}

function focusInput() {
  input.value?.focus({ preventScroll: true })
  panel.value?.scrollIntoView({ block: 'nearest' })
  input.value?.scrollIntoView({ block: 'nearest' })
}

function focusAction() {
  actionButton.value?.focus({ preventScroll: true })
  panel.value?.scrollIntoView({ block: 'nearest' })
  actionButton.value?.scrollIntoView({ block: 'nearest' })
}
defineExpose({ confirmLeave, focusInput, focusAction })

function beforeUnload(event: BeforeUnloadEvent) {
  if (feedback.value || busy.value) event.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onUnmounted(() => {
  window.removeEventListener('beforeunload', beforeUnload)
})

async function submit() {
  if (busy.value) return
  fieldError.value = ''
  error.value = ''
  const operation = action.value
  if (operation === 'finish' && !feedback.value.trim()) {
    fieldError.value = '请填写处理说明'
    await nextTick()
    focusInput()
    return
  }
  if (operation === 'claim' && !await confirmation.value?.ask({
    title: '领取事项？', message: '领取后，你将成为该事项的负责人。', label: '确认领取',
  })) return
  busy.value = true
  if (retry?.action !== operation || retry.feedback !== feedback.value) {
    retry = { action: operation, writeId: crypto.randomUUID(), feedback: feedback.value }
  }
  try {
    const updated = await issuesApi.act(props.issue.id, operation, props.issue.version, retry.writeId, feedback.value)
    feedback.value = ''
    busy.value = false
    retry = undefined
    emit('updated', updated, operation)
  } catch (cause) {
    busy.value = false
    if (cause instanceof ApiError && cause.status === 401) {
      feedback.value = ''
      emit('expired')
      return
    }
    if (cause instanceof ApiError && cause.code === 'claim_unavailable') {
      emit('unavailable', cause.message)
      return
    }
    if (cause instanceof ApiError && cause.fields.feedback) {
      fieldError.value = cause.fields.feedback
      await nextTick()
      focusInput()
      return
    }
    error.value = errorMessage(cause)
    await nextTick()
    focusAction()
  }
}
</script>

<template>
  <form :id="action === 'finish' ? 'process-form' : undefined" ref="panel" class="workflow-panel"
    :class="{ 'workflow-actions': action !== 'finish' }" novalidate
    @submit.prevent="submit">
    <section v-if="action === 'finish'" class="detail-section workflow-feedback">
      <h2>{{ issue.latest_verification ? '重新提交反馈' : '处理反馈' }}</h2>
      <div class="form-field wide">
        <label for="feedback">处理说明<span class="required" aria-hidden="true">*</span></label>
        <textarea id="feedback" ref="input" v-model="feedback" maxlength="5000" :disabled="busy" aria-required="true"
          :aria-invalid="!!fieldError" :aria-describedby="fieldError ? 'feedback-error' : undefined"
          @input="fieldError = ''"></textarea>
        <p v-if="fieldError" id="feedback-error" class="field-error">{{ fieldError }}</p>
      </div>
    </section>
    <div class="form-actions">
      <p v-if="error" class="action-error" role="alert">{{ error }}</p>
      <div class="action-buttons">
        <button ref="actionButton" class="admin-primary workflow-submit" type="submit"
          :aria-disabled="busy || undefined">
          <span :class="{ 'inactive-label': busy }" :aria-hidden="busy">{{ buttonText }}</span>
          <span :class="{ 'inactive-label': !busy }" :aria-hidden="!busy">{{ busyText }}</span>
        </button>
      </div>
    </div>
  </form>
  <ConfirmDialog ref="confirmation" />
</template>
