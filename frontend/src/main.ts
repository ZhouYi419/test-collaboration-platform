import 'element-plus/theme-chalk/base.css'
import 'element-plus/theme-chalk/el-button.css'
import 'element-plus/theme-chalk/el-input.css'
import './styles.css'
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import AuthPage from './AuthPage.vue'
import AccountPage from './AccountPage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/account' },
    { path: '/login', name: 'login', component: AuthPage, props: { registering: false } },
    { path: '/register', name: 'register', component: AuthPage, props: { registering: true } },
    { path: '/account', name: 'account', component: AccountPage },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

createApp(App).use(router).mount('#app')
