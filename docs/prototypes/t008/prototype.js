const view = document.querySelector('#view')
const nav = document.querySelector('#workspace-nav')
const identity = document.querySelector('#identity')
const toast = document.querySelector('#toast')
const announcement = document.querySelector('#announcement')
const dialog = document.querySelector('#leave-dialog')
const rail = document.querySelector('#message-rail')
const trigger = document.querySelector('#message-trigger')
const panel = document.querySelector('#message-panel')
const messageBody = document.querySelector('#message-body')
const markButton = panel.querySelector('[data-action="bulk"]')
const closeButton = panel.querySelector('[data-action="close-panel"]')
const narrow = matchMedia('(max-width: 760px)')
const review = new URLSearchParams(location.search)
const scenario = review.get('case')
const recentCount = 6

const icons = {
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  assigned: '<path d="M3 20v-2a4 4 0 0 1 4-4h4m5 2 3 3 3-3m-3 3v-7"/><circle cx="9" cy="7" r="3.5"/>',
  claimed: '<path d="M17 20H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6m2 8 3 3 5-5M8 10h3m-3 4h2M14 4h4a2 2 0 0 1 2 2v3"/>',
  started: '<path d="m9 6 10 6-10 6z"/>',
  feedback: '<path d="M21 15V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13l4-3h12a2 2 0 0 0 2-1ZM7 8h10m-10 4h7"/>',
  passed: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  returned: '<path d="M8 5 4 9l4 4M4 9h10a5 5 0 0 1 0 10h-3"/>',
  bug: '<path d="M8 6l2 2m6-2-2 2M6 10h2m-3 5h3m-2 4 2-2m10-7h-2m3 5h-3m2 4-2-2"/><rect x="8" y="8" width="8" height="11" rx="4"/>',
  request: '<path d="M7 4h7l4 4v12H7zM14 4v5h4M10 12h5m-5 4h5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
}
const eventNames = {
  assigned: '指派给你',
  claimed: '事项已领取',
  started: '开始处理',
  feedback: '处理结果待验证',
  passed: '验证通过',
  returned: '验证退回',
}
const statuses = {
  pending_work: '待处理',
  in_progress: '处理中',
  pending_verify: '待验证',
  closed: '已关闭',
}
const people = {
  tester: { name: '林可', role: '测试', workspace: '我的事项' },
  developer: { name: '陈航', role: '开发', workspace: '开发事项' },
  admin: { name: '许遥', role: '管理员', workspace: '账号管理' },
}
const sheets = {
  export: {
    title: '导出 CSV 后，带前导零的订单编号被改写',
    type: 'Bug 修复', priority: 'P1', status: 'pending_verify',
    description: '从订单列表导出 CSV，使用表格软件打开后，订单编号 000128 显示为 128。需要保留订单编号的完整值。',
    feedback: '已调整导出时的订单编号格式，补充前导零和长编号两组回归数据。',
  },
  filter: {
    title: '保留工单列表的筛选条件和页码，返回时恢复原列表位置',
    type: '需求', priority: 'P2', status: 'in_progress',
    description: '在列表中按状态筛选并翻到第二页，打开详情再返回。希望保留筛选、页码及列表滚动位置。',
    reason: '从详情返回时筛选项已恢复，但仍回到了第一页。请再验证第二页返回的位置。',
  },
  route: {
    title: '在窄屏拖动长列表后，切换到第二个事项时详情标题遮挡返回入口',
    type: 'Bug 修复', priority: 'P2', status: 'pending_work',
    description: '在 320 像素宽度打开长标题事项，再返回列表切换到下一条。长标题需要完整换行，且与返回入口保留间距。',
  },
  logs: {
    title: '附件下载后保留原始日志文件名',
    type: '需求', priority: 'P3', status: 'closed',
    description: '含空格和中文名称的日志，下载后应保留原文件名称。',
    feedback: '已修复下载头的文件名编码，并覆盖包含中文和空格的日志。',
  },
  token: {
    title: '搭建验证环境后，首次登录偶发返回会话已失效',
    type: 'Bug 修复', priority: 'P1', status: 'in_progress',
    description: '切换到新环境后，首次登录返回会话已失效，第二次登录正常。请检查环境切换时浏览器 Cookie 的处理。',
  },
}

function message(id, kind, issue, time, read = false, day = '2026-11-21') {
  return { id, kind, issue, time, read, day }
}

