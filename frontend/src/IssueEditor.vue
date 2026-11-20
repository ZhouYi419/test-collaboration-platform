<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ApiError, errorMessage } from './api'
import IssueField from './IssueField.vue'
import IssueIcon from './IssueIcon.vue'
import {
  commonFields, fieldsByType, fileSize, issuesApi, saveFile, typeLabels,
  type Attachment, type IssueDetail, type IssueType, type IssuePerson,
} from './issuesApi'

const props = defineProps<{ issue: IssueDetail | null }>()
const emit = defineEmits<{ saved: [id: string, message: string]; expired: [] }>()
const form = reactive<Record<string, string | null>>({ ...props.issue?.form })
const issueId = props.issue?.id ?? crypto.randomUUID()
const attachments = ref<(Attachment | File)[]>([...(props.issue?.attachments ?? [])])
const assigneeId = ref<number | null>(props.issue?.assignee?.id ?? null)
const assigneeName = ref(props.issue?.assignee?.username)
const assignee = ref<HTMLSelectElement>()
const assignHeading = ref<HTMLElement>()
const developers = ref<IssuePerson[]>([])
const developersLoading = ref(true)
const developersError = ref('')
const fileInput = ref<HTMLInputElement>()
const panel = ref<HTMLFormElement>()
const problem = ref<Record<string, string>>({})
const actionError = ref('')
const fileError = ref('')
const busy = ref('')
const dirty = ref(false)
const typeChanged = ref(false)
const activeType = computed(() => form.type as IssueType | null)
const specificFields = computed(() => activeType.value ? fieldsByType[activeType.value] : [])
const dialog = ref<HTMLDialogElement>()
const confirmTitle = ref('')
const confirmMessage = ref('')
const confirmLabel = ref('')
let resolveConfirmation: ((confirmed: boolean) => void) | undefined
let retry: { submit: boolean; writeId: string } | undefined

function update(key: string, value: string | null | undefined) {
  form[key] = value ?? null
  delete problem.value[key]
  if (key === 'type') typeChanged.value = true
  markDirty()
}

function markDirty() {
  retry = undefined
  dirty.value = true
}

function changeAssignee() {
  assigneeName.value = developers.value.find(person => person.id === assigneeId.value)?.username
  delete problem.value.assignee_id
  markDirty()
}

function confirmRefresh(event: BeforeUnloadEvent) {
  if (dirty.value || busy.value) event.preventDefault()
}

async function loadDevelopers() {
  developersLoading.value = true
  try {
    developers.value = await issuesApi.developers()
    developersError.value = ''
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      dirty.value = false
      emit('expired')
    } else developersError.value = errorMessage(error)
  } finally {
    developersLoading.value = false
  }
}

async function retryDevelopers() {
  if (developersLoading.value) return
  await loadDevelopers()
  await nextTick()
  if (!developersError.value) {
    const target = assignee.value?.disabled ? assignHeading.value : assignee.value
    target?.focus()
  }
}
onMounted(() => {
  window.addEventListener('beforeunload', confirmRefresh)
  void loadDevelopers()
})
onUnmounted(() => {
  window.removeEventListener('beforeunload', confirmRefresh)
  resolveConfirmation?.(false)
})

function confirm(title: string, message: string, label: string) {
  if (resolveConfirmation) return Promise.resolve(false)
  confirmTitle.value = title
  confirmMessage.value = message
  confirmLabel.value = label
  return new Promise<boolean>(resolve => {
    resolveConfirmation = resolve
    dialog.value?.showModal()
  })
}

function finishConfirmation(confirmed: boolean) {
  dialog.value?.close()
  resolveConfirmation?.(confirmed)
  resolveConfirmation = undefined
}

async function confirmLeave() {
  if (busy.value) return false
  if (!dirty.value) return true
  return confirm('放弃本次修改？', '本次修改尚未保存。', '放弃修改')
}

defineExpose({ confirmLeave })

function addFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const errors = []
  for (const file of input.files ?? []) {
    if (!/\.(png|jpe?g|txt|log|pdf)$/i.test(file.name)) {
      errors.push(`${file.name} 的格式不受支持。`)
    } else if (file.size > 10_000_000) {
      errors.push(`${file.name} 超过 10 MB。`)
    } else if (attachments.value.length >= 5) {
      errors.push('每条事项最多添加 5 个附件。')
      break
    } else {
      attachments.value.push(file)
      markDirty()
    }
  }
  fileError.value = errors.join(' ')
  input.value = ''
}

async function removeFile(index: number) {
  attachments.value.splice(index, 1)
  markDirty()
  fileError.value = ''
  await nextTick()
  const next = panel.value?.querySelectorAll<HTMLElement>('.file-list button.account-edit')[index]
  const focusTarget = next ?? panel.value?.querySelector<HTMLElement>('.attach-button')
  focusTarget?.focus()
}

