<script setup lang="ts">
import { ElButton } from 'element-plus'
import { nextTick, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError, authApi, errorMessage } from './api'
import AuthField from './AuthField.vue'

const props = defineProps<{ registering: boolean }>()
const router = useRouter()
const form = reactive({ identifier: '', username: '', email: '', password: '', confirm_password: '' })
type FieldName = keyof typeof form
interface Field {
  name: FieldName
  label: string
  placeholder: string
  autocomplete: string
  type?: 'email' | 'password'
}

const loginFields: Field[] = [
  { name: 'identifier', label: '用户名或邮箱', placeholder: '输入用户名或邮箱', autocomplete: 'username' },
  { name: 'password', label: '密码', placeholder: '输入密码', autocomplete: 'current-password', type: 'password' },
]
const registrationFields: Field[] = [
  { name: 'username', label: '用户名', placeholder: '输入用户名', autocomplete: 'username' },
  { name: 'email', label: '邮箱', placeholder: '输入邮箱', autocomplete: 'email', type: 'email' },
  { name: 'password', label: '密码', placeholder: '至少 8 位', autocomplete: 'new-password', type: 'password' },
  { name: 'confirm_password', label: '确认密码', placeholder: '再次输入密码', autocomplete: 'new-password', type: 'password' },
]
const fields = props.registering ? registrationFields : loginFields
const errors = ref<Partial<Record<FieldName, string>>>({})
const message = ref('')
const pending = ref(false)
const registered = ref(false)
const title = ref<HTMLElement | null>(null)

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
      form.password = ''
      form.confirm_password = ''
      registered.value = true
      await nextTick()
      title.value?.focus()
    } else {
      await authApi.login({ identifier, password })
      await router.replace('/account')
    }
  } catch (error) {
    if (error instanceof ApiError && error.code === 'username_taken') {
      errors.value.username = error.message
    } else if (error instanceof ApiError && error.code === 'email_taken') {
      errors.value.email = error.message
    } else if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
      errors.value = error.fields
    } else {
      message.value = errorMessage(error)
    }
    await focusFirstError()
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section v-if="registered" class="card success" aria-labelledby="auth-title">
    <span class="success-mark" aria-hidden="true"><span class="check-mark"></span></span>
    <h1 id="auth-title" ref="title" tabindex="-1">注册成功</h1>
    <p>请等待管理员启用账号</p>
    <RouterLink class="primary-button" to="/login" replace>返回登录</RouterLink>
  </section>
  <section v-else class="card" aria-labelledby="auth-title">
    <div class="heading">
      <h1 id="auth-title">{{ registering ? '创建账号' : '登录' }}</h1>
      <RouterLink :to="registering ? '/login' : '/register'">
        {{ registering ? '返回登录' : '创建账号' }}
      </RouterLink>
    </div>
    <form novalidate :aria-busy="pending" @submit.prevent="submit">
      <p v-if="message" class="error-box" role="alert">{{ message }}</p>
      <AuthField
        v-for="field in fields"
        :key="field.name"
        v-bind="field"
        v-model="form[field.name]"
        :error="errors[field.name]"
        @update:model-value="clearError(field.name)"
      />
      <ElButton class="primary-button" native-type="submit" :disabled="pending">
        {{ pending ? (registering ? '注册中…' : '登录中…') : (registering ? '注册' : '登录') }}
      </ElButton>
    </form>
  </section>
</template>
