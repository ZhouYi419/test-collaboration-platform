import { inject, onMounted, onUnmounted, provide, ref, shallowRef, type InjectionKey } from 'vue'
import type { User } from './api'
import { ApiError } from './http'
import { notificationsApi, type NotificationItem } from './notificationsApi'

interface NotificationOrigin {
  from: string
  destination: string
  scroll: number
}

function createNotificationSession() {
  const unread = ref<number>()
  const recent = shallowRef<NotificationItem[]>([])
  const notice = shallowRef<NotificationItem[]>([])
  const origin = shallowRef<NotificationOrigin>()
  let account: string | undefined
  let pending: AbortController | undefined
  let initialized = false
  let floor = 0
  const seen = new Set<number>()

  function clear() {
    pending?.abort()
    pending = undefined
    unread.value = undefined
    recent.value = []
    notice.value = []
    origin.value = undefined
    initialized = false
    seen.clear()
    floor = 0
  }

  async function refresh(force = false) {
    if (!account || document.visibilityState !== 'visible' || (pending && !force)) return
    pending?.abort()
    const request = new AbortController()
    pending = request
    try {
      const summary = await notificationsApi.summary(request.signal)
      if (pending !== request) return
      const next = summary.recent
      unread.value = summary.unread_count
      recent.value = next
      if (initialized) {
        const incoming = next.filter(item => item.read_at === null && item.id >= floor && !seen.has(item.id))
        const read = new Set(next.filter(item => item.read_at !== null).map(item => item.id))
        if (incoming.length || notice.value.some(item => read.has(item.id))) {
          notice.value = [...incoming, ...notice.value.filter(item => !read.has(item.id))].slice(0, 20)
        }
      } else {
        // 首次读取建立基线，也允许随后提交的较早序号出现在同一窗口。
        if (next.length === 20) floor = Math.min(...next.map(item => item.id))
        initialized = true
      }
      next.forEach(item => seen.add(item.id))
    } catch (error) {
      if (pending === request && error instanceof ApiError && [401, 403].includes(error.status)) clear()
    } finally {
      if (pending === request) pending = undefined
    }
  }

  function select(user: User | null) {
    const key = user && (user.role === 'tester' || user.role === 'developer') ? user.id + ':' + user.role : undefined
    if (account === key) return
    clear()
    account = key
    void refresh()
  }

  function dismiss() {
    notice.value = []
  }

  function read(id: number) {
    notice.value = notice.value.filter(item => item.id !== id)
    void refresh(true)
  }

  const check = () => { void refresh() }
  onMounted(() => {
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
  })
  const interval = window.setInterval(check, 5000)
  onUnmounted(() => {
    clear()
    window.clearInterval(interval)
    document.removeEventListener('visibilitychange', check)
    window.removeEventListener('focus', check)
  })

  return { unread, recent, notice, origin, refresh, select, dismiss, read }
}

const notificationKey: InjectionKey<ReturnType<typeof createNotificationSession>> = Symbol('notifications')

export function provideNotificationSession() {
  const session = createNotificationSession()
  provide(notificationKey, session)
  return session
}

export function useNotificationSession() {
  const session = inject(notificationKey)
  if (!session) throw new Error('缺少工作区消息会话')
  return session
}
