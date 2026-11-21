<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, useId, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { MemberRole } from './api'
import { ApiError, errorMessage } from './http'
import IssueIcon from './IssueIcon.vue'
import { useNotificationSession } from './notificationSession'
import { notificationsApi, notificationLabels, notificationTime, type NotificationItem } from './notificationsApi'
import './notifications.css'

const props = defineProps<{ role: MemberRole; noticeHost?: HTMLElement }>()
const route = useRoute()
const router = useRouter()
const session = useNotificationSession()
const panelId = useId()
const titleId = useId()
const rail = ref<HTMLElement>()
const trigger = ref<HTMLButtonElement>()
const panel = ref<HTMLDialogElement>()
const closeButton = ref<HTMLButtonElement>()
const listBody = ref<HTMLElement>()
const retry = ref<HTMLButtonElement>()
const toast = ref<HTMLElement>()
const open = ref(false)
const modal = ref(false)
const toastInline = ref(false)
const toastTop = ref(76)
const narrow = window.matchMedia('(max-width: 760px)')
const items = shallowRef<NotificationItem[]>([])
const nextBefore = ref<number | null>(null)
const loading = ref(false)
const writing = ref(false)
const loadError = ref('')
const writeError = ref('')
const failedBefore = ref<number | null>(null)
const announcement = ref('')
const icons = { assigned: 'assigned', claimed: 'claimed', started: 'started', feedback: 'feedback',
  passed: 'passed', returned: 'return' } as const
let request: AbortController | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let dismissOnFocusOut: ReturnType<typeof setTimeout> | undefined
let sheetScroll = 0
let originFocus: HTMLElement | undefined
let toastOriginFocus: HTMLElement | undefined
let navigating = false
let active = true

const unread = session.unread
const badge = computed(() => unread.value && (unread.value > 99 ? '99+' : unread.value))
const unreadLabel = computed(() => unread.value ? '消息，' + unread.value + ' 条未读' : '消息')
const notices = session.notice
const latest = computed(() => notices.value[0])
const grouped = computed(() => notices.value.length > 1)
const noticeLabel = computed(() => grouped.value ? notices.value.length + ' 条新消息'
  : latest.value ? notificationLabels[latest.value.event] : '')
const canMark = computed(() => !writing.value && !loading.value && (unread.value
  ? true : items.value.some(item => item.read_at === null)))

function focusRow(id?: number) {
  const row = id === undefined ? undefined : listBody.value?.querySelector<HTMLElement>('[data-message="' + id + '"]')
  row?.focus()
}

async function load(before: number | null = null, focus = false) {
  request?.abort()
  const query = new AbortController()
  request = query
  loading.value = true
  loadError.value = ''
  try {
    const result = await notificationsApi.list(query.signal, before)
    if (request !== query) return
    const existing = before === null ? [] : items.value
    const ids = new Set(existing.map(item => item.id))
    const added = result.items.filter(item => !ids.has(item.id))
    items.value = [...existing, ...added]
    nextBefore.value = result.next_before
    loading.value = false
    if (focus) {
      await nextTick()
      if (open.value && request === query) focusRow(added[0]?.id)
    }
  } catch (error) {
    if (request !== query) return
    if (error instanceof ApiError && [401, 403].includes(error.status)) {
      items.value = []
      nextBefore.value = null
      void session.refresh(true)
    }
    failedBefore.value = before
    loadError.value = errorMessage(error)
    await nextTick()
    retry.value?.focus({ preventScroll: true })
  } finally {
    if (request === query) {
      loading.value = false
      request = undefined
    }
  }
}

function elementInFocus(): HTMLElement | undefined {
  return document.activeElement instanceof HTMLElement ? document.activeElement : undefined
}

function show(remember?: HTMLElement) {
  const dialog = panel.value
  if (!dialog || dialog.open || navigating) return
  originFocus = remember ?? elementInFocus()
  session.dismiss()
  modal.value = narrow.matches
  if (modal.value) {
    sheetScroll = window.scrollY
    dialog.showModal()
  } else dialog.show()
  open.value = true
  closeButton.value?.focus({ preventScroll: true })
  items.value = []
  nextBefore.value = null
  writeError.value = ''
  void load()
}

function hide(restore = true) {
  if (!panel.value?.open) return
  request?.abort()
  request = undefined
  loading.value = false
  panel.value.close()
  open.value = false
  if (restore) trigger.value?.focus({ preventScroll: true })
  if (modal.value) window.scrollTo(0, sheetScroll)
}

async function markAll() {
  if (!canMark.value) return
  writing.value = true
  writeError.value = ''
  const shown = new Set(items.value.map(item => item.id))
  try {
    await notificationsApi.markAllRead()
    if (!active) return
    const readAt = Date.now()
    items.value = items.value.map(item => shown.has(item.id) && item.read_at === null ? { ...item, read_at: readAt } : item)
    session.dismiss()
    announcement.value = '消息已标为已读。'
    await session.refresh(true)
  } catch (error) {
    if (active) writeError.value = errorMessage(error)
  } finally {
    writing.value = false
  }
}

