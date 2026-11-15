<template>
  <div class="shell">
    <header class="branding">
      <span class="logo" aria-hidden="true"><span class="check-mark"></span></span>
      <span>测试协作平台</span>
    </header>

    <main class="auth-layout">
      <div class="visual" aria-hidden="true">
        <span class="orb orb-one"></span>
        <span class="orb orb-two"></span>
        <div class="glass">
          <div class="glass-emblem"><span class="check-mark"></span></div>
        </div>
      </div>

      <RouterView v-slot="{ Component, route }">
        <component :is="Component" :key="route.name" />
      </RouterView>
    </main>
  </div>
</template>