const messages = {
  tester: [
    message('t7', 'feedback', 'export', '14:32'),
    message('t6', 'started', 'filter', '11:08'),
    message('t5', 'claimed', 'route', '10:41'),
    message('t4', 'feedback', 'export', '16:28', true, '2026-11-20'),
    message('t3', 'feedback', 'logs', '14:10', true, '2026-11-20'),
    message('t2', 'started', 'logs', '09:30', true, '2026-11-20'),
  ],
  developer: [
    message('d7', 'returned', 'filter', '14:26'),
    message('d6', 'assigned', 'route', '10:15'),
    message('d5', 'passed', 'logs', '17:20', true, '2026-11-20'),
    message('d4', 'assigned', 'token', '10:45', true, '2026-11-20'),
  ],
}
if (scenario === 'empty') messages.tester = []
if (scenario === 'more') {
  for (let i = 0; i < 12; i++) {
    messages.tester.push(message('archive-' + i, 'feedback', 'logs', '10:15', i > 1, '2026-11-19'))
  }
}

let route
let origin
let renderVersion = 0
let visibleMessages = recentCount
let listLoading = ['loading', 'load-error'].includes(scenario)
let listError = false
let initializedList = false
let detailError = scenario === 'detail-error'
let bulkError = scenario === 'read-error'
let singleError = scenario === 'read-one-error'
let bulkPending = false
let bulkFailed = false
let nextId = 0
let toastMessages = []
let toastTimer
let toastReturnFocus
let pendingNavigation
let sheetScroll

trigger.innerHTML = icon('bell') + '<span class="unread-count" aria-hidden="true" hidden></span>'
closeButton.innerHTML = icon('close')

function icon(name, classes = 'message-icon') {
  return '<svg class="' + classes + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">' + icons[name] + '</svg>'
}

function path(screen, role = route.role) {
  return '#' + role + '/' + screen
}

function readRoute() {
  const [role, screen, id] = location.hash.slice(1).split('/')
  return {
    role: Object.hasOwn(people, role) ? role : 'tester',
    screen: screen || 'issues',
    id,
  }
}

function inbox() {
  return messages[route.role] || []
}

function unreadCount() {
  return inbox().filter(item => !item.read).length
}

function updateUnread() {
  const count = unreadCount()
  const badge = trigger.querySelector('.unread-count')
  badge.hidden = count === 0
  badge.textContent = count > 99 ? '99+' : count
  trigger.setAttribute('aria-label', count ? '消息，' + count + ' 条未读' : '消息')
}

function renderNav() {
  const { name, role, workspace } = people[route.role]
  identity.innerHTML = '<span class="avatar" aria-hidden="true">' + name[0] +
    '</span><div><p class="identity-name">' + name + '</p><p class="identity-role">' + role + '</p></div>'
  rail.hidden = route.role === 'admin'
  nav.innerHTML = '<a class="nav-link" href="' + path('issues') +
    '"><span class="nav-icon list-icon" aria-hidden="true"></span>' + workspace + '</a>' +
    '<a class="nav-link" href="' + path('account') +
    '"><span class="nav-icon person-icon" aria-hidden="true"></span>我的账号</a>'
}

function backLabel() {
  if (route.screen === 'message' && origin?.role === route.role) {
    if (origin.screen === 'work' || origin.screen === 'issue') return '返回原事项'
    if (origin.screen === 'account') return '返回我的账号'
  }
  return '返回' + people[route.role].workspace
}

function backLink(back) {
  return '<a class="back-link" href="' + back + '"><span aria-hidden="true">←</span>' + backLabel() + '</a>'
}

function heading(title, back = '') {
  return (back ? backLink(back) : '') + '<div class="issue-head"><h1 tabindex="-1">' + title + '</h1></div>'
}

function placeholder(title, detail = '', button = '', action = '') {
  return '<div class="issue-empty" tabindex="-1"><h2>' + title + '</h2>' +
    (detail ? '<p class="message-state-text">' + detail + '</p>' : '') +
    (button ? '<button type="button" class="admin-button" data-action="' + action + '">' + button + '</button>' : '') + '</div>'
}

function eventIcon(kind) {
  return '<span class="message-event-icon" data-event="' + kind + '">' + icon(kind) + '</span>'
}

