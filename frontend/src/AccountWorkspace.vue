<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { roleLabels, type User } from './api'
import IssueIcon from './IssueIcon.vue'
import NotificationInbox from './NotificationInbox.vue'
import { useNotificationSession } from './notificationSession'

const props = defineProps<{ user: User | null }>()
const route = useRoute()
const notifications = useNotificationSession()
const noticeHost = ref<HTMLElement>()
watch(() => props.user, user => { if (user) notifications.select(user) }, { immediate: true })
</script>

<template>
  <div class="account-workspace">
    <header class="workspace-header">
      <div class="workspace-header-inner">
        <div class="workspace-brand wordmark">
          <span class="brand-mark" aria-hidden="true"></span>测试协作平台
        </div>
        <nav v-if="user" class="workspace-nav" aria-label="工作区导航">
          <RouterLink v-if="user.role === 'tester'" class="nav-link" to="/issues"
            :aria-current="route.name === 'issues' ? 'page' : undefined">
            <span class="nav-icon list-icon" aria-hidden="true"></span>我的事项
          </RouterLink>
          <RouterLink v-if="user.role === 'developer'" class="nav-link" to="/development"
            :aria-current="route.name === 'development' ? 'page' : undefined">
            <span class="nav-icon list-icon" aria-hidden="true"></span>开发事项
          </RouterLink>
          <RouterLink v-if="user.role === 'admin'" class="nav-link" to="/admin/accounts"
            :aria-current="route.name === 'admin-accounts' ? 'page' : undefined">
            <span class="nav-icon list-icon" aria-hidden="true"></span>账号管理
          </RouterLink>
          <RouterLink v-if="user.can_grant_admin" class="nav-link" to="/admin/authorizations"
            :aria-current="route.name === 'admin-authorizations' ? 'page' : undefined">
            <span class="nav-icon lock-icon" aria-hidden="true"></span>管理员授权
          </RouterLink>
          <RouterLink v-if="user.role" class="nav-link" to="/dashboard"
            :aria-current="route.name === 'dashboard' ? 'page' : undefined">
            <IssueIcon name="stats" />统计看板
          </RouterLink>
          <RouterLink class="nav-link" to="/account" :aria-current="route.name === 'account' ? 'page' : undefined">
            <span class="nav-icon person-icon" aria-hidden="true"></span>我的账号
          </RouterLink>
        </nav>
        <div v-if="user" class="workspace-identity">
          <NotificationInbox v-if="user.role === 'tester' || user.role === 'developer'"
            :key="user.id + ':' + user.role" :role="user.role" :notice-host="noticeHost" />
          <span class="avatar" aria-hidden="true">{{ [...user.username][0] }}</span>
          <div>
            <p class="identity-name">{{ user.username }}</p>
            <p class="identity-role">{{ user.role ? roleLabels[user.role] : '未分配' }}</p>
          </div>
        </div>
      </div>
    </header>
    <div ref="noticeHost"></div>
    <main class="admin-layout">
      <div class="workspace-content"><slot /></div>
    </main>
  </div>
</template>

<style src="./admin.css"></style>
<style src="./workspace.css"></style>
<style src="./select-control.css"></style>
<style src="./accounts.css"></style>
