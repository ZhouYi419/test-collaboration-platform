<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import AccountWorkspace from './AccountWorkspace.vue'
import IssueEditor from './IssueEditor.vue'
import { ApiError, authApi, errorMessage, type User } from './api'
import {
  fieldsByType, fileSize, issueDate, issuesApi, statusLabels, typeLabels,
  type Attachment, type IssueDetail, type IssueSummary,
} from './issuesApi'

const router = useRouter()
const route = useRoute()
const user = ref<User | null>(null)
const items = ref<IssueSummary[]>([])
const detail = ref<IssueDetail | null>(null)
const busy = ref(true)
const failure = ref<{ message: string; status: number }>()
const downloadError = ref('')
const editor = ref<InstanceType<typeof IssueEditor>>()
const view = ref<HTMLElement>()
const changedId = ref('')
const notice = ref('')
const itemId = computed(() => String(route.params.issueId ?? ''))
const specifics = computed(() => detail.value?.type
  ? fieldsByType[detail.value.type].filter(field => detail.value?.form[field.key])
  : [])
let listPosition: { path: string; scroll: number } | undefined
let noticeTimer: ReturnType<typeof setTimeout> | undefined
let loadVersion = 0

async function load() {
  const version = ++loadVersion
  const target = itemId.value
  busy.value = true
  failure.value = undefined
  detail.value = null
  downloadError.value = ''
  if (target) {
    notice.value = ''
    changedId.value = ''
  }
  try {
    const profile = await authApi.me()
    if (version !== loadVersion) return
    user.value = profile
    if (profile.role !== 'tester') {
      failure.value = { message: '我的事项仅向测试人员开放。', status: 403 }
    } else if (!target) {
      const result = await issuesApi.list()
      if (version === loadVersion) items.value = result
    } else if (target !== 'new') {
      const result = await issuesApi.get(target)
      if (version === loadVersion) detail.value = result
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
  const previous = listPosition
  if (!target) listPosition = undefined
  if (!target && previous && !notice.value) {
    const origin = view.value?.querySelector<HTMLElement>(`a[href=${CSS.escape(previous.path)}]`)
    if (origin) {
      window.scrollTo(0, previous.scroll)
      origin.focus({ preventScroll: true })
      return
    }
  }
  window.scrollTo(0, 0)
  view.value?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true })
}

function login() {
  return router.replace('/login')
}

function showSaved(id: string, message: string) {
  changedId.value = id
  notice.value = message
  listPosition = undefined
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { notice.value = '' }, 3300)
  void router.push('/issues')
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
  if (!from.params.issueId && to.params.issueId) listPosition = { path: to.path, scroll: window.scrollY }
  return true
})
onBeforeRouteLeave(() => editor.value?.confirmLeave())
onUnmounted(() => {
  loadVersion++
  clearTimeout(noticeTimer)
})
watch(itemId, load, { immediate: true })
</script>