function messageRow(item) {
  const day = item.day === '2026-11-20' ? '昨天 ' :
    item.day === '2026-11-21' ? '' : item.day.slice(5) + ' '
  return '<li><a class="message-row' + (item.read ? '' : ' is-unread') + '" id="row-' + item.id +
    '" href="' + path('message/' + item.id) + '">' + eventIcon(item.kind) +
    '<span class="message-copy"><span class="message-meta"><span class="message-event">' + eventNames[item.kind] +
    (item.read ? '' : '<span class="unread-dot" aria-hidden="true"></span><span class="sr-only">未读</span>') +
    '</span><time class="message-time" datetime="' + item.day + 'T' + item.time + ':00+08:00">' + day + item.time +
    '</time></span><span class="message-title">' + sheets[item.issue].title + '</span></span></a></li>'
}

function renderPanel() {
  const items = inbox()
  const focused = document.activeElement
  const focusedId = focused?.closest('.message-row')?.id
  const scroll = messageBody.scrollTop
  markButton.textContent = bulkPending ? '正在标记…' : '全部标为已读'
  markButton.setAttribute('aria-disabled', String(bulkPending || !unreadCount() || listLoading || listError))
  if (listLoading) {
    messageBody.innerHTML = '<p class="message-state" role="status">正在加载消息…</p>'
  } else if (listError) {
    messageBody.innerHTML = '<div class="message-state"><p>消息加载失败</p>' +
      '<button class="admin-button" type="button" data-action="retry-list">重新加载</button></div>'
  } else if (!items.length) {
    messageBody.innerHTML = '<p class="message-state">暂无消息</p>'
  } else {
    const error = bulkFailed ? '<p class="message-operation-error" role="alert">标记失败，请再次点击「全部标为已读」。</p>' : ''
    const more = visibleMessages < items.length ?
      '<button class="message-more" type="button" data-action="more">加载更早消息</button>' : ''
    messageBody.innerHTML = error + '<ul class="message-list">' +
      items.slice(0, visibleMessages).map(messageRow).join('') + '</ul>' + more
  }
  messageBody.scrollTop = scroll
  if (focusedId) (document.getElementById(focusedId) || closeButton).focus({ preventScroll: true })
}

function showPanel() {
  if (route.role === 'admin' || panel.open) return
  hideToast()
  renderPanel()
  if (narrow.matches) {
    sheetScroll = window.scrollY
    panel.setAttribute('aria-modal', 'true')
    panel.showModal()
  } else {
    panel.removeAttribute('aria-modal')
    panel.show()
  }
  trigger.setAttribute('aria-expanded', 'true')
  closeButton.focus({ preventScroll: true })
  if (!initializedList && listLoading) {
    initializedList = true
    finishListLoading(scenario === 'load-error', scenario === 'loading' ? 2400 : 420)
  }
}

function closePanel(restoreFocus = true) {
  if (!panel.open) return
  const scroll = sheetScroll
  sheetScroll = undefined
  panel.close()
  trigger.setAttribute('aria-expanded', 'false')
  if (restoreFocus) trigger.focus({ preventScroll: true })
  if (scroll !== undefined) window.scrollTo(0, scroll)
}

function renderDetail(issue, back, working, readFailed = false) {
  const doc = sheets[issue]
  view.innerHTML = backLink(back) +
    '<div class="detail-head"><h1 tabindex="-1">' + doc.title + '</h1><div class="workflow-heading">' +
    '<span class="issue-state" data-status="' + doc.status + '">' + statuses[doc.status] + '</span></div></div>' +
    (readFailed ? '<div class="message-operation-error" role="alert">消息仍为未读。' +
      ' <button class="admin-button" type="button" data-action="retry-read">重试标为已读</button></div>' : '') +
    '<div class="detail-layout"><article class="detail-content"><section class="detail-section"><h2>详细描述</h2><p class="detail-text">' +
    doc.description + '</p></section>' +
    (doc.reason ? '<section class="detail-section"><h2>退回原因</h2><p class="detail-text">' + doc.reason + '</p></section>' : '') +
    (doc.feedback ? '<section class="detail-section"><h2>处理说明</h2><p class="detail-text">' + doc.feedback + '</p></section>' : '') +
    '</article><aside class="detail-properties detail-section"><h2>事项信息</h2><dl class="detail-summary">' +
    '<div><dt>类型</dt><dd>' + doc.type + '</dd></div><div><dt>优先级</dt><dd>' + doc.priority + '</dd></div>' +
    '<div><dt>申请人</dt><dd>林可</dd></div><div><dt>负责人</dt><dd>陈航</dd></div></dl></aside>' +
    (working ? '<section class="detail-workflow"><div class="workflow-panel detail-section work-panel"><h2>提交处理结果</h2>' +
      '<div class="form-field"><label for="feedback">处理说明<span class="required" aria-hidden="true">*</span></label>' +
      '<textarea id="feedback" placeholder="填写已完成的修改和验证情况"></textarea></div>' +
      '<div class="action-buttons"><button class="admin-primary" type="button" data-action="submit-feedback">提交处理结果</button></div>' +
      '</div></section>' : '') + '</div>'
}