function destination(item: NotificationItem) {
  return { path: (props.role === 'tester' ? '/issues/' : '/development/') + item.issue_id,
    query: { notification: String(item.id) } }
}

function href(item: NotificationItem) {
  return router.resolve(destination(item)).href
}

async function openMessage(event: MouseEvent, item: NotificationItem) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
  event.preventDefault()
  if (navigating) return
  const priorFocus = open.value ? originFocus : toastOriginFocus
  hide(false)
  const target = destination(item)
  const fullPath = router.resolve(target).fullPath
  if (fullPath === route.fullPath) {
    session.dismiss()
    trigger.value?.focus({ preventScroll: true })
    return
  }
  const previous = session.origin.value
  const waypoint = { from: route.fullPath, destination: fullPath, scroll: window.scrollY }
  session.origin.value = waypoint
  navigating = true
  try {
    const failure = await router.push(target)
    if (!failure) {
      session.dismiss()
      return
    }
    session.origin.value = previous
    if (priorFocus?.isConnected) priorFocus.focus({ preventScroll: true })
    else trigger.value?.focus({ preventScroll: true })
  } finally {
    navigating = false
  }
}

function pointerOutside(event: PointerEvent) {
  if (open.value && !modal.value && event.target instanceof Node && !rail.value?.contains(event.target)) hide()
}

function escape(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value && !modal.value) {
    event.preventDefault()
    hide()
  }
}

function focusLeft() {
  clearTimeout(dismissOnFocusOut)
  dismissOnFocusOut = setTimeout(() => {
    if (open.value && !modal.value && !rail.value?.contains(document.activeElement)) hide(false)
  }, 0)
}

function clickPanel(event: MouseEvent) {
  if (modal.value && event.target === panel.value && event.clientY < panel.value!.getBoundingClientRect().top) hide()
}

function resized() {
  if (open.value && modal.value !== narrow.matches) {
    hide(false)
    show(originFocus)
  }
  positionToast()
}

function positionToast() {
  if (!toast.value) return
  const bottom = rail.value?.closest('header')?.getBoundingClientRect().bottom ?? 64
  const height = toast.value.offsetHeight
  let top = Math.max(12, bottom + 10)
  const edit = elementInFocus()
  if (narrow.matches && !toastInline.value && edit?.matches('textarea, input')) {
    const bounds = edit.getBoundingClientRect()
    if (bounds.bottom > top && bounds.top < top + height && bounds.bottom + height + 16 < innerHeight) top = bounds.bottom + 8
  }
  toastTop.value = top
}

function closeToast() {
  const restore = toast.value?.contains(document.activeElement)
  session.dismiss()
  if (restore) {
    const target = toastOriginFocus?.isConnected && toastOriginFocus !== document.body ? toastOriginFocus : trigger.value
    target?.focus({ preventScroll: true })
  }
}

function pauseToast() {
  clearTimeout(timer)
}

function scheduleToast() {
  pauseToast()
  if (toast.value && !toast.value.matches(':hover, :focus-within')) timer = setTimeout(session.dismiss, 9500)
}

watch(notices, async (next, previous) => {
  pauseToast()
  if (!next.length) return
  announcement.value = noticeLabel.value + (grouped.value ? '。' : '。' + next[0]?.title)
  if (open.value) {
    session.dismiss()
    return
  }
  if (!previous.length) {
    toastOriginFocus = elementInFocus()
    const header = rail.value?.closest('header')?.getBoundingClientRect()
    toastInline.value = narrow.matches && !!header && header.bottom > 0
  }
  await nextTick()
  positionToast()
  if (toastInline.value && toastOriginFocus?.matches('textarea, input')) toastOriginFocus.scrollIntoView({ block: 'nearest' })
  scheduleToast()
})

watch(session.recent, recent => {
  if (!open.value || loading.value || loadError.value || unread.value === undefined) return
  const byId = new Map(recent.map(item => [item.id, item]))
  const first = items.value[0]
  const added = recent.filter(item => !first || item.created_at > first.created_at ||
    (item.created_at === first.created_at && item.id > first.id))
  const scroll = listBody.value?.scrollTop
  const row = elementInFocus()?.closest('[data-message]')
  const before = row?.getBoundingClientRect().top
  items.value = [...added, ...items.value.map(item => byId.get(item.id) ?? item)]
  if (row && scroll !== undefined && before !== undefined) {
    void nextTick(() => {
      if (listBody.value && row.isConnected) listBody.value.scrollTop = scroll + row.getBoundingClientRect().top - before
    })
  }
})
watch(() => route.fullPath, () => hide(false))
watch(unread, (count, previous) => {
  if (count === undefined && previous !== undefined) {
    hide(false)
    items.value = []
  }
})

