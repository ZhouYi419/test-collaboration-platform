<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import IssueIcon from './IssueIcon.vue'
import { defaultIssueFilters, issueSearchLimit, issueSortLabels, priorityOptions, statusLabels, typeLabels,
  type IssueFilters, type IssueStatus } from './issuesApi'

const props = defineProps<{ filters: IssueFilters; statuses: readonly IssueStatus[] }>()
const emit = defineEmits<{ apply: [filters: IssueFilters] }>()
const fields = reactive({ ...props.filters })
const expanded = ref(false)
const filterCount = computed(() => [
  props.filters.type, props.filters.priority, props.filters.status, props.filters.sort !== 'recent',
].filter(Boolean).length)

watch(() => props.filters, value => Object.assign(fields, value))

function apply(filters: IssueFilters) {
  expanded.value = false
  const selection = { ...filters, q: filters.q.trim() }
  Object.assign(fields, selection)
  emit('apply', selection)
}
</script>

<template>
  <form class="issue-query" aria-label="查询事项" @submit.prevent="apply(fields)">
    <div class="form-field query-keyword">
      <label for="query-keyword">关键词</label>
      <input id="query-keyword" v-model="fields.q" type="search" :maxlength="issueSearchLimit" placeholder="搜索标题或详细描述">
    </div>
    <div id="query-filters" class="query-filters" :data-expanded="expanded">
      <div class="form-field query-field">
        <label for="query-type">类型</label>
        <div class="select-control">
          <select id="query-type" v-model="fields.type">
            <option value="">全部类型</option>
            <option v-for="(label, value) in typeLabels" :key="value" :value="value">{{ label }}</option>
          </select>
        </div>
      </div>
      <div class="form-field query-field">
        <label for="query-priority">优先级</label>
        <div class="select-control">
          <select id="query-priority" v-model="fields.priority">
            <option value="">全部优先级</option>
            <option v-for="value in priorityOptions" :key="value" :value="value">{{ value }}</option>
          </select>
        </div>
      </div>
      <div v-if="statuses.length > 1" class="form-field query-field">
        <label for="query-status">状态</label>
        <div class="select-control">
          <select id="query-status" v-model="fields.status" name="status">
            <option value="">全部状态</option>
            <option v-for="value in statuses" :key="value" :value="value">{{ statusLabels[value] }}</option>
          </select>
        </div>
      </div>
      <div class="form-field query-field">
        <label for="query-sort">排序</label>
        <div class="select-control">
          <select id="query-sort" v-model="fields.sort">
            <option v-for="(label, value) in issueSortLabels" :key="value" :value="value">{{ label }}</option>
          </select>
        </div>
      </div>
    </div>
    <button class="query-submit admin-primary" type="submit">查询</button>
    <button class="query-clear admin-button" type="button" @click="apply(defaultIssueFilters)">清空</button>
    <button class="query-toggle" type="button" aria-controls="query-filters" :aria-expanded="expanded" @click="expanded = !expanded">
      筛选和排序<span v-if="filterCount" class="query-count">（{{ filterCount }}）</span><IssueIcon name="chevron" />
    </button>
  </form>
</template>
