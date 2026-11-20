<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { ApiError, errorMessage } from './api'
import ConfirmDialog from './ConfirmDialog.vue'
import { issuesApi, type IssueDetail, type VerificationOutcome } from './issuesApi'

const props = defineProps<{ issue: IssueDetail }>()
const emit = defineEmits<{
  updated: [issue: IssueDetail, outcome: VerificationOutcome]
  refreshed: [issue: IssueDetail]
  unavailable: []
  expired: []
}>()

const returning = ref(false)
const reason = ref('')
const fieldError = ref('')
const error = ref('')
const busy = ref(false)
const conflict = ref(false)
const heading = ref<HTMLElement>()
const reasonInput = ref<HTMLTextAreaElement>()
const returnButton = ref<HTMLButtonElement>()
const passButton = ref<HTMLButtonElement>()
const submitButton = ref<HTMLButtonElement>()
const reloadButton = ref<HTMLButtonElement>()
const confirmation = ref<InstanceType<typeof ConfirmDialog>>()
let retry: { outcome: VerificationOutcome; reason: string | null; writeId: string } | undefined

function focus(element: HTMLElement | undefined) {
  element?.focus({ preventScroll: true })
  element?.scrollIntoView({ block: 'nearest' })
}

function focusHeading() {
  heading.value?.focus({ preventScroll: true })
  heading.value?.scrollIntoView({ block: 'start' })
}

async function confirmLeave() {
  if (busy.value) return false
  if (!reason.value.trim()) return true
  return confirmation.value?.ask({
    title: '放弃退回原因？', message: '已经输入的原因将被清除。', label: '放弃修改',
  }) ?? false
}

defineExpose({ focusHeading, confirmLeave })

function beforeUnload(event: BeforeUnloadEvent) {
  if (busy.value || reason.value.trim()) event.preventDefault()
}

onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onUnmounted(() => window.removeEventListener('beforeunload', beforeUnload))

async function openReturn() {
  if (busy.value) return
  returning.value = true
  error.value = ''
  await nextTick()
  focus(reasonInput.value)
}

async function cancelReturn() {
  if (!await confirmLeave()) return
  reset()
  await nextTick()
  focus(returnButton.value)
}

function reset() {
  returning.value = false
  reason.value = ''
  fieldError.value = ''
  error.value = ''
  conflict.value = false
  retry = undefined
}

async function pass() {
  if (busy.value || conflict.value) return
  if (await confirmation.value?.ask({
    title: '通过验证并关闭？', message: '事项关闭后，提交人和负责人仍可查看验证结果。', label: '确认关闭',
  })) await submit('passed')
}

async function submit(outcome: VerificationOutcome) {
  if (busy.value || conflict.value) return
  fieldError.value = ''
  error.value = ''
  const text = outcome === 'returned' ? reason.value.trim() : null
  if (outcome === 'returned' && !text) {
    fieldError.value = '请填写退回原因'
    await nextTick()
    focus(reasonInput.value)
    return
  }
  if (retry?.outcome !== outcome || retry.reason !== text) {
    retry = { outcome, reason: text, writeId: crypto.randomUUID() }
  }
  busy.value = true
  try {
    const result = await issuesApi.verify(props.issue.id, outcome, props.issue.version, retry.writeId, text)
    reset()
    emit('updated', result, outcome)
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) {
      reset()
      emit('expired')
      return
    }
    if (cause instanceof ApiError && [403, 404, 409].includes(cause.status)) {
      conflict.value = true
      error.value = cause.status === 409 ? '事项已更新。请重新加载后查看当前验证结果。' : cause.message
      await nextTick()
      focus(reloadButton.value)
      return
    }
    if (cause instanceof ApiError && cause.fields.reason) {
      fieldError.value = cause.fields.reason
      await nextTick()
      focus(reasonInput.value)
      return
    }
    error.value = errorMessage(cause)
    await nextTick()
    focus(outcome === 'returned' ? submitButton.value : passButton.value)
  } finally {
    busy.value = false
  }
}

async function reload() {
  if (busy.value) return
  busy.value = true
  try {
    const result = await issuesApi.get(props.issue.id)
    reset()
    emit('refreshed', result)
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) {
      reset()
      emit('expired')
    } else if (cause instanceof ApiError && [403, 404].includes(cause.status)) {
      reset()
      emit('unavailable')
    } else {
      error.value = errorMessage(cause)
      await nextTick()
      focus(reloadButton.value)
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="detail-section verification-controls">
    <h2 ref="heading" tabindex="-1">测试验证</h2>
    <form class="verification-form" novalidate @submit.prevent="submit('returned')">
      <div v-if="returning" class="form-field wide">
        <label for="verification-reason">退回原因<span class="required" aria-hidden="true">*</span></label>
        <textarea id="verification-reason" ref="reasonInput" v-model="reason" maxlength="5000" :readonly="busy || conflict"
          aria-required="true" :aria-invalid="!!fieldError" :aria-describedby="fieldError ? 'verification-reason-error' : undefined"
          @input="fieldError = ''"></textarea>
        <p v-if="fieldError" id="verification-reason-error" class="field-error">{{ fieldError }}</p>
      </div>
      <p v-if="error" class="action-error" role="alert">{{ error }}</p>
      <div class="action-buttons">
        <button v-if="conflict" ref="reloadButton" type="button" class="admin-button" :aria-disabled="busy || undefined" @click="reload">
          {{ busy ? '加载中…' : '重新加载' }}
        </button>
        <template v-else-if="returning">
          <button type="button" class="admin-button" :aria-disabled="busy || undefined" @click="cancelReturn">取消</button>
          <button ref="submitButton" type="submit" class="admin-primary workflow-submit" :aria-disabled="busy || undefined">
            <span :class="{ 'inactive-label': busy }" :aria-hidden="busy">退回开发</span>
            <span :class="{ 'inactive-label': !busy }" :aria-hidden="!busy">提交中…</span>
          </button>
        </template>
        <template v-else>
          <button ref="returnButton" type="button" class="admin-button" :aria-disabled="busy || undefined" @click="openReturn">验证不通过</button>
          <button ref="passButton" type="button" class="admin-primary workflow-submit" :aria-disabled="busy || undefined" @click="pass">
            <span :class="{ 'inactive-label': busy }" :aria-hidden="busy">通过并关闭</span>
            <span :class="{ 'inactive-label': !busy }" :aria-hidden="!busy">提交中…</span>
          </button>
        </template>
      </div>
    </form>
  </section>
  <ConfirmDialog ref="confirmation" />
</template>