function messageBack() {
  return origin?.role === route.role ? origin.hash : path('issues')
}

function openMessage(focus = true) {
  const back = messageBack()
  const item = inbox().find(row => row.id === route.id)
  const version = renderVersion
  view.innerHTML = heading('事项详情', back) + '<p class="issue-empty" role="status">正在加载事项…</p>'
  setTimeout(() => {
    if (version !== renderVersion) return
    if (!item || (scenario === 'unavailable' && item.id === 't7')) {
      view.innerHTML = heading('事项详情', back) + placeholder('事项不可用', '该事项当前无法查看。')
    } else if (detailError && item.id === 't7') {
      view.innerHTML = heading('事项详情', back) + placeholder('事项加载失败', '消息仍为未读。', '重新加载', 'retry-detail')
    } else {
      const failed = singleError && !item.read
      if (!failed) item.read = true
      updateUnread()
      renderDetail(item.issue, back, false, failed)
    }
    if (focus) view.querySelector('h1').focus()
  }, 260)
}

function renderWorkList() {
  const developer = route.role === 'developer'
  const ids = developer ? ['token', 'filter', 'route'] : ['export', 'filter', 'route', 'logs']
  view.innerHTML = heading(people[route.role].workspace) + (developer ?
    '<nav class="queue-tabs" aria-label="开发事项分类"><span class="queue-tab">待领取</span><span class="queue-tab" aria-current="page">我的待办</span><span class="queue-tab">已反馈</span></nav>' :
    '') + '<div class="issue-list-panel"><table class="issue-table"><colgroup><col><col><col><col><col></colgroup>' +
    '<thead><tr><th scope="col">标题</th><th scope="col">类型</th><th scope="col">优先级</th><th scope="col">状态</th><th scope="col">更新时间</th></tr></thead><tbody>' +
    ids.map(id => {
      const issue = sheets[id]
      const type = issue.type === '需求' ? 'request' : 'bug'
      return '<tr><th scope="row"><div class="issue-title-cell"><span class="item-symbol" data-type="' + type + '">' +
        icon(type, 'message-icon issue-icon') + '</span><a class="issue-title" href="' + path(developer && id === 'token' ? 'work' : 'issue/' + id) +
        '">' + issue.title + '</a></div></th><td class="issue-type">' + issue.type +
        '</td><td><span class="issue-priority" data-priority="' + issue.priority + '">' + issue.priority +
        '</span></td><td><span class="issue-state" data-status="' + issue.status +
        '">' + statuses[issue.status] + '</span></td><td class="issue-time"><time>11-21 14:32</time></td></tr>'
    }).join('') + '</tbody></table></div>'
}

function render(focus = false) {
  const previous = route
  route = readRoute()
  renderVersion++
  if (previous) closePanel(false)
  if (previous && (previous.role !== route.role || route.screen === 'message')) hideToast()
  if (previous?.role !== route.role) {
    visibleMessages = recentCount
    bulkFailed = false
    renderNav()
  }
  nav.querySelectorAll('[aria-current]').forEach(link => link.removeAttribute('aria-current'))
  if (route.screen !== 'message') {
    const current = route.screen === 'account' ? nav.lastElementChild : nav.firstElementChild
    current?.setAttribute('aria-current', 'page')
  }
  updateUnread()
  switch (route.screen) {
    case 'message':
      openMessage(focus)
      return
    case 'issue':
      if (Object.hasOwn(sheets, route.id)) renderDetail(route.id, path('issues'), false)
      else renderWorkList()
      break
    case 'work':
      renderDetail('token', path('issues'), true)
      break
    case 'account':
      view.innerHTML = heading('我的账号') + '<div class="detail-properties detail-section"><dl class="detail-summary">' +
        '<div><dt>用户名</dt><dd>' + people[route.role].name + '</dd></div><div><dt>角色</dt><dd>' +
        people[route.role].role + '</dd></div></dl></div>'
      break
    default:
      if (route.role !== 'admin') renderWorkList()
      else view.innerHTML = heading('账号管理')
  }
  if (!focus) return
  if (previous?.screen === 'message' && origin?.hash === location.hash) {
    window.scrollTo(0, origin.scroll)
    const target = route.screen === 'work' ? view.querySelector('#feedback') : trigger
    target?.focus({ preventScroll: true })
  } else {
    window.scrollTo(0, 0)
    view.querySelector('h1')?.focus({ preventScroll: true })
  }
}

