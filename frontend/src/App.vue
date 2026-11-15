<script setup lang="ts">
import { nextTick, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { transitionAuth } from './auth-motion'
import sparrow from './assets/checklist-sparrow.jpg'

const { currentRoute } = useRouter()
const displayedRoute = shallowRef(currentRoute.value)

watch(currentRoute, (to) => {
  const from = displayedRoute.value
  const render = async () => {
    if (currentRoute.value !== to) return
    displayedRoute.value = to
    await nextTick()
    if (!from.name || currentRoute.value !== to) return
    window.scrollTo(0, 0)
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
      <div class="auth-entry">
        <header>
          <span class="wordmark"><span class="brand-mark" aria-hidden="true"></span>测试协作平台</span>
        </header>
        <main class="auth-main">
          <component :is="Component" :key="displayedRoute.name" />
        </main>
      </div>
      <div class="auth-art-pane" aria-hidden="true">
        <figure class="auth-art">
          <picture>
            <source media="(min-width: 861px)" :srcset="sparrow">
            <img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" width="1122" height="1402" decoding="async" alt="">
          </picture>
        </figure>
      </div>
    </div>
  </RouterView>
</template>