async function download(file: File | Attachment) {
  fileError.value = ''
  if (file instanceof File) {
    saveFile(file, file.name)
    return
  }
  try {
    await issuesApi.download(issueId, file)
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      dirty.value = false
      emit('expired')
    } else fileError.value = errorMessage(error)
  }
}

async function focusError() {
  await nextTick()
  const key = Object.keys(problem.value)[0]
  const control = key === 'assignee_id' ? document.getElementById('assignee') : key === 'type'
    ? panel.value?.querySelector<HTMLElement>('input[name=type]')
    : document.getElementById(key)
  control?.focus({ preventScroll: true })
  control?.closest('.form-field, .type-field')?.scrollIntoView({ block: 'center' })
}

function validate() {
  const errors: Record<string, string> = {}
  if (!form.type) errors.type = '请选择申请类型'
  for (const field of [...commonFields, ...specificFields.value]) {
    if (!field.optional && !form[field.key]?.trim()) {
      errors[field.key] = `请${field.options ? '选择' : '填写'}${field.label}`
    }
  }
  problem.value = errors
  return !Object.keys(errors).length
}

async function handleError(error: unknown, action: string, button: HTMLElement | null) {
  if (error instanceof ApiError && error.status === 401) {
    dirty.value = false
    emit('expired')
    return
  }
  if (error instanceof ApiError && error.code === 'validation_error' && Object.keys(error.fields).length) {
    problem.value = { ...error.fields }
    if (problem.value.assignee_id) await loadDevelopers()
    if (problem.value.attachments) {
      fileError.value = problem.value.attachments
      delete problem.value.attachments
      await nextTick()
      const attachButton = panel.value?.querySelector<HTMLElement>('.attach-button')
      attachButton?.focus({ preventScroll: true })
      attachButton?.scrollIntoView({ block: 'center' })
    } else await focusError()
    return
  }
  actionError.value = error instanceof ApiError && error.code === 'network_error'
    ? `网络连接失败，请重试${action}。` : errorMessage(error)
  await nextTick()
  button?.focus({ preventScroll: true })
  panel.value?.querySelector('.form-actions')?.scrollIntoView({ block: 'nearest' })
}

async function save(submit: boolean, event: Event) {
  if (busy.value) return
  actionError.value = ''
  fileError.value = ''
  if (submit && !validate()) {
    await focusError()
    return
  }
  const button = event instanceof SubmitEvent ? event.submitter : event.currentTarget as HTMLElement
  const mode = submit ? '提交' : '保存'
  busy.value = mode
  if (retry?.submit !== submit) retry = { submit, writeId: crypto.randomUUID() }
  const data = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value?.trim() || null]))
  const files = attachments.value.filter((file): file is File => file instanceof File)
  try {
    const issue = await issuesApi.save(issueId, {
      version: props.issue?.version ?? null,
      write_id: retry.writeId,
      form: data,
      submit,
      assignee_id: assigneeId.value,
      keep_attachments: attachments.value.filter((file): file is Attachment => !(file instanceof File)).map(file => file.id),
    }, files)
    dirty.value = false
    busy.value = ''
    emit('saved', issue.id, submit ? '事项已提交' : '草稿已保存')
  } catch (error) {
    busy.value = ''
    await handleError(error, mode, button)
  }
}

async function removeDraft(event: Event) {
  const issue = props.issue
  if (!issue || busy.value) return
  const button = event.currentTarget as HTMLElement
  if (!await confirm('删除草稿？', '草稿及附件将一并删除。', '删除草稿')) return
  actionError.value = ''
  busy.value = '删除'
  try {
    await issuesApi.delete(issue.id, issue.version)
    dirty.value = false
    busy.value = ''
    emit('saved', '', '草稿已删除')
  } catch (error) {
    busy.value = ''
    await handleError(error, '删除', button)
  }
}
</script>

