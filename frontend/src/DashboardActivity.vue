<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import DashboardChart from './DashboardChart.vue'
import { activityKinds, activityLabels, type DashboardActivity, type DashboardRange } from './dashboardApi'

const props = defineProps<{
  value: DashboardActivity
  selection: DashboardRange
  loading: boolean
  error: string
}>()
const emit = defineEmits<{ select: [DashboardRange]; retry: [] }>()
const options = [{ kind: '7', label: '最近 7 天' }, { kind: '30', label: '最近 30 天' }, { kind: 'custom', label: '自选日期' }] as const
const editing = ref(false)
const start = ref('')
const end = ref('')
const startInput = ref<HTMLInputElement>()
const endInput = ref<HTMLInputElement>()
const errorText = ref<HTMLElement>()
const retryButton = ref<HTMLButtonElement>()
const rangeChoices = ref<HTMLElement>()
const fieldError = ref('')
const invalid = ref<'start' | 'end'>()
const dayMs = 86_400_000

const caption = computed(() => {
  let from = props.value.start
  let to = props.value.end
  if (props.loading || props.error) {
    const range = props.selection
    if (range.kind === 'custom') {
      from = range.start
      to = range.end
    } else {
      to = props.value.today
      from = new Date(Date.parse(to) - (Number(range.kind) - 1) * dayMs).toISOString().slice(0, 10)
    }
  }
  return from.replaceAll('-', '.') + ' – ' + to.replaceAll('-', '.')
})

watch(() => props.error, async error => {
  if (!error) return
  await nextTick()
  retryButton.value?.focus({ preventScroll: true })
})

function clearError() {
  fieldError.value = ''
  invalid.value = undefined
}

async function choose(kind: DashboardRange['kind']) {
  clearError()
  if (kind !== 'custom') {
    editing.value = false
    emit('select', { kind })
    return
  }
  start.value = props.selection.kind === 'custom' ? props.selection.start : props.value.start
  end.value = props.selection.kind === 'custom' ? props.selection.end : props.value.end
  editing.value = true
  await nextTick()
  startInput.value?.focus()
}

async function closeDates() {
  editing.value = false
  await nextTick()
  rangeChoices.value?.querySelector<HTMLButtonElement>('[data-range="custom"]')?.focus({ preventScroll: true })
}

async function applyDates() {
  clearError()
  const from = startInput.value?.valueAsNumber ?? NaN
  const to = endInput.value?.valueAsNumber ?? NaN
  const today = Date.parse(props.value.today)
  if (!start.value || !end.value || !Number.isFinite(from) || !Number.isFinite(to)) {
    invalid.value = Number.isFinite(from) ? 'end' : 'start'
    fieldError.value = '请选择开始日期和结束日期。'
  } else if (from > today || to > today) {
    invalid.value = from > today ? 'start' : 'end'
    fieldError.value = '日期不能晚于今天。'
  } else if (to < from) {
    invalid.value = 'end'
    fieldError.value = '结束日期不能早于开始日期。'
  }
  if (fieldError.value) {
    await nextTick()
    const field = invalid.value === 'start' ? startInput.value : endInput.value
    field?.focus({ preventScroll: true })
    errorText.value?.scrollIntoView({ block: 'nearest' })
    return
  }
  emit('select', { kind: 'custom', start: start.value, end: end.value })
  await closeDates()
}
</script>

<template>
  <section class="dash-panel activity-panel" aria-labelledby="activity-title">
    <div class="activity-head">
      <div>
        <h2 id="activity-title">近期进度</h2>
        <p class="dash-hint">按反馈和验证的发生日期统计，反馈按轮计。{{ value.buckets.some(bucket => bucket.start !== bucket.end) ? '长区间分段显示。' : '' }}</p>
      </div>
      <div ref="rangeChoices" class="range-choices" role="group" aria-label="统计日期">
        <button v-for="option in options" :key="option.kind" type="button" :data-range="option.kind"
          :aria-pressed="selection.kind === option.kind" :aria-expanded="option.kind === 'custom' ? editing : undefined"
          @click="choose(option.kind)">{{ option.label }}</button>
      </div>
    </div>
    <form v-if="editing" class="date-editor" novalidate @submit.prevent="applyDates">
      <div class="form-field">
        <label for="dashboard-date-start">开始日期</label>
        <input id="dashboard-date-start" ref="startInput" v-model="start" type="date" :max="value.today"
          :aria-invalid="invalid === 'start' || undefined" :aria-describedby="invalid === 'start' ? 'dashboard-date-error' : undefined"
          required @input="clearError">
      </div>
      <div class="form-field">
        <label for="dashboard-date-end">结束日期</label>
        <input id="dashboard-date-end" ref="endInput" v-model="end" type="date" :max="value.today"
          :aria-invalid="invalid === 'end' || undefined" :aria-describedby="invalid === 'end' ? 'dashboard-date-error' : undefined"
          required @input="clearError">
      </div>
      <div class="date-action">
        <button class="admin-button" type="button" @click="closeDates">取消</button>
        <button class="admin-primary" type="submit">应用</button>
      </div>
      <p v-if="fieldError" id="dashboard-date-error" ref="errorText" role="alert">{{ fieldError }}</p>
    </form>
    <div class="activity-summary">
      <dl v-if="!loading && !error" class="totals">
        <div v-for="key in activityKinds" :key="key">
          <dt><span class="series-mark" :data-series="key" aria-hidden="true"></span>{{ activityLabels[key] }}</dt>
          <dd>{{ value.totals[key] }} {{ key === 'feedback' ? '轮' : '次' }}</dd>
        </div>
      </dl>
      <p class="range-caption">{{ caption }}</p>
    </div>
    <p v-if="loading" class="dash-inline-state" role="status">正在读取所选日期…</p>
    <div v-else-if="error" class="dash-inline-state">
      <p role="alert">{{ error }}</p>
      <button ref="retryButton" class="admin-button" type="button" @click="emit('retry')">按原日期重试</button>
    </div>
    <DashboardChart v-else :buckets="value.buckets" :today="value.today" />
  </section>
</template>