function hideToast(restoreFocus = false) {
  clearTimeout(toastTimer)
  toastMessages = []
  toast.hidden = true
  if (restoreFocus) {
    const target = toastReturnFocus?.isConnected && toastReturnFocus !== document.body ? toastReturnFocus : trigger
    target?.focus({ preventScroll: true })
  }
}

function armToast() {
  clearTimeout(toastTimer)
  if (!toast.matches(':focus-within, :hover')) toastTimer = setTimeout(() => hideToast(), 9500)
}

function positionToast() {
  const bottom = document.querySelector('#workspace-header').getBoundingClientRect().bottom
  let top = Math.max(12, bottom + 10)
  const input = document.activeElement
  if (!toast.classList.contains('toast-inline') && input?.matches('textarea, input')) {
    const rect = input.getBoundingClientRect()
    if (rect.bottom + 8 > top && rect.top < top + toast.offsetHeight && rect.bottom + toast.offsetHeight + 16 < innerHeight) {
      top = rect.bottom + 8
    }
  }
  toast.style.setProperty('--toast-top', top + 'px')
}

function receive(multiple = false) {
  if (route.role === 'admin') return
  const count = multiple ? 3 : 1
  const events = route.role === 'tester' ? [['feedback', 'export'], ['started', 'filter'], ['claimed', 'route']] :
    [['returned', 'filter'], ['assigned', 'route'], ['passed', 'logs']]
  const incoming = events.slice(0, count).map(([kind, issue]) => message('new-' + (++nextId), kind, issue, '14:35'))
  inbox().unshift(...incoming)
  updateUnread()
  if (panel.open) {
    renderPanel()
    announcement.textContent = count === 1 ? eventNames[incoming[0].kind] + '。' + sheets[incoming[0].issue].title : count + ' 条新消息。'
    return
  }
  const priorToastAction = !toast.hidden && toast.contains(document.activeElement) ?
    (document.activeElement.closest('.toast-close') ? '.toast-close' : '.toast-link') : null
  if (toast.hidden) {
    toastReturnFocus = document.activeElement
    const headerVisible = document.querySelector('#workspace-header').getBoundingClientRect().bottom > 0
    toast.classList.toggle('toast-inline', headerVisible && matchMedia('(max-width: 760px)').matches)
  }
  toastMessages = [...incoming, ...toastMessages]
  const item = toastMessages[0]
  const summary = toastMessages.length > 1
  const label = summary ? toastMessages.length + ' 条新消息' : eventNames[item.kind]
  const labelMarkup = eventIcon(item.kind) + '<span class="message-copy"><span class="message-event">' + label +
    '</span><span class="toast-title">' + (summary ? '打开消息' : sheets[item.issue].title) + '</span></span>'
  toast.innerHTML = (summary ?
    '<button type="button" class="toast-link" data-action="open-panel">' + labelMarkup + '</button>' :
    '<a class="toast-link" href="' + path('message/' + item.id) + '">' + labelMarkup + '</a>') +
    '<button class="toast-close" type="button" aria-label="关闭新消息提示" data-action="close-toast">' +
    icon('close') + '</button>'
  toast.hidden = false
  positionToast()
  if (toast.classList.contains('toast-inline') && toastReturnFocus?.matches('textarea, input')) {
    toastReturnFocus.scrollIntoView({ block: 'nearest' })
  }
  if (priorToastAction) toast.querySelector(priorToastAction)?.focus({ preventScroll: true })
  announcement.textContent = label + '。' + (summary ? '可从消息入口查看。' : sheets[item.issue].title)
  armToast()
}

function finishListLoading(failed = false, delay = 420) {
  listLoading = true
  if (panel.open) renderPanel()
  setTimeout(() => {
    listLoading = false
    listError = failed
    if (!panel.open) return
    renderPanel()
    if (!failed && scenario === 'load-error') messageBody.querySelector('.message-row')?.focus()
  }, delay)
}

