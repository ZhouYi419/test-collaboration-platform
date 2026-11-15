<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AccountWorkspace from './AccountWorkspace.vue'
import {
  adminApi, ApiError, authApi, errorMessage, roleLabels,
  type AccountStatus, type AccountUpdate, type ManagedAccount, type MemberRole, type User,
} from './api'

const statusLabels: Record<AccountStatus, string> = {
  pending: '待启用',
  active: '已启用',
  disabled: '已停用',
}

const router = useRouter()
const props = defineProps<{ authorization?: boolean }>()
const title = computed(() => props.authorization ? '管理员授权' : '账号管理')
const viewer = ref<User | null>(null)
const accounts = ref<ManagedAccount[]>([])
const page = ref(1)
const retryPage = ref(1)
const hasNext = ref(false)
const loaded = ref(false)
const loading = ref(false)
const denied = ref(false)
const message = ref('')
const notice = ref('')
const pageHeading = ref<HTMLElement | null>(null)
const dialog = ref<HTMLDialogElement | null>(null)
const roleField = ref<HTMLFieldSetElement | null>(null)
const cancelButton = ref<HTMLButtonElement | null>(null)
const saveButton = ref<HTMLButtonElement | null>(null)
const editing = ref<ManagedAccount | null>(null)
const selectedRole = ref<MemberRole | ''>('')
const selectedStatus = ref<AccountStatus>('pending')
const editMessage = ref('')
const roleError = ref(false)
const saving = ref(false)
const savedAccountId = ref<number>()
let editTrigger: HTMLElement | null = null
let noticeTimer: number | undefined

const memberRoles: MemberRole[] = ['tester', 'developer']
const statusOptions = computed<AccountStatus[]>(() => editing.value?.status === 'pending'
  ? ['pending', 'active', 'disabled']
  : ['active', 'disabled'])
const willStopActiveAccount = computed(() => editing.value?.status === 'active' && selectedStatus.value === 'disabled')

const hasChanges = computed(() =>
  Boolean(editing.value && (
    props.authorization || selectedRole.value !== (editing.value.role ?? '')
    || selectedStatus.value !== editing.value.status
  )),
)

async function handleAccessError(error: unknown): Promise<boolean> {
  if (!(error instanceof ApiError)) return false
  if (error.status === 401) {
    dialog.value?.close()
    await router.replace('/login')
    return true
  }
  if (error.code === 'admin_required' || error.code === 'server_operator_required') {
    dialog.value?.close()
    accounts.value = []
    denied.value = true
    message.value = error.message
    if (viewer.value && error.code === 'server_operator_required') viewer.value.can_grant_admin = false
    await nextTick()
    pageHeading.value?.focus({ preventScroll: true })
    return true
  }
  return false
}

async function loadPage(requestedPage: number) {
  if (loading.value) return
  retryPage.value = requestedPage
  loading.value = true
  message.value = ''
  notice.value = ''
  savedAccountId.value = undefined
  try {
    if (!viewer.value) viewer.value = await authApi.me()
    const result = props.authorization
      ? await adminApi.authorizations(requestedPage)
      : await adminApi.accounts(requestedPage)
    accounts.value = result.items
    page.value = requestedPage
    hasNext.value = result.has_next
    loaded.value = true
  } catch (error) {
    if (!await handleAccessError(error)) message.value = errorMessage(error)
  } finally {
    loading.value = false
  }
}

async function openEditor(account: ManagedAccount, event: MouseEvent) {
  if (account.role === 'admin' || dialog.value?.open) return
  editTrigger = event.currentTarget as HTMLElement
  editing.value = account
  selectedRole.value = account.role ?? ''
  selectedStatus.value = account.status
  editMessage.value = ''
  roleError.value = false
  notice.value = ''
  savedAccountId.value = undefined
  await nextTick()
  dialog.value?.showModal()
  if (props.authorization) cancelButton.value?.focus()
  else focusRole()
}

function focusRole() {
  const input = roleField.value?.querySelector<HTMLInputElement>(':checked')
    ?? roleField.value?.querySelector<HTMLInputElement>('input')
  input?.focus()
}