<template>
  <AccountWorkspace :user="user" class="issue-workspace">
    <div ref="view" :class="{ 'issue-reading': itemId && !failure }">
      <template v-if="failure">
        <div class="issue-head">
          <h1 tabindex="-1">{{ failure.status === 403 ? '无权访问' : failure.status === 404 ? '事项不可用' : '我的事项' }}</h1>
        </div>
        <div class="issue-empty">
          <p role="alert">{{ failure.message }}</p>
          <RouterLink v-if="failure.status === 403" class="admin-button create-button" to="/account">返回我的账号</RouterLink>
          <RouterLink v-else-if="failure.status === 404" class="admin-button create-button" to="/issues">返回我的事项</RouterLink>
          <button v-else type="button" class="admin-button" @click="load">重新加载</button>
        </div>
      </template>

      <template v-else-if="busy">
        <div class="issue-head"><h1 tabindex="-1">我的事项</h1></div>
        <p class="issue-empty" role="status">正在加载事项…</p>
      </template>

      <template v-else-if="!itemId">
        <div class="issue-head">
          <h1 tabindex="-1">我的事项</h1>
          <RouterLink class="admin-primary create-button" to="/issues/new"><span aria-hidden="true">+</span>新建事项</RouterLink>
        </div>
        <table v-if="items.length" class="issue-table" aria-label="我的事项">
          <colgroup><col><col><col><col><col></colgroup>
          <thead><tr><th scope="col">标题</th><th scope="col">类型</th><th scope="col">优先级</th><th scope="col">状态</th><th scope="col">更新时间</th></tr></thead>
          <tbody>
            <tr v-for="item in items" :key="item.id" :class="{ 'recently-changed': changedId === item.id }">
              <th scope="row"><RouterLink class="issue-title" :to="`/issues/${item.id}`">{{ item.title || '未命名草稿' }}</RouterLink></th>
              <td class="issue-type">{{ item.type ? typeLabels[item.type] : '未选择' }}</td>
              <td>
                <span v-if="item.priority" class="issue-priority" :class="{ 'is-urgent': item.priority === 'P0' }">{{ item.priority }}</span>
                <span v-else class="unset-priority" aria-label="未选择优先级">—</span>
              </td>
              <td><span class="issue-state" :class="{ 'is-draft': item.status === 'draft' }">{{ statusLabels[item.status] }}</span></td>
              <td class="issue-time"><time :datetime="new Date(item.updated_at).toISOString()">{{ issueDate(item.updated_at) }}</time></td>
            </tr>
          </tbody>
        </table>
        <div v-else class="issue-empty"><h2>暂无事项</h2></div>
      </template>

      <template v-else>
        <RouterLink class="back-link" to="/issues"><span aria-hidden="true">←</span> 我的事项</RouterLink>
        <template v-if="itemId === 'new' || detail?.status === 'draft'">
          <div class="issue-head form-head">
            <h1 tabindex="-1">{{ detail ? '编辑草稿' : '新建事项' }}</h1>
            <p class="reporter">申请人<strong>{{ user?.username }}</strong></p>
          </div>
          <IssueEditor :key="itemId" ref="editor" :issue="detail" @saved="showSaved" @expired="login" />
        </template>
        <template v-else-if="detail">
          <div class="detail-head">
            <span class="issue-state">{{ statusLabels[detail.status] }}</span>
            <h1 tabindex="-1">{{ detail.title }}</h1>
          </div>
          <dl class="detail-summary">
            <div><dt>申请类型</dt><dd>{{ detail.type && typeLabels[detail.type] }}</dd></div>
            <div><dt>申请人</dt><dd>{{ user?.username }}</dd></div>
            <div><dt>优先级</dt><dd class="issue-priority" :class="{ 'is-urgent': detail.priority === 'P0' }">{{ detail.priority }}</dd></div>
            <div><dt>更新时间</dt><dd>{{ issueDate(detail.updated_at) }}</dd></div>
          </dl>
          <section class="detail-section">
            <h2>详细描述</h2><p class="detail-text">{{ detail.form.description }}</p>
          </section>
          <section class="detail-section">
            <h2>{{ detail.type === 'bug' ? '复现信息' : '需求信息' }}</h2>
            <dl class="detail-grid">
              <div v-for="field in specifics" :key="field.key" :class="{ wide: field.multiline && !field.pair }">
                <dt>{{ field.label }}</dt><dd>{{ detail.form[field.key] }}</dd>
              </div>
            </dl>
          </section>
          <section class="detail-section">
            <h2>{{ detail.attachments.length ? `附件（${detail.attachments.length}）` : '附件' }}</h2>
            <ul v-if="detail.attachments.length" class="file-list">
              <li v-for="file in detail.attachments" :key="file.id">
                <div class="file-name">
                  <button type="button" class="file-download" @click="download(file)">{{ file.name }}</button>
                  <span class="file-size">{{ fileSize(file.size) }}</span>
                </div>
              </li>
            </ul>
            <p v-else class="file-hint">无附件</p>
            <p v-if="downloadError" class="field-error file-error" role="alert">{{ downloadError }}</p>
          </section>
        </template>
      </template>
    </div>
    <div class="issue-notice" role="status">{{ notice }}</div>
  </AccountWorkspace>
</template>

<style src="./issues.css"></style>
