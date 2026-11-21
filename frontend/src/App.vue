<script setup lang="ts">
import { nextTick, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { transitionAuth } from './auth-motion'
import { provideNotificationSession } from './notificationSession'

const { currentRoute } = useRouter()
const displayedRoute = shallowRef(currentRoute.value)
const notifications = provideNotificationSession()

watch(currentRoute, (to) => {
  const from = displayedRoute.value
  if (!to.meta.workspace) notifications.select(null)
  const render = async () => {
    if (currentRoute.value !== to) return
    displayedRoute.value = to
    await nextTick()
    if (!from.name || currentRoute.value !== to) return
    if (from.name === 'dashboard' && to.name === 'dashboard') return
    const origin = notifications.origin.value
    const restored = origin?.destination === from.fullPath && origin.from === to.fullPath
    window.scrollTo(0, restored ? origin.scroll : 0)
    document.querySelector<HTMLElement>('main h1[tabindex="-1"]')?.focus({ preventScroll: true })
  }

  if (from.name && !from.meta.workspace && !to.meta.workspace && from.name !== to.name) {
    void transitionAuth(render)
  } else {
    void render()
  }
})
</script>

<template>
  <RouterView v-slot="{ Component }" :route="displayedRoute">
    <component :is="Component" v-if="displayedRoute.meta.workspace" :key="displayedRoute.name" />
    <div v-else-if="Component" class="auth-stage">
      <header class="workspace-header auth-header">
        <div class="workspace-header-inner">
          <span class="wordmark"><span class="brand-mark" aria-hidden="true"></span>测试协作平台</span>
        </div>
      </header>
      <main class="auth-main">
        <component :is="Component" :key="displayedRoute.name" />
      </main>
    </div>
  </RouterView>
</template>

<style src="./auth.css"></style>
