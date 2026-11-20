const view = document.querySelector('#view')
const dialog = document.querySelector('#confirm')
const scenario = new URLSearchParams(location.search).get('case')
const clock = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short',
})
const people = {
  tester: ['林溪', '测试'], developer: ['陈砚', '开发'], colleague: ['苏宁', '测试'],
}
const states = {
  pending_work: '待处理', in_progress: '处理中', pending_verify: '待验证', closed: '已关闭',
}
const queues = { inbox: '待领取', assigned: '我的待办', feedback: '已反馈' }
const icons = {
  bug: '<rect x="8" y="7" width="8" height="12" rx="4"/><path d="m9 7-2-3m8 3 2-3M4 10h4m8 0h4M4 14h4m8 0h4M6 19l2-2m8 0 2 2M12 11v4"/>',
  request: '<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M12 9v6m-3-3h6"/>',
  inbox: '<path d="M4 6h16l2 9v4H2v-4l2-9Z"/><path d="M2 15h6l2 2h4l2-2h6"/>',
  assigned: '<rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 4h6v3H9zm0 10 2 2 4-4"/>',
  feedback: '<path d="M5 5h14v11h-6l-5 4v-4H5Z"/><path d="M9 10h6"/>',
  arrow: '<path d="m10 6 6 6-6 6"/>',
  down: '<path d="M12 4v12m-4-4 4 4 4-4M5 19h14"/>',
  jump: '<path d="M12 5v14m-5-5 5 5 5-5"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  returned: '<path d="m8 7-4 4 4 4m-4-4h11a4 4 0 0 1 0 8h-3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
}
const longReason = '在预发布环境依次导出全部报告和失败报告。第二个文件包含失败记录，但同时带出了执行通过的记录。使用包含历史重试的流水线重新验证，结果一致。请按当前筛选条件导出最后一次执行结果，并确认含重试记录时也只保留失败项。'

function samples() {
  if (scenario === 'empty') return []
  const report = {
    id: 'report', type: 'bug', priority: 'P1', assignee: 'developer', status: 'pending_verify',
    title: '切换筛选条件后，流水线报告导出为空',
    description: '在 UAT 中打开流水线报告。首次导出全部记录后，将筛选条件切换为「仅失败」，再次导出的 CSV 只有表头。',
    properties: [
      ['发生环境', 'uat'], ['严重程度', '严重'],
      ['复现步骤', '1. 打开有成功和失败记录的流水线报告。\n2. 导出全部记录。\n3. 切换为「仅失败」，再次导出。', 'wide'],
      ['实际结果', 'CSV 只包含表头。', 'actual'], ['预期结果', 'CSV 包含当前筛选条件下的全部失败记录。', 'expected'],
      ['影响版本', 'v0.2.4'],
    ],
    file: 'report-export-uat.log',
    feedback: '已修复切换筛选后导出请求沿用旧条件的问题。请在 UAT 先导出全部记录，再切换「仅失败」重试。',
    feedbackAt: '2026-11-20T15:24:00+08:00', results: [],
  }
  const requirement = {
    id: 'copy', type: 'request', priority: 'P2', assignee: 'developer', status: 'pending_verify',
    title: '为失败用例增加一键复制编号',
    description: '整理缺陷单时需引用失败用例。希望能从「失败用例」列表直接复制编号，粘贴至缺陷单。',
    properties: [
      ['需求背景', '手动选中编号时容易带上空格或截断文本。', 'wide'],
      ['期望效果', '点击复制后可粘贴当前用例的完整编号。', 'wide'],
      ['验收标准', '粘贴内容与详情中的编号一致，包含前缀且无多余空格。', 'wide'],
    ],
    feedback: '已在失败用例列表增加复制按钮和结果提示。可以选一条有多段前缀的用例，核对粘贴内容。',
    feedbackAt: '2026-11-20T14:56:00+08:00', results: [],
  }
  const items = [report, requirement, {
    ...requirement, id: 'snapshot', results: [], title: '报告详情保留执行环境快照',
    description: '报告详情应保留用例执行时的浏览器和操作系统版本。',
    properties: [
      ['需求背景', '浏览器升级后，历史报告无法还原执行环境。', 'wide'],
      ['期望效果', '报告详情显示执行时的浏览器与操作系统版本。', 'wide'],
      ['验收标准', '环境变化后，历史报告仍显示执行时的版本。', 'wide'],
    ],
    status: 'in_progress', feedback: '', feedbackAt: '', updated: '2026-11-20T13:34:00+08:00',
  }]
  for (const item of items) item.updated ||= item.feedbackAt
  if (['returned', 'reverify', 'closed'].includes(scenario)) {
    const at = '2026-11-20T15:42:00+08:00'
    verify(report, scenario === 'closed' ? 'passed' : 'returned', scenario === 'closed' ? '' : longReason, at)
    if (scenario === 'reverify') {
      finish(report, '已修正含历史重试记录时的筛选逻辑。导出仅保留最后一次执行失败的记录，请用上次复验使用的流水线重试。', '2026-11-20T16:08:00+08:00')
    }
  }
  return items
}

