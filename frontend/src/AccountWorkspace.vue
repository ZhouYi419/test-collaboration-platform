<script setup lang="ts">
import { roleLabels, type User } from './api'

defineProps<{ user: User | null }>()
</script>

<template>
  <div class="account-workspace">
    <aside class="account-sidebar">
      <div class="workspace-brand wordmark">
        <span class="brand-mark" aria-hidden="true"></span>测试协作平台
      </div>
      <nav v-if="user" class="admin-nav" aria-label="账号导航">
        <RouterLink class="nav-link" to="/account"><span class="nav-icon person-icon" aria-hidden="true"></span>我的账号</RouterLink>
        <RouterLink v-if="user.role === 'admin'" class="nav-link" to="/admin/accounts">
          <span class="nav-icon list-icon" aria-hidden="true"></span>账号管理
        </RouterLink>
        <RouterLink v-if="user.can_grant_admin" class="nav-link" to="/admin/authorizations">
          <span class="nav-icon lock-icon" aria-hidden="true"></span>管理员授权
        </RouterLink>
      </nav>
      <div v-if="user" class="workspace-identity">
        <span class="avatar" aria-hidden="true">{{ [...user.username][0] }}</span>
        <div>
          <p class="identity-name">{{ user.username }}</p>
          <p class="identity-role">{{ user.role ? roleLabels[user.role] : '未分配' }}</p>
        </div>
      </div>
    </aside>
    <main class="admin-layout">
      <div class="workspace-content"><slot /></div>
    </main>
  </div>
</template>

<style src="./admin.css"></style>
