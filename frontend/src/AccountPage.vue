<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AccountWorkspace from './AccountWorkspace.vue'
import { ApiError, authApi, errorMessage, roleLabels, type User } from './api'

const user = ref<User | null>(null)
const message = ref('')
const busy = ref(false)
const accountTitle = ref<HTMLElement>()
const logoutButton = ref<HTMLButtonElement>()
const router = useRouter()

async function loadAccount() {
  if (busy.value) return
  busy.value = true
  message.value = ''
  try {
    user.value = await authApi.me()
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await router.replace('/login')
    } else {
      message.value = errorMessage(error)
    }
  } finally {
    busy.value = false
  }
}

async function logout() {
  if (busy.value) return
  busy.value = true
  message.value = ''
  try {
    await authApi.logout()
    user.value = null
    await router.replace('/login')
  } catch (error) {
    message.value = errorMessage(error)
  } finally {
    busy.value = false
  }
  if (message.value) {
    await nextTick()
    logoutButton.value?.focus({ preventScroll: true })
  }
}

async function retryAccount() {
  await loadAccount()
  if (user.value) {
    await nextTick()
    accountTitle.value?.focus({ preventScroll: true })
  }
}

onMounted(loadAccount)
</script>

<template>
  <AccountWorkspace :user="user" class="account-area">
    <section class="account-profile" aria-labelledby="account-title">
      <header class="admin-page-head">
        <h1 id="account-title" ref="accountTitle" tabindex="-1">我的账号</h1>
      </header>
      <div v-if="message && !user" class="admin-feedback">
        <p role="alert">{{ message }}</p>
        <button class="admin-button" type="button" @click="retryAccount">重试</button>
      </div>
      <div v-if="user" class="profile-card">
        <div class="profile-body">
          <div class="person">
            <span class="avatar" aria-hidden="true">{{ [...user.username][0] }}</span>
            <h2 class="account-name">{{ user.username }}</h2>
          </div>
          <dl class="profile-meta">
            <div><dt>邮箱</dt><dd>{{ user.email }}</dd></div>
            <div><dt>角色</dt><dd>{{ user.role ? roleLabels[user.role] : '未分配' }}</dd></div>
          </dl>
        </div>
        <div class="profile-actions">
          <p v-if="message" class="account-action-error" role="alert">{{ message }}</p>
          <button ref="logoutButton" class="admin-button logout-button" type="button"
            :aria-disabled="busy || undefined" @click="logout">
            {{ busy ? '退出中…' : '退出登录' }}
          </button>
        </div>
      </div>
      <p v-else-if="busy" class="admin-feedback" role="status">正在检查登录状态…</p>
    </section>
  </AccountWorkspace>
</template>