let items = samples()
let route = parseRoute(location.hash)
let listPosition
let editor = ''
let draft = ''
let error = ''
let busy = false
let receipt = ''
let stale = false
let loadState = scenario === 'loading' ? 'loading' : scenario === 'load-error' ? 'failed' : ''
let injectFailure = ['write-error', 'conflict'].includes(scenario)

function parseRoute(hash) {
  const [actor, section, id] = hash.slice(1).split('/')
  if (actor === 'developer') return { actor, queue: Object.hasOwn(queues, section) ? section : 'assigned', id }
  return { actor: actor === 'colleague' ? actor : 'tester', id: section }
}

function available(current) {
  return items.find(item => item.id === current.id && (
    current.actor === 'tester' || item.assignee === current.actor
  ))
}

function escaped(text) {
  return String(text ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

function icon(key) {
  return '<svg class="issue-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' + icons[key] + '</svg>'
}

function badge(status) {
  return '<span class="issue-state" data-status="' + status + '">' + states[status] + '</span>'
}

function formatted(value) {
  return '<time datetime="' + value + '">' + clock.format(new Date(value)) + '</time>'
}

function listTarget(item) {
  if (route.actor !== 'developer') return '#' + route.actor
  if (!item) return '#developer/' + route.queue
  return '#developer/' + (['pending_verify', 'closed'].includes(item.status) ? 'feedback' : 'assigned')
}

function goToAccount() {
  return '../t005/index.html#' + ({ tester: 'lin', colleague: 'su', developer: 'chen' })[route.actor] + '/account'
}

function shell() {
  const developer = route.actor === 'developer'
  const [name, role] = people[route.actor]
  document.querySelector('#identity').innerHTML = '<span class="avatar" aria-hidden="true">' + name[0] + '</span><div><p class="identity-name">' + name + '</p><p class="identity-role">' + role + '</p></div>'
  document.querySelector('#workspace-nav').innerHTML =
    '<a class="nav-link" data-route aria-current="page" href="' + (developer ? '#developer/inbox' : '#' + route.actor) + '"><span class="nav-icon list-icon" aria-hidden="true"></span>' +
    (developer ? '开发事项' : '我的事项') + '</a><a class="nav-link" href="' + goToAccount() + '"><span class="nav-icon person-icon" aria-hidden="true"></span>我的账号</a>'
}

function list() {
  const developer = route.actor === 'developer'
  const title = developer ? '开发事项' : '我的事项'
  const heading = '<div class="issue-head' + (developer ? ' is-queue' : '') + '"><h1 tabindex="-1">' + title + '</h1>' +
    (developer ? '' : '<a class="admin-primary create-button" href="../t005/index.html#lin/new">' + icon('plus') + '新建事项</a>') + '</div>'
  const tabs = developer ? '<nav class="queue-tabs" aria-label="开发事项分类">' + Object.entries(queues).map(([id, label]) =>
    '<a class="queue-tab" data-route href="#developer/' + id + '"' + (id === route.queue ? ' aria-current="page"' : '') + '>' + icon(id) + label + '</a>'
  ).join('') + '</nav>' : ''
  const result = items.filter(item => {
    if (route.actor === 'colleague') return false
    if (!developer) return true
    if (item.assignee !== route.actor) return false
    if (route.queue === 'assigned') return ['pending_work', 'in_progress'].includes(item.status)
    return route.queue === 'feedback' && ['pending_verify', 'closed'].includes(item.status)
  }).sort((a, b) => b.updated.localeCompare(a.updated))
  if (!result.length) {
    const empty = { inbox: '暂无待领取事项', assigned: '暂无待办', feedback: '暂无已反馈事项' }
    return heading + tabs + '<div class="issue-empty"><h2>' + (developer ? empty[route.queue] : '暂无事项') + '</h2></div>'
  }
  const rows = result.map(item => {
    const type = item.type === 'bug' ? 'Bug 修复' : '需求'
    return '<tr><th scope="row"><div class="issue-title-cell"><span class="item-symbol" data-type="' + item.type + '">' + icon(item.type) +
      '</span><a class="issue-title" data-route href="' + listTarget(item) + '/' + item.id + '">' + escaped(item.title) + '</a></div></th>' +
      '<td class="issue-type">' + type + '</td><td><span class="issue-priority" data-priority="' + item.priority + '">' + item.priority +
      '</span></td><td>' + badge(item.status) + '</td><td class="issue-time">' + formatted(item.updated) + '<span class="row-arrow">' + icon('arrow') + '</span></td></tr>'
  }).join('')
  return heading + tabs + '<div class="issue-list-panel"><table class="issue-table" aria-label="' + (developer ? queues[route.queue] : title) +
    '"><colgroup><col><col><col><col><col></colgroup><thead><tr><th scope="col">标题</th><th scope="col">类型</th><th scope="col">优先级</th><th scope="col">状态</th><th scope="col">更新时间</th></tr></thead><tbody>' +
    rows + '</tbody></table></div>'
}

function section(title, content, id = '') {
  const headingId = id ? ' id="' + id + '" tabindex="-1"' : ''
  return '<section class="detail-section"><h2' + headingId + '>' + title + '</h2>' + content + '</section>'
}

function feedbackSection(item) {
  const submitted = receipt === '处理结果已提交'
  return section(item.status === 'in_progress' ? '上次处理反馈' : '处理反馈',
    '<p class="detail-text">' + escaped(item.feedback) + '</p><p class="feedback-time">陈砚 · ' + formatted(item.feedbackAt) + '</p>' +
    (submitted ? '<p class="feedback-time flow-receipt">' + receipt + '</p>' : ''), 'feedback-heading')
}

function resultSection(item, result) {
  const returned = result.outcome === 'returned'
  const previous = item.status === 'pending_verify'
  return section(previous ? '上次验证' : '验证结果',
    '<p class="review-outcome" data-outcome="' + result.outcome + '">' + icon(returned ? 'returned' : 'check') +
    (returned ? '验证未通过，已退回' : '验证通过') + '</p>' +
    (returned ? '<p class="detail-text review-reason">' + escaped(result.reason) + '</p>' : '') +
    '<p class="review-meta">' + people[result.tester][0] + ' · ' + formatted(result.at) + '</p>', 'result-heading')
}

function button(action, label, kind = 'admin-button') {
  return '<button class="' + kind + '" type="button" data-action="' + action + '">' + label + '</button>'
}

function submitButton(label) {
  return '<button class="admin-primary workflow-submit" type="submit"><span>' + label + '</span><span class="inactive-label" aria-hidden="true">提交中…</span></button>'
}

function textEditor(id, label, submit, cancel = false) {
  return '<form class="review-editor" novalidate><div class="form-field"><label for="' + id + '">' + label +
    '<span class="required" aria-hidden="true">*</span></label><textarea id="' + id + '" maxlength="5000" aria-required="true">' +
    escaped(draft) + '</textarea><p class="field-error" id="field-error"></p></div>' +
    '<p class="action-error" id="write-error" role="alert">' + escaped(error) + '</p><div class="action-buttons review-actions">' +
    (cancel ? button('cancel-editor', '取消') : '') + submitButton(submit) + '</div></form>'
}

function workflow(item) {
  const canReview = route.actor === 'tester' && item.status === 'pending_verify'
  const canProcess = route.actor === 'developer' && item.status === 'in_progress'
  const result = item.results.at(-1)
  // 重新处理时先呈现退回原因，再提供新说明的输入框。
  const sections = []
  if (canProcess && result) sections.push(resultSection(item, result))
  if (item.feedback) sections.push(feedbackSection(item))
  if (!canProcess && result) sections.push(resultSection(item, result))
  if (canReview) {
    sections.push(section('测试验证', editor === 'return' ? textEditor('reason', '退回原因', '退回开发', true) :
      '<p class="action-error" id="write-error" role="alert">' + escaped(error) + '</p><div class="action-buttons review-actions">' +
      button('open-return', '验证不通过') + button('pass', '通过并关闭', 'admin-primary workflow-submit') + '</div>', 'review-heading'))
  }
  if (canProcess) {
    sections.push(section(result ? '重新提交反馈' : '处理反馈', textEditor('feedback', '处理说明', '提交处理结果'), 'process-heading'))
  }
  return sections.length ? '<div class="detail-workflow"><div class="workflow-panel review-surface">' + sections.join('') + '</div></div>' : ''
}

function detail(item) {
  const info = [['申请人', '林溪'], ['负责人', '陈砚'], ['申请类型', item.type === 'bug' ? 'Bug 修复' : '需求'], ['优先级', item.priority]]
  const properties = '<section class="detail-section detail-properties" aria-labelledby="property-heading"><h2 id="property-heading">事项属性</h2><dl class="detail-summary">' +
    info.map(([label, value]) => '<div><dt>' + label + '</dt><dd>' + value + '</dd></div>').join('') + '</dl></section>'
  const jump = route.actor === 'tester' && item.status === 'pending_verify' ? '测试验证' :
    route.actor === 'developer' && item.status === 'in_progress' ? (item.results.length ? '查看退回原因' : '处理反馈') : ''
  const content = section('详细描述', '<p class="detail-text">' + escaped(item.description) + '</p>') +
    section(item.type === 'bug' ? '复现信息' : '需求信息', '<dl class="detail-grid">' +
      item.properties.map(([label, value, layout]) => '<div' +
        (layout === 'wide' ? ' class="wide"' : ['actual', 'expected'].includes(layout) ? ' class="comparison" data-comparison="' + layout + '"' : '') +
        '><dt>' + label + '</dt><dd>' + escaped(value) + '</dd></div>').join('') + '</dl>') +
    section(item.file ? '附件（1）' : '附件', item.file ? '<ul class="file-list"><li><a class="file-download" download="' + item.file +
      '" href="data:text/plain;charset=utf-8,%5BWARN%5D%20export%20returned%200%20rows">' + icon('down') + '<span>' + item.file +
      '</span></a><span class="file-size">29 B</span></li></ul>' : '<p class="file-hint">无附件</p>')
  return '<a class="back-link" data-route href="' + listTarget(item) + '"><span aria-hidden="true">←</span> ' +
    (route.actor === 'developer' ? '开发事项' : '我的事项') + '</a><div class="detail-head"><h1 tabindex="-1">' +
    escaped(item.title) + '</h1><div class="workflow-heading">' + badge(item.status) + '<span class="workflow-updated">更新于 ' +
    formatted(item.updated) + '</span>' + (jump ? '<button type="button" class="admin-button feedback-jump review-jump" data-action="jump">' + jump + icon('jump') + '</button>' : '') +
    '</div></div><div class="detail-layout">' + properties + '<div class="detail-content">' + content + '</div>' + workflow(item) + '</div>'
}

function render() {
  shell()
  const item = available(route)
  if (loadState) {
    view.innerHTML = '<div class="issue-head"><h1 tabindex="-1">' + (route.id ? '事项详情' : route.actor === 'developer' ? '开发事项' : '我的事项') +
      '</h1></div><div class="issue-empty">' + (loadState === 'loading' ? '<p role="status">正在加载事项…</p>' :
        '<p role="alert">暂时无法读取事项，请重试。</p>' + button('reload', '重新加载')) + '</div>'
  } else if (route.id && !item) {
    view.innerHTML = '<div class="issue-head"><h1 tabindex="-1">事项不可用</h1></div><div class="issue-empty"><p role="alert">事项不存在或当前账号无法访问。</p>' +
      '<a class="admin-button create-button" data-route href="' + listTarget() + '">返回列表</a></div>'
  } else {
    view.innerHTML = item ? detail(item) : list()
  }
  if (stale && item) showConflict()
}

function focusOn(element) {
  if (!element) return
  element.focus({ preventScroll: true })
  const bounds = element.getBoundingClientRect()
  const header = document.querySelector('.workspace-header')
  const top = getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().bottom : 0
  if (bounds.top < top + 10 || bounds.bottom > innerHeight - 12) element.scrollIntoView({ block: 'center' })
}

function clearEditor() {
  editor = ''
  draft = ''
  receipt = ''
  error = ''
  stale = false
}

function verify(item, outcome, reason, at) {
  item.results.push({ outcome, reason, at, tester: 'tester', feedback: item.feedback, feedbackAt: item.feedbackAt })
  item.status = outcome === 'passed' ? 'closed' : 'in_progress'
  item.updated = at
}

function finish(item, feedback, at) {
  Object.assign(item, { status: 'pending_verify', feedback, feedbackAt: at, updated: at })
}

function ask(title, message, label) {
  document.querySelector('#confirm-title').textContent = title
  document.querySelector('#confirm-message').textContent = message
  document.querySelector('#confirm-action').textContent = label
  dialog.returnValue = 'cancel'
  dialog.showModal()
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true })
  })
}