<template>
  <form id="issue-form" ref="panel" novalidate @submit.prevent="save(true, $event)">
    <fieldset class="editor-inputs editor-layout" :disabled="!!busy">
      <div class="editor-card issue-form-content">
        <section class="form-section" aria-labelledby="basic-title">
          <h2 id="basic-title">基本信息</h2>
          <div class="form-grid basic-grid">
            <fieldset class="type-field">
              <legend>申请类型<span class="required" aria-hidden="true">*</span></legend>
              <div class="choices" :aria-invalid="!!problem.type">
                <label v-for="(label, value) in typeLabels" :key="value" class="choice">
                  <input type="radio" name="type" :value="value" :checked="activeType === value"
                    aria-required="true" :aria-describedby="problem.type ? 'type-error' : undefined"
                    @change="update('type', value)">{{ label }}
                </label>
              </div>
              <p v-if="problem.type" id="type-error" class="field-error">{{ problem.type }}</p>
            </fieldset>
            <IssueField v-for="field in commonFields" :key="field.key" :field="field" :error="problem[field.key]"
              :model-value="form[field.key] ?? null" @update:model-value="update(field.key, $event)" />
          </div>
        </section>
        <section v-if="activeType" :key="activeType" class="form-section"
          :class="{ 'type-changed': typeChanged, 'bug-fields': activeType === 'bug' }" aria-labelledby="specific-title">
          <h2 id="specific-title">{{ activeType === 'bug' ? '复现信息' : '需求信息' }}</h2>
          <div class="form-grid">
            <IssueField v-for="field in specificFields" :key="field.key" :field="field" :error="problem[field.key]"
              :model-value="form[field.key] ?? null" @update:model-value="update(field.key, $event)" />
          </div>
        </section>
      </div>
      <div class="editor-card issue-form-support">
        <section class="form-section" aria-labelledby="assign-title">
          <h2 id="assign-title" ref="assignHeading" tabindex="-1">分配</h2>
          <div class="form-field assignment-field">
            <label for="assignee">指定开发</label>
            <div class="select-control">
              <select id="assignee" ref="assignee" v-model="assigneeId" :disabled="developersLoading || (!developers.length && !assigneeId)"
                :aria-invalid="!!problem.assignee_id"
                :aria-describedby="developersError && !developersLoading ? 'assignee-error candidate-error' : 'assignee-hint assignee-error'"
                @change="changeAssignee">
                <option :value="null">未指定</option>
                <option v-if="assigneeId && !developers.some(person => person.id === assigneeId)" :value="assigneeId" disabled>
                  {{ assigneeName ?? '所选开发' }}（不可用）
                </option>
                <option v-for="developer in developers" :key="developer.id" :value="developer.id">{{ developer.username }}</option>
              </select>
            </div>
            <p v-if="!developersError || developersLoading" id="assignee-hint" class="file-hint">
              {{ developersLoading ? '正在加载开发账号…' : !developers.length && !developersError ? '暂无可指派的开发，提交后进入待领取。' : '留空时，提交后进入待领取。' }}
            </p>
            <p v-if="developersError" id="candidate-error" class="field-error" role="alert">{{ developersError }}</p>
            <button v-if="developersError" class="admin-button retry-candidates" type="button"
              :aria-disabled="developersLoading || undefined" @click="retryDevelopers">
              {{ developersLoading ? '加载中…' : '重新加载' }}
            </button>
            <p id="assignee-error" class="field-error" role="alert">{{ problem.assignee_id }}</p>
          </div>
        </section>
        <section class="form-section" aria-labelledby="attachments-title">
          <h2 id="attachments-title">附件</h2>
          <div class="file-control">
            <button class="admin-button attach-button" type="button" aria-describedby="file-hint"
              @click="fileInput?.click()"><IssueIcon name="plus" />添加附件</button>
            <p id="file-hint" class="file-hint">PNG、JPG、TXT、LOG、PDF，每条最多 5 个，每个 10&nbsp;MB</p>
            <input ref="fileInput" type="file" accept=".png,.jpg,.jpeg,.txt,.log,.pdf" multiple hidden @change="addFiles">
          </div>
          <p v-if="fileError" class="field-error file-error" role="alert">{{ fileError }}</p>
          <ul v-if="attachments.length" class="file-list">
            <li v-for="(file, index) in attachments" :key="index">
              <div class="file-name">
                <button class="file-download" type="button" @click="download(file)">
                  <IssueIcon name="down" /><span>{{ file.name }}</span>
                </button>
                <span class="file-size">{{ fileSize(file.size) }}</span>
              </div>
              <button class="account-edit" type="button" :aria-label="`移除 ${file.name}`" @click="removeFile(index)">移除</button>
            </li>
          </ul>
        </section>
      </div>
    </fieldset>
    <div class="form-actions">
      <p v-if="actionError" class="action-error" role="alert">{{ actionError }}</p>
      <div class="action-buttons">
        <button v-if="issue" type="button" class="admin-button delete-draft" :aria-disabled="!!busy || undefined" @click="removeDraft">
          {{ busy === '删除' ? '删除中…' : '删除草稿' }}
        </button>
        <button type="button" class="admin-button" :aria-disabled="!!busy || undefined" @click="save(false, $event)">
          {{ busy === '保存' ? '保存中…' : '保存草稿' }}
        </button>
        <button type="submit" class="admin-primary" :aria-disabled="!!busy || undefined">{{ busy === '提交' ? '提交中…' : '提交事项' }}</button>
      </div>
    </div>
  </form>
  <dialog ref="dialog" class="account-editor issue-confirm" aria-labelledby="issue-confirm-title"
    @cancel.prevent="finishConfirmation(false)">
    <form method="dialog" @submit.prevent="finishConfirmation(true)">
      <div class="editor-body">
        <h2 id="issue-confirm-title">{{ confirmTitle }}</h2>
        <p>{{ confirmMessage }}</p>
      </div>
      <div class="editor-actions">
        <button class="admin-button" type="button" autofocus @click="finishConfirmation(false)">取消</button>
        <button class="admin-primary danger-button" type="submit">{{ confirmLabel }}</button>
      </div>
    </form>
  </dialog>
</template>
