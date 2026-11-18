import './styles.css'
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import AuthPage from './AuthPage.vue'
import AccountPage from './AccountPage.vue'
import AdminAccountsPage from './AdminAccountsPage.vue'
import IssuePage from './IssuePage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/account' },
    { path: '/login', name: 'login', component: AuthPage, props: { registering: false } },
    { path: '/register', name: 'register', component: AuthPage, props: { registering: true } },
    { path: '/account', name: 'account', component: AccountPage, meta: { workspace: true } },
    { path: '/issues/:issueId?', name: 'issues', component: IssuePage, meta: { workspace: true } },
    { path: '/development/:issueId?', name: 'development', component: IssuePage, meta: { workspace: true } },
    { path: '/admin/accounts', name: 'admin-accounts', component: AdminAccountsPage, meta: { workspace: true } },
    {
      path: '/admin/authorizations', name: 'admin-authorizations', component: AdminAccountsPage,
      props: { authorization: true }, meta: { workspace: true },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

createApp(App).use(router).mount('#app')
