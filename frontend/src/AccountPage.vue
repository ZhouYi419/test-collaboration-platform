<script setup lang="ts">
import { ElButton } from 'element-plus'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError, authApi, errorMessage, type User } from './api'

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
  <section class="card" aria-labelledby="account-title">
    <div class="heading">
      <h1 id="account-title">我的账号</h1>
    </div>
    <p v-if="message" class="error-box" role="alert">{{ message }}</p>
    <template v-if="user">
      <dl class="account-details">
        <dt>用户名</dt>
        <dd>{{ user.username }}</dd>
        <dt>邮箱</dt>
        <dd>{{ user.email }}</dd>
      </dl>
      <ElButton class="primary-button" :disabled="busy" @click="logout">
        {{ busy ? '退出中…' : '退出登录' }}
      </ElButton>
    </template>
    <ElButton v-else-if="message" class="primary-button" @click="loadAccount">重试</ElButton>
    <p v-else class="muted" role="status">正在检查登录状态…</p>
  </section>
</template>