function showConflict() {
  const message = view.querySelector('#write-error')
  if (!message) return
  message.textContent = '事项已更新。请重新加载后查看当前验证结果。'
  message.nextElementSibling.innerHTML = button('reload', '重新加载')
  const field = view.querySelector('textarea')
  if (field) field.readOnly = true
}

function setBusy(trigger, active) {
  busy = active
  const form = trigger.closest('form')
  const buttons = form ? form.querySelectorAll('button') : trigger.parentElement.querySelectorAll('button')
  for (const control of buttons) {
    if (active) control.setAttribute('aria-disabled', 'true')
    else control.removeAttribute('aria-disabled')
  }
  const textarea = form?.querySelector('textarea')
  if (textarea) textarea.readOnly = active
  const labels = trigger.querySelectorAll('span')
  for (const [index, label] of [...labels].entries()) {
    const inactive = active ? index === 0 : index !== 0
    label.classList.toggle('inactive-label', inactive)
    label.setAttribute('aria-hidden', String(inactive))
  }
}

async function write(action, trigger) {
  const item = available(route)
  if (!item || busy || stale) return
  const text = draft.trim()
  const field = view.querySelector('textarea')
  const validation = view.querySelector('#field-error')
  if (action !== 'passed' && (!text || [...text].length > 5000)) {
    validation.textContent = text ? '请将内容缩短至 5000 字以内。' : action === 'returned' ? '请填写退回原因。' : '请填写处理说明。'
    field.setAttribute('aria-invalid', 'true')
    field.setAttribute('aria-describedby', 'field-error')
    focusOn(field)
    return
  }
  const errorBox = view.querySelector('#write-error')
  errorBox.textContent = ''
  setBusy(trigger, true)
  await new Promise(resolve => setTimeout(resolve, 680))
  setBusy(trigger, false)
  if (injectFailure && (scenario === 'write-error' || action !== 'finish')) {
    injectFailure = false
    if (scenario === 'conflict') {
      verify(item, 'passed', '', new Date().toISOString())
      stale = true
      showConflict()
      focusOn(view.querySelector('[data-action="reload"]'))
      return
    }
    error = '暂时无法提交，请检查网络连接后重试。已填写的内容会保留。'
    errorBox.textContent = error
    focusOn(trigger)
    return
  }
  const now = new Date().toISOString()
  clearEditor()
  if (action === 'finish') {
    finish(item, text, now)
    receipt = '处理结果已提交'
  } else {
    verify(item, action, text, now)
    receipt = action === 'passed' ? '事项已关闭' : '已退回给陈砚重新处理'
  }
  render()
  document.querySelector('#announcement').textContent = receipt
  focusOn(view.querySelector(action === 'finish' ? '#feedback-heading' : '#result-heading'))
}

