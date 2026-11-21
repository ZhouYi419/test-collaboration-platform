<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { activityKinds, activityLabels, type ActivityBucket } from './dashboardApi'

const props = defineProps<{ buckets: ActivityBucket[]; today: string }>()
const plot = ref<HTMLElement>()
const active = ref(0)
const current = computed(() => props.buckets[active.value] ?? props.buckets.at(-1))
const maxValue = computed(() => Math.max(0, ...props.buckets.flatMap(bucket => activityKinds.map(key => bucket[key]))))
const increment = computed(() => Math.max(1, Math.ceil(maxValue.value / 4)))
const ticks = computed(() => [4, 3, 2, 1, 0].map(unit => unit * increment.value))
const maximum = computed(() => increment.value * 4)
const tickInterval = computed(() => Math.max(1, Math.ceil(props.buckets.length / 6)))

watch(() => props.buckets, buckets => { active.value = buckets.length - 1 }, { immediate: true })

function shortDay(date: string) {
  const [year, month, day] = date.split('-')
  const short = Number(month) + '.' + Number(day)
  return year === props.today.slice(0, 4) ? short : year + '.' + short
}

function bucketLabel(bucket: ActivityBucket) {
  return bucket.start === bucket.end ? shortDay(bucket.start) : shortDay(bucket.start) + ' – ' + shortDay(bucket.end)
}

function counts(bucket: ActivityBucket) {
  return activityKinds.map(key => activityLabels[key] + ' ' + bucket[key]).join(' · ')
}

function move(event: KeyboardEvent, from: number) {
  const last = props.buckets.length - 1
  const targets: Record<string, number> = {
    ArrowLeft: Math.max(0, from - 1), ArrowRight: Math.min(last, from + 1), Home: 0, End: last,
  }
  if (!Object.hasOwn(targets, event.key)) return
  event.preventDefault()
  const destination = targets[event.key]
  if (destination === undefined) return
  active.value = destination
  plot.value?.querySelector<HTMLButtonElement>('[data-point="' + destination + '"]')?.focus({ preventScroll: true })
}
</script>

<template>
  <p v-if="!maxValue" class="chart-empty">所选日期内暂无反馈或验证记录</p>
  <template v-else>
    <div class="plot" :style="{ '--buckets': buckets.length }">
      <div class="axis" aria-hidden="true"><span v-for="tick in ticks" :key="tick">{{ tick }}</span></div>
      <div class="plot-area">
        <div ref="plot" class="plot-bars" role="group" aria-label="反馈与验证趋势">
          <button v-for="(bucket, index) in buckets" :key="bucket.start" class="plot-column" type="button"
            :data-point="index" :tabindex="index === active ? 0 : -1" :aria-pressed="index === active"
            :aria-label="bucketLabel(bucket) + ' ' + counts(bucket)"
            @click="active = index" @keydown="move($event, index)">
            <span v-for="key in activityKinds" :key="key" class="bar" :data-series="key" aria-hidden="true"
              :style="{ '--height': (100 * bucket[key] / maximum) + '%' }"></span>
          </button>
        </div>
      </div>
      <div class="plot-days" aria-hidden="true">
        <span v-for="(bucket, index) in buckets" :key="bucket.start">
          {{ index % tickInterval === 0 || index === buckets.length - 1 ? bucket.start.slice(5).replace('-', '.') : '' }}
        </span>
      </div>
    </div>
    <p v-if="current" class="chart-readout"><strong>{{ bucketLabel(current) }}</strong>{{ counts(current) }}</p>
    <details class="data-details">
      <summary>查看数据</summary>
      <table class="data-table" aria-label="反馈与验证趋势数据">
        <thead><tr><th scope="col">日期</th><th v-for="key in activityKinds" :key="key" scope="col">{{ activityLabels[key] }}</th></tr></thead>
        <tbody>
          <tr v-for="bucket in buckets" :key="bucket.start">
            <th scope="row">{{ bucketLabel(bucket) }}</th><td v-for="key in activityKinds" :key="key">{{ bucket[key] }}</td>
          </tr>
        </tbody>
      </table>
    </details>
  </template>
</template>
