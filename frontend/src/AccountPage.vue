<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AccountWorkspace from './AccountWorkspace.vue'
import { ApiError, authApi, errorMessage, roleLabels, type User } from './api'

const user = ref<User | null>(null)
const message = ref('')
const busy = ref(false)
const router = useRouter()

async function loadAccount() {
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
}

onMounted(loadAccount)
</script>

<template>
  <AccountWorkspace :user="user">
    <section class="account-profile" aria-labelledby="account-title">
      <header class="admin-page-head">
        <h1 id="account-title" tabindex="-1">我的账号</h1>
      </header>
      <div v-if="message" class="admin-feedback">
        <p role="alert">{{ message }}</p>
        <button v-if="!user" class="admin-button" type="button" @click="loadAccount">重试</button>
      </div>
      <template v-if="user">
        <dl class="account-details">
          <div><dt>用户名</dt><dd>{{ user.username }}</dd></div>
          <div><dt>邮箱</dt><dd>{{ user.email }}</dd></div>
          <div><dt>角色</dt><dd>{{ user.role ? roleLabels[user.role] : '未分配' }}</dd></div>
        </dl>
        <button class="admin-button" type="button" :disabled="busy" @click="logout">
          {{ busy ? '退出中…' : '退出登录' }}
        </button>
      </template>
      <p v-else-if="busy" class="admin-feedback" role="status">正在检查登录状态…</p>
    </section>
  </AccountWorkspace>
</template>
