<script setup lang="ts">
import { nextTick, onBeforeUnmount, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError, authApi, errorMessage } from './api'
import AuthField from './AuthField.vue'
import { transitionAuth } from './auth-motion'

const props = defineProps<{ registering: boolean }>()
const router = useRouter()
const pageName = props.registering ? 'register' : 'login'
const registeredUsername = history.state?.registeredUsername
if (!props.registering && typeof registeredUsername === 'string') {
  const state = { ...history.state }
  delete state.registeredUsername
  history.replaceState(state, '')
}
const form = reactive({
  identifier: !props.registering && typeof registeredUsername === 'string' ? registeredUsername : '',
  username: '', email: '', password: '', confirm_password: '',
})
type FieldName = keyof typeof form
interface Field {
  name: FieldName
  label: string
  hint?: string
  autocomplete: string
  type?: 'email' | 'password'
}

const loginFields: Field[] = [
  { name: 'identifier', label: '用户名或邮箱', autocomplete: 'username' },
  { name: 'password', label: '密码', autocomplete: 'current-password', type: 'password' },
]
const registrationFields: Field[] = [
  { name: 'username', label: '用户名', autocomplete: 'username' },
  { name: 'email', label: '邮箱', autocomplete: 'email', type: 'email' },
  { name: 'password', label: '密码', hint: '至少 8 位', autocomplete: 'new-password', type: 'password' },
  { name: 'confirm_password', label: '确认密码', autocomplete: 'new-password', type: 'password' },
]
const fields = props.registering ? registrationFields : loginFields
const errors = ref<Partial<Record<FieldName, string>>>({})
const message = ref('')
const accountMessage = ref(false)
const pending = ref(false)
const registered = ref(false)
const title = ref<HTMLElement | null>(null)
const submitButton = ref<HTMLButtonElement | null>(null)
const feedback = ref<HTMLElement | null>(null)
let mounted = true
onBeforeUnmount(() => { mounted = false })

function isCurrentPage() {
  return mounted && router.currentRoute.value.name === pageName
}

function clearError(name: FieldName) {
  delete errors.value[name]
  if (name === 'password') delete errors.value.confirm_password
  message.value = ''
}

async function focusFirstError() {
  const first = fields.find(({ name }) => errors.value[name])
  if (first) {
    await nextTick()
    document.getElementById(first.name)?.focus()
  }
}

async function submit() {
  if (pending.value) return
  errors.value = {}
  message.value = ''
  accountMessage.value = false
  for (const field of fields) {
    const value = form[field.name]
    if (field.type === 'password' ? !value : !value.trim()) {
      errors.value[field.name] = field.name === 'confirm_password' ? '请再次输入密码' : `请输入${field.label}`
    }
  }
  if (props.registering) {
    if (form.password && [...form.password].length < 8) errors.value.password = '密码至少 8 位'
    if (form.confirm_password && form.password !== form.confirm_password) {
      errors.value.confirm_password = '两次输入的密码不一致'
    }
  }
  if (Object.keys(errors.value).length > 0) {
    await focusFirstError()
    return
  }

  const { identifier, username, email, password, confirm_password } = form
  pending.value = true
  try {
    if (props.registering) {
      await authApi.register({ username, email, password, confirm_password })
      if (!isCurrentPage()) return
      await transitionAuth(async () => {
        if (!isCurrentPage()) return
        form.password = ''
        form.confirm_password = ''
        registered.value = true
        await nextTick()
        window.scrollTo(0, 0)
        title.value?.focus({ preventScroll: true })
      })
    } else {
      await authApi.login({ identifier, password })
      if (isCurrentPage()) await router.replace('/account')
    }
  } catch (error) {
    if (!isCurrentPage()) return
    if (error instanceof ApiError && error.code === 'username_taken') {
      errors.value.username = error.message
    } else if (error instanceof ApiError && error.code === 'email_taken') {
      errors.value.email = error.message
    } else if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
      errors.value = error.fields
    } else {
      message.value = errorMessage(error)
      accountMessage.value = error instanceof ApiError
        && (error.code === 'account_inactive' || error.code === 'account_disabled')
      await nextTick()
      if (error instanceof ApiError && error.code === 'invalid_credentials') {
        document.getElementById('password')?.focus()
      } else {
        submitButton.value?.focus({ preventScroll: true })
      }
      feedback.value?.scrollIntoView({ block: 'nearest' })
    }
    await focusFirstError()
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section v-if="registered" class="auth-card auth-confirm" aria-labelledby="auth-title">
    <span class="confirm-mark" aria-hidden="true"></span>
    <h1 id="auth-title" ref="title" tabindex="-1">注册成功</h1>
    <p>请等待管理员启用账号。</p>
    <RouterLink class="auth-primary" :to="{ name: 'login', state: { registeredUsername: form.username.trim() } }" replace>
      返回登录
    </RouterLink>
  </section>
  <section v-else class="auth-card" aria-labelledby="auth-title">
    <div class="auth-panel-header">
      <h1 id="auth-title" tabindex="-1">{{ registering ? '创建账号' : '登录' }}</h1>
      <RouterLink class="auth-switch" :to="registering ? '/login' : '/register'">
        {{ registering ? '返回登录' : '创建账号' }}
      </RouterLink>
    </div>
    <form novalidate :aria-busy="pending" @submit.prevent="submit">
      <div class="auth-fields">
        <AuthField
          v-for="field in fields" :key="field.name" v-bind="field" v-model="form[field.name]"
          :error="errors[field.name]" :busy="pending" @update:model-value="clearError(field.name)"
        />
      </div>
      <button ref="submitButton" class="auth-primary" type="submit" :aria-disabled="pending || undefined" :data-busy="pending || undefined">
        {{ pending ? (registering ? '注册中…' : '登录中…') : (registering ? '注册' : '登录') }}
      </button>
      <p ref="feedback" class="form-feedback" :data-kind="accountMessage ? 'account' : undefined" role="alert">{{ message }}</p>
    </form>
  </section>
</template>