document.addEventListener('input', event => {
  if (!event.target.matches('.review-editor textarea')) return
  draft = event.target.value
  event.target.removeAttribute('aria-invalid')
  event.target.removeAttribute('aria-describedby')
  view.querySelector('#field-error').textContent = ''
})

view.addEventListener('submit', event => {
  if (!event.target.matches('.review-editor')) return
  event.preventDefault()
  void write(editor === 'return' ? 'returned' : 'finish', event.submitter ?? event.target.querySelector('[type="submit"]'))
})

document.addEventListener('click', async event => {
  const trigger = event.target.closest('[data-action]')
  if (!trigger || busy) return
  const action = trigger.dataset.action
  if (action === 'open-return') {
    editor = 'return'
    error = ''
    render()
    focusOn(view.querySelector('#reason'))
  } else if (action === 'cancel-editor') {
    if (draft.trim() && !await ask('放弃退回原因？', '已经输入的原因将被清除。', '放弃修改')) return
    clearEditor()
    render()
    focusOn(view.querySelector('[data-action="open-return"]'))
  } else if (action === 'pass') {
    if (await ask('通过验证并关闭？', '事项关闭后，提交人和负责人仍可查看验证结果。', '确认关闭')) {
      trigger.innerHTML = '<span>通过并关闭</span><span class="inactive-label" aria-hidden="true">提交中…</span>'
      void write('passed', trigger)
    }
  } else if (action === 'jump') {
    const item = available(route)
    const target = route.actor === 'tester' ? '#review-heading' : item.results.length ? '#result-heading' : '#process-heading'
    focusOn(view.querySelector(target))
  } else if (action === 'reload') {
    const conflict = stale
    loadState = ''
    clearEditor()
    render()
    focusOn(view.querySelector(conflict ? '#result-heading' : 'h1'))
  } else if (action === 'reset') {
    items = samples()
    injectFailure = ['write-error', 'conflict'].includes(scenario)
    loadState = ''
    clearEditor()
    render()
    window.scrollTo(0, 0)
    focusOn(view.querySelector('h1'))
  }
})

window.addEventListener('hashchange', async event => {
  const previousHash = new URL(event.oldURL).hash || '#tester'
  if (busy || (draft.trim() && !await ask('放弃本次修改？', '已经输入的内容尚未提交。', '放弃修改'))) {
    history.replaceState(null, '', previousHash)
    return
  }
  const next = parseRoute(location.hash)
  if (!route.id && next.id) listPosition = { hash: location.hash, y: scrollY }
  route = next
  clearEditor()
  render()
  const links = [...view.querySelectorAll('.issue-title')]
  const priorLink = !route.id && links.find(link => link.hash === listPosition?.hash)
  window.scrollTo(0, priorLink ? listPosition.y : 0)
  focusOn(priorLink || view.querySelector('h1'))
})

window.addEventListener('beforeunload', event => {
  if (draft.trim() || busy) event.preventDefault()
})

render()
if (loadState === 'loading') {
  setTimeout(() => {
    loadState = ''
    render()
  }, 680)
}