function bulkRead() {
  if (bulkPending || listLoading || listError || !unreadCount()) return
  const role = route.role
  const rows = inbox().filter(item => !item.read)
  bulkPending = true
  bulkFailed = false
  renderPanel()
  setTimeout(() => {
    bulkPending = false
    const failed = bulkError
    bulkError = false
    if (!failed) rows.forEach(item => { item.read = true })
    if (route.role !== role) return
    bulkFailed = failed
    updateUnread()
    if (panel.open) renderPanel()
    if (!failed) announcement.textContent = '已将 ' + rows.length + ' 条消息标为已读。'
  }, 360)
}

function follow(hash) {
  if (hash.includes('/message/') && route.screen !== 'message') {
    origin = {
      role: route.role, screen: route.screen, hash: location.hash || path('issues'), scroll: window.scrollY,
    }
  }
  hideToast()
  location.hash = hash
}

document.querySelector('.account-workspace').addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]')
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  const hash = link.getAttribute('href')
  const fromMessage = Boolean(link.closest('#message-panel, #toast'))
  const leaving = route.screen === 'work' && hash !== location.hash && view.querySelector('#feedback')?.value.trim()
  if (fromMessage) closePanel(false)
  if (leaving) {
    event.preventDefault()
    pendingNavigation = hash
    dialog.returnValue = 'stay'
    dialog.showModal()
    return
  }
  if (fromMessage) {
    event.preventDefault()
    follow(hash)
  }
})

dialog.addEventListener('close', () => {
  if (dialog.returnValue === 'leave') follow(pendingNavigation)
  else view.querySelector('#feedback')?.focus({ preventScroll: true })
})

trigger.addEventListener('click', () => panel.open ? closePanel() : showPanel())
panel.addEventListener('cancel', event => {
  event.preventDefault()
  closePanel()
})
panel.addEventListener('click', event => {
  const action = event.target.closest('[data-action]')?.dataset.action
  if (action === 'close-panel' || (event.target === panel && event.clientY < panel.getBoundingClientRect().top)) closePanel()
  if (action === 'bulk') bulkRead()
  if (action === 'retry-list') {
    closeButton.focus({ preventScroll: true })
    finishListLoading()
  }
  if (action === 'more') {
    const next = inbox()[visibleMessages]
    visibleMessages += recentCount
    renderPanel()
    if (next) document.getElementById('row-' + next.id)?.focus()
  }
})
document.addEventListener('pointerdown', event => {
  if (panel.open && !narrow.matches && !rail.contains(event.target)) closePanel()
})
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && panel.open && !narrow.matches) {
    event.preventDefault()
    closePanel()
  }
})
panel.addEventListener('focusout', () => {
  setTimeout(() => {
    if (panel.open && !narrow.matches && !rail.contains(document.activeElement)) closePanel(false)
  }, 0)
})
narrow.addEventListener('change', () => {
  if (!panel.open) return
  closePanel(false)
  showPanel()
})
toast.addEventListener('pointerenter', () => clearTimeout(toastTimer))
toast.addEventListener('pointerleave', armToast)
toast.addEventListener('focusin', () => clearTimeout(toastTimer))
toast.addEventListener('focusout', () => setTimeout(armToast, 0))
toast.addEventListener('click', event => {
  if (event.target.closest('[data-action="close-toast"]')) hideToast(toast.contains(document.activeElement))
  if (event.target.closest('[data-action="open-panel"]')) showPanel()
})
view.addEventListener('click', event => {
  const action = event.target.closest('[data-action]')?.dataset.action
  if (action === 'retry-detail') {
    detailError = false
    openMessage()
  }
  if (action === 'retry-read') {
    singleError = false
    openMessage()
  }
  if (action === 'submit-feedback') {
    const input = view.querySelector('#feedback')
    if (!input.value.trim()) {
      input.focus()
      return
    }
    sheets.token.feedback = '已提交处理说明。'
    sheets.token.status = 'pending_verify'
    location.hash = path('issue/token')
  }
})

window.addEventListener('hashchange', () => render(true))
window.addEventListener('resize', positionToast)
window.addEventListener('scroll', positionToast, { passive: true })
document.querySelector('#simulate').addEventListener('click', () => {
  window.scrollTo(0, 0)
  receive()
})
render()
if (review.has('panel')) showPanel()
if (scenario === 'arrival' || scenario === 'burst') setTimeout(() => receive(scenario === 'burst'), 2400)