function closeEditor() {
  editing.value = null
  if (editTrigger?.isConnected) editTrigger.focus({ preventScroll: true })
  else pageHeading.value?.focus({ preventScroll: true })
  editTrigger = null
}

function showNotice(message: string) {
  window.clearTimeout(noticeTimer)
  notice.value = message
  noticeTimer = window.setTimeout(() => { notice.value = '' }, 5200)
}

watch([selectedRole, selectedStatus], () => {
  editMessage.value = ''
  roleError.value = false
})

function onCancel(event: Event) {
  if (saving.value) event.preventDefault()
}

async function saveAccount() {
  const account = editing.value
  if (!account || saving.value || !hasChanges.value) return
  if (!props.authorization && selectedStatus.value === 'active'
      && !selectedRole.value && account.status !== 'active') {
    roleError.value = true
    await nextTick()
    focusRole()
    return
  }
  const changes: AccountUpdate = {}
  if (selectedRole.value && selectedRole.value !== account.role) changes.role = selectedRole.value
  if (selectedStatus.value !== 'pending' && selectedStatus.value !== account.status) {
    changes.status = selectedStatus.value
  }
  saving.value = true
  editMessage.value = ''
  roleError.value = false
  try {
    const updated = props.authorization
      ? await adminApi.grantAdmin(account.id)
      : await adminApi.updateAccount(account.id, changes)
    accounts.value = accounts.value.map((item) => item.id === updated.id ? updated : item)
    if (viewer.value?.id === updated.id) viewer.value.role = updated.role
    dialog.value?.close()
    savedAccountId.value = updated.id
    if (props.authorization) {
      showNotice(`${updated.username}已获得管理员角色。`)
    } else if (changes.status === 'disabled') {
      showNotice(account.status === 'active' ? '账号已停用，原会话已失效。' : '账号已停用。')
    } else {
      showNotice('账号设置已保存。')
    }
  } catch (error) {
    if (await handleAccessError(error)) return
    if (error instanceof ApiError && error.code === 'role_required') {
      roleError.value = true
      saving.value = false
      await nextTick()
      focusRole()
    } else {
      editMessage.value = errorMessage(error)
      saveButton.value?.focus({ preventScroll: true })
    }
  } finally {
    saving.value = false
  }
}

onMounted(() => loadPage(1))
onBeforeUnmount(() => window.clearTimeout(noticeTimer))
</script>