onMounted(() => {
  document.addEventListener('pointerdown', pointerOutside)
  document.addEventListener('keydown', escape)
  window.addEventListener('resize', resized)
  window.addEventListener('scroll', positionToast, { passive: true })
})
onUnmounted(() => {
  active = false
  request?.abort()
  pauseToast()
  clearTimeout(dismissOnFocusOut)
  document.removeEventListener('pointerdown', pointerOutside)
  document.removeEventListener('keydown', escape)
  window.removeEventListener('resize', resized)
  window.removeEventListener('scroll', positionToast)
})
</script>

<template>
  <div ref="rail" class="message-rail">
    <button ref="trigger" type="button" class="message-trigger" :aria-label="unreadLabel" title="消息"
      aria-haspopup="dialog" :aria-controls="panelId" :aria-expanded="open"
      @pointerdown="originFocus = elementInFocus()" @click="open ? hide() : show(originFocus)">
      <IssueIcon name="bell" />
      <span v-if="badge" class="unread-count" aria-hidden="true">{{ badge }}</span>
    </button>
    <dialog :id="panelId" ref="panel" class="message-panel" :aria-labelledby="titleId" :aria-modal="modal || undefined"
      @cancel.prevent="hide()" @click="clickPanel" @focusout="focusLeft">
      <header class="message-panel-head">
        <h2 :id="titleId">消息</h2>
        <button type="button" class="message-mark" :aria-disabled="!canMark" @click="markAll">
          {{ writing ? '正在标记…' : '全部标为已读' }}
        </button>
        <button ref="closeButton" type="button" class="message-close" aria-label="关闭消息" @click="hide()"><IssueIcon name="close" /></button>
      </header>
      <div ref="listBody" class="message-body" :aria-busy="loading || undefined">
        <p v-if="writeError" class="message-operation-error" role="alert">{{ writeError }} 请再次点击「全部标为已读」。</p>
        <ul v-if="items.length" class="message-list">
          <li v-for="item in items" :key="item.id">
            <a class="message-row" :class="{ 'is-unread': item.read_at === null }" :data-message="item.id" :href="href(item)"
              @click="openMessage($event, item)">
              <span class="message-event-icon" :data-event="item.event"><IssueIcon :name="icons[item.event]" /></span>
              <span class="message-copy">
                <span class="message-meta">
                  <span class="message-event">{{ notificationLabels[item.event] }}
                    <template v-if="item.read_at === null"><span class="unread-dot" aria-hidden="true" /><span class="message-sr">未读</span></template>
                  </span>
                  <time class="message-time" :datetime="new Date(item.created_at).toISOString()">{{ notificationTime(item.created_at) }}</time>
                </span>
                <span class="message-title">{{ item.title }}</span>
              </span>
            </a>
          </li>
        </ul>
        <p v-if="loading" class="message-state" role="status">正在加载消息…</p>
        <div v-else-if="loadError" class="message-state">
          <p role="alert">{{ loadError }}</p>
          <button ref="retry" class="admin-button" type="button" @click="load(failedBefore, true)">重新加载</button>
        </div>
        <p v-else-if="!items.length" class="message-state">暂无消息</p>
        <button v-else-if="nextBefore !== null" type="button" class="message-more" @click="load(nextBefore, true)">加载更早消息</button>
      </div>
    </dialog>
    <p class="message-sr" role="status">{{ announcement }}</p>
    <Teleport v-if="noticeHost" :to="noticeHost">
      <aside v-if="latest && !open" ref="toast" class="message-toast" :class="{ 'toast-inline': toastInline }"
        :style="{ '--toast-top': toastTop + 'px' }" aria-label="新消息提示"
        @pointerenter="pauseToast" @pointerleave="scheduleToast" @focusin="pauseToast" @focusout="scheduleToast">
        <button v-if="grouped" class="toast-link" type="button" @click="show(toastOriginFocus)">
          <span class="message-event-icon"><IssueIcon name="bell" /></span>
          <span class="message-copy"><span class="message-event">{{ noticeLabel }}</span><span class="toast-title">打开消息</span></span>
        </button>
        <a v-else class="toast-link" :href="href(latest)" @click="openMessage($event, latest)">
          <span class="message-event-icon" :data-event="latest.event"><IssueIcon :name="icons[latest.event]" /></span>
          <span class="message-copy"><span class="message-event">{{ noticeLabel }}</span><span class="toast-title">{{ latest.title }}</span></span>
        </a>
        <button class="toast-close" type="button" aria-label="关闭新消息提示" @click="closeToast"><IssueIcon name="close" /></button>
      </aside>
    </Teleport>
  </div>
</template>