<template>
  <AccountWorkspace :user="viewer">
    <section aria-labelledby="admin-heading">
      <header class="admin-page-head">
        <h1 id="admin-heading" ref="pageHeading" tabindex="-1">{{ denied ? '无法访问' : title }}</h1>
      </header>

      <div v-if="message" class="admin-feedback">
        <p role="alert">{{ message }}</p>
        <RouterLink v-if="denied" to="/account">返回我的账号</RouterLink>
        <button v-else class="admin-button" type="button" :disabled="loading" @click="loadPage(retryPage)">重新加载</button>
      </div>
      <p v-else-if="loading && !loaded" class="admin-feedback" role="status">正在加载账号…</p>
      <div class="toast-region" role="status" aria-atomic="true">
        <p v-if="notice" class="toast">{{ notice }}</p>
      </div>

      <div v-if="loaded && !denied" :aria-busy="loading">
        <table
          v-if="accounts.length" class="accounts-table" :class="{ 'is-authorization': authorization }"
          aria-labelledby="admin-heading" role="table"
        >
          <colgroup><col><col><col><col></colgroup>
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">账号</th>
              <th scope="col" role="columnheader">角色</th>
              <th scope="col" role="columnheader">状态</th>
              <th scope="col" role="columnheader">操作</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            <tr
              v-for="account in accounts" :key="account.id" role="row"
              :class="{ 'just-saved': account.id === savedAccountId }"
            >
              <th scope="row" role="rowheader">
                <span class="account-copy">
                  <strong class="account-name">{{ account.username }}</strong>
                  <span class="account-email">{{ account.email }}</span>
                </span>
              </th>
              <td class="role-cell" role="cell">
                <span class="role" :class="{ unassigned: !account.role }">{{ account.role ? roleLabels[account.role] : '未分配' }}</span>
              </td>
              <td class="state-cell" role="cell">
                <span class="account-status" :data-state="account.status">{{ statusLabels[account.status] }}</span>
              </td>
              <td class="action-cell" role="cell">
                <button
                  v-if="account.role !== 'admin'" type="button" class="account-edit" :class="{ 'account-grant': authorization }"
                  :aria-label="(authorization ? '授予管理员' : '编辑') + ' ' + account.username"
                  @click="openEditor(account, $event)"
                >{{ authorization ? '授予管理员' : '编辑' }}</button>
                <span v-else-if="authorization" class="grant-complete">已授予</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="admin-feedback">暂无账号</p>
        <nav v-if="page > 1 || hasNext" class="accounts-pagination" aria-label="账号分页">
          <button type="button" class="admin-button" :disabled="page === 1 || loading" @click="loadPage(page - 1)">上一页</button>
          <span aria-live="polite">第 {{ page }} 页</span>
          <button type="button" class="admin-button" :disabled="!hasNext || loading" @click="loadPage(page + 1)">下一页</button>
        </nav>
      </div>

      <dialog ref="dialog" class="account-editor" aria-labelledby="editor-heading" @cancel="onCancel" @close="closeEditor">
        <form v-if="editing" :aria-busy="saving" @submit.prevent="saveAccount">
          <div class="editor-body">
            <header class="editor-header">
              <h2 id="editor-heading">{{ authorization ? '授予管理员角色' : '编辑账号' }}</h2>
              <button type="button" class="close" aria-label="关闭" :disabled="saving" @click="dialog?.close()">×</button>
            </header>
            <div class="person editor-target">
              <span class="avatar" aria-hidden="true">{{ [...editing.username][0] }}</span>
              <span class="account-copy">
                <strong class="account-name">{{ editing.username }}</strong>
                <span class="account-email">{{ editing.email }}</span>
              </span>
            </div>
            <div v-if="authorization" class="editor-impact">
              <p>授予后，该账号将启用并获得账号管理权限。</p>
              <p v-if="editing.role" class="editor-warning">原有角色将替换为管理员。</p>
            </div>
            <div v-else class="editor-fields">
              <fieldset
                ref="roleField" class="field" aria-labelledby="account-role-label" :disabled="saving"
                :aria-invalid="roleError || undefined" :aria-describedby="roleError ? 'account-role-error' : undefined"
              >
                <legend>
                  <span id="account-role-label">角色</span>
                  <span v-if="roleError" id="account-role-error" class="role-error" role="alert">请选择测试或开发角色。</span>
                </legend>
                <div class="choices">
                  <label v-for="role in memberRoles" :key="role" class="choice">
                    <input v-model="selectedRole" type="radio" name="account-role" :value="role">
                    <span>{{ roleLabels[role] }}</span>
                  </label>
                </div>
              </fieldset>
              <fieldset
                class="field" :disabled="saving"
                :aria-describedby="willStopActiveAccount && !editMessage ? 'account-stop-warning' : undefined"
              >
                <legend>状态</legend>
                <div class="choices">
                  <label v-for="status in statusOptions" :key="status" class="choice">
                    <input v-model="selectedStatus" type="radio" name="account-status" :value="status">
                    <span>{{ statusLabels[status] }}</span>
                  </label>
                </div>
              </fieldset>
            </div>
            <div class="editor-context">
              <p v-if="willStopActiveAccount && !authorization && !editMessage" id="account-stop-warning" class="editor-notice editor-warning">
                停用后，该账号在所有设备上的会话都会失效。
              </p>
              <p v-if="editMessage" class="editor-notice editor-error" role="alert">{{ editMessage }}</p>
            </div>
          </div>
          <div class="editor-actions">
            <button ref="cancelButton" class="admin-button" type="button" :disabled="saving" @click="dialog?.close()">取消</button>
            <button
              ref="saveButton" class="admin-primary" type="submit" :disabled="!hasChanges"
              :aria-disabled="saving || undefined" :data-busy="saving || undefined"
            >
              {{ authorization ? (saving ? '正在授予…' : '确认授予') : (saving ? '保存中…' : '保存更改') }}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  </AccountWorkspace>
</template>
