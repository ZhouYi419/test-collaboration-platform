const $ = selector => document.querySelector(selector)
const view = $('#view')
const dialog = $('#confirm')
const params = new URLSearchParams(location.search)
const scenario = params.get('state')
const actors = {
  lin: { name: '林溪', role: '测试' },
  su: { name: '苏宁', role: '测试' },
  chen: { name: '陈砚', role: '开发' },
  he: { name: '何启', role: '开发' },
  admin: { name: '周予', role: '管理员' },
}
const statuses = { draft: '草稿', claim: '待领取', todo: '待处理', progress: '处理中', verify: '待验证' }
const types = { bug: 'Bug 修复', request: '需求' }
const sections = { inbox: '待领取', assigned: '我的待办', feedback: '已反馈' }
const priorityOptions = ['P0', 'P1', 'P2', 'P3']
const common = [
  ['priority', '优先级', priorityOptions],
  ['title', '标题', 'title'],
  ['description', '详细描述', 'text'],
]
const specific = {
  bug: [
    ['environment', '发生环境', ['dev', 'uat', 'prd']],
    ['severity', '严重程度', ['致命', '严重', '一般', '轻微']],
    ['steps', '复现步骤', 'text'],
    ['actual', '实际结果', 'pair'],
    ['expected', '预期结果', 'pair'],
    ['version', '影响版本', 'short', true],
  ],
  request: [
    ['background', '需求背景', 'text'],
    ['outcome', '期望效果', 'text'],
    ['acceptance', '验收标准', 'text'],
    ['scope', '影响范围', 'short', true],
    ['due', '期望完成日期', 'date', true],
  ],
}
const dateFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short',
})
const dateTime = value => dateFormat.format(new Date(value))
const log = new File(['2026-11-17 14:31:23 [WARN] filtered report export returned 0 rows.\n'],
  'report-export.log', { type: 'text/plain' })
const exportBug = {
  type: 'bug', priority: 'P1', title: '切换筛选条件后，流水线报告导出为空',
  description: '先导出全部报告，再切换到仅失败。第二次导出只有表头。',
  environment: 'uat', severity: '严重', steps: '1. 打开流水线报告\n2. 导出全部报告\n3. 切换为「仅失败」，再次导出',
  actual: '导出文件只有表头。', expected: '文件包含当前条件下的失败记录。', version: 'v0.2.4',
}
const copyRequest = {
  type: 'request', priority: 'P2', title: '为失败用例增加一键复制编号',
  description: '在缺陷单里引用用例时，需要快速复制用例编号。',
  background: '手动选中编号容易带上前后的空格。', outcome: '点击复制即可得到当前用例的完整编号。',
  acceptance: '从失败用例列表复制后，粘贴的文本与详情中的编号一致。',
}
const demo = (id, form, status, assignee = '', extra = {}) => ({
  id, form, creator: 'lin', status, assignee, files: [], updated: '2026-11-17T14:32:00+08:00', ...extra,
})
const items = scenario === 'empty' ? [] : [
  demo('export', exportBug, 'claim', '', { files: [log] }),
  demo('copy', copyRequest, 'claim', '', { updated: '2026-11-17T11:16:00+08:00' }),
  demo('session', { ...exportBug, title: '移动端切换账号后返回列表，仍短暂显示上一个账号的执行记录',
    priority: 'P0', description: '账号切换完成后使用手机返回手势。返回瞬间能看到上一位账号的用例列表。',
    environment: 'prd', severity: '致命', steps: '切换账号后用手机返回手势回到列表。',
    actual: '短暂显示上一位账号的执行记录。', expected: '列表只显示当前账号可访问的记录。' },
  'claim', '', { updated: '2026-11-16T19:10:00+08:00' }),
  demo('assigned', { ...copyRequest, title: '测试报告保留执行环境快照',
    description: '每次执行都需要记录本次浏览器和操作系统版本。', background: '历史报告无法还原当时的执行环境。',
    outcome: '报告详情显示执行时的浏览器与系统版本。', acceptance: '环境变化后，历史报告仍保留原始版本。' },
  'todo', 'chen', { updated: '2026-11-17T15:04:00+08:00' }),
  demo('working', { ...exportBug, title: '批量重跑后，执行列表未刷新', priority: 'P2',
    description: '批量重跑已启动，但执行列表仍显示原状态。', steps: '选中两条失败记录并批量重跑。',
    actual: '列表仍显示失败。', expected: '列表更新为执行中。' },
  'progress', 'chen', { updated: '2026-11-17T14:49:00+08:00' }),
  demo('verified', { ...exportBug, title: '修复报告详情中失败原因被截断', priority: 'P3',
    description: '超长错误被截断，无法直接复制完整信息。', steps: '打开包含多行错误的报告。',
    actual: '失败原因只显示第一行。', expected: '可展开并复制完整错误内容。' },
  'verify', 'chen', { updated: '2026-11-17T16:02:00+08:00', feedback: '失败原因改为支持展开的多行文本。请用包含换行和长行的报告复测展示及复制。' }),
  demo('draft', { ...exportBug, title: '合并报告后，失败用例的排序发生变化',
    description: '合并两次报告后，失败用例的顺序与原列表不一致。', steps: '合并两次报告后打开失败用例列表。',
    actual: '用例顺序与原报告不一致。', expected: '失败用例按执行时间排序。' },
  'draft', '', { files: [log], updated: '2026-11-17T09:30:00+08:00' }),
]
const developers = scenario === 'no-developers' ? [] : ['chen', 'he']
let route
let pending
let dirty = false
let busy = false
let restore
let rejectNext = scenario === 'write-error'
let claimConflict = scenario === 'race'
let revokeSelection = scenario === 'assignee-revoked'
let loading = scenario === 'loading'
let listFailed = scenario === 'list-error'
let expired = scenario === 'expired'
let listNotice = ''
let queuedNotice = ''
let focusFeedback = false
let confirmResult
let noticeTimer
let sequence = 1

function escaped(value = '') {
  return String(value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char])
}

function current(hash = location.hash || '#chen/inbox') {
  const [key, screen, itemId] = hash.slice(1).split('/')
  const actor = Object.hasOwn(actors, key) ? key : 'chen'
  return { hash, actor, screen: screen || home(actor), itemId, role: actors[actor].role }
}

function home(actor) {
  return actors[actor].role === '测试' ? 'items' : actors[actor].role === '开发' ? 'inbox' : 'account'
}

function href(screen = home(route.actor), issueId) {
  return `#${route.actor}/${screen}${issueId ? `/${issueId}` : ''}`
}

function go(screen, id) {
  const target = href(screen, id)
  if (route.hash === target) return
  location.hash = target
}

function visible(item) {
  if (route.role === '测试') return item.creator === route.actor
  return route.role === '开发' && (item.status === 'claim' || item.assignee === route.actor)
}

function badge(status) {
  return `<span class="issue-state${status === 'draft' ? ' is-draft' : ''}" data-status="${status}">${statuses[status]}</span>`
}

function flash(text) {
  clearTimeout(noticeTimer)
  $('#notice').textContent = text
  noticeTimer = setTimeout(() => { $('#notice').textContent = '' }, 3200)
}

function list() {
  const tester = route.role === '测试'
  const allowed = items.filter(visible).filter(item => tester || {
    inbox: item.status === 'claim',
    assigned: ['todo', 'progress'].includes(item.status),
    feedback: item.status === 'verify',
  }[route.screen])
  const tabs = tester ? '' : `<nav class="queue-tabs" aria-label="开发事项分类">
    ${Object.entries(sections).map(([key, label]) => `<a class="queue-tab" href="${href(key)}"
      ${route.screen === key ? 'aria-current="page"' : ''}>${label}</a>`).join('')}
  </nav>`
  let content
  if (loading) content = '<p class="issue-empty" role="status">正在加载事项…</p>'
  else if (listFailed) content = '<div class="issue-empty"><p role="alert">事项加载失败，请重试。</p><button class="admin-button" type="button" data-action="reload">重新加载</button></div>'
  else if (!allowed.length) {
    const emptyText = { inbox: '暂无待领取事项', assigned: '暂无待办', feedback: '暂无已反馈事项', items: '暂无事项' }
    content = `<div class="issue-empty"><h2>${emptyText[route.screen]}</h2></div>`
  } else {
    content = `<table class="issue-table" aria-label="${tester ? '我的事项' : sections[route.screen]}">
      <colgroup><col><col><col><col><col></colgroup>
      <thead><tr><th scope="col">标题</th><th scope="col">类型</th><th scope="col">优先级</th><th scope="col">状态</th><th scope="col">更新时间</th></tr></thead>
      <tbody>${allowed.sort((a, b) => new Date(b.updated) - new Date(a.updated)).map(item => {
        const { title, type, priority } = item.form
        return `<tr>
          <th scope="row"><a class="issue-title" href="${href(route.screen, item.id)}">${escaped(title || '未命名草稿')}</a></th>
          <td class="issue-type">${types[type] || '未选择'}</td>
          <td><span class="issue-priority${priority === 'P0' ? ' is-urgent' : ''}">${escaped(priority || '—')}</span></td>
          <td>${badge(item.status)}</td><td class="issue-time"><time datetime="${item.updated}">${dateTime(item.updated)}</time></td>
        </tr>`
      }).join('')}</tbody>
    </table>`
  }
  const notice = listNotice ? `<p class="action-error workflow-notice" role="alert">${listNotice}</p>` : ''
  listNotice = ''
  return `<div class="issue-head${tester ? '' : ' is-queue'}"><h1 tabindex="-1">${tester ? '我的事项' : '开发事项'}</h1>
    ${tester ? `<a class="admin-primary create-button" href="${href('new')}"><span aria-hidden="true">+</span>新建事项</a>` : ''}
  </div>${tabs}${notice}${content}`
}

const back = () => `<a class="back-link" href="${href(route.screen === 'new' ? 'items' : route.screen)}">
  <span aria-hidden="true">←</span> ${route.role === '测试' ? '我的事项' : sections[route.screen]}
</a>`
const required = '<span class="required" aria-hidden="true">*</span>'

function field([key, label, kind, optional], value) {
  const attrs = `id="${key}" name="${key}" aria-describedby="${key}-error"${optional ? '' : ' aria-required="true"'}`
  let input
  if (Array.isArray(kind)) {
    input = `<div class="select-control"><select ${attrs}><option value="">请选择</option>${kind.map(option =>
      `<option${option === value ? ' selected' : ''}>${option}</option>`).join('')}</select></div>`
  } else if (kind === 'text' || kind === 'pair') {
    input = `<textarea ${attrs} maxlength="5000">${escaped(value)}</textarea>`
  } else {
    input = `<input ${attrs} type="${kind === 'date' ? 'date' : 'text'}" value="${escaped(value)}"
      ${kind === 'date' ? '' : `maxlength="${kind === 'title' ? 100 : 120}"`}>`
  }
  return `<div class="form-field${kind === 'title' || kind === 'text' ? ' wide' : ''}">
    <label for="${key}">${label}${optional ? '' : required}</label>${input}<p class="field-error" id="${key}-error"></p>
  </div>`
}

function typeSection(form) {
  if (!specific[form.type]) return ''
  const title = form.type === 'bug' ? '复现信息' : '需求信息'
  return `<section class="form-section" aria-label="${title}">
    <h2>${title}</h2><div class="form-grid">${specific[form.type].map(spec => field(spec, form[spec[0]])).join('')}</div>
  </section>`
}

function attachmentRows(files, editable) {
  const size = bytes => bytes < 1000 ? `${bytes} B` : bytes < 1_000_000
    ? `${(bytes / 1000).toFixed(1)} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`
  return files.map((file, index) => `<li><div class="file-name">
    <a href="#" data-download="${index}">${escaped(file.name)}</a>
    <span class="file-size">${size(file.size)}</span>
  </div>${editable ? `<button type="button" class="account-edit" data-remove="${index}" aria-label="移除 ${escaped(file.name)}">移除</button>` : ''}</li>`).join('')
}

function footer(action, label, secondary = '') {
  return `<div class="form-actions workflow-actions">
    <p class="action-error" id="write-error" role="alert"></p>
    <div class="action-buttons">${secondary}<button type="button" class="admin-primary" data-action="${action}">${label}</button></div>
  </div>`
}

function editor(item) {
  pending = { id: item?.id, form: { ...item?.form }, assignee: item?.assignee || '', files: [...(item?.files || [])] }
  const { form } = pending
  return `${back()}<div class="issue-head form-head"><h1 tabindex="-1">${item ? '编辑草稿' : '新建事项'}</h1>
    <p class="reporter">申请人<strong>${actors[route.actor].name}</strong></p></div>
    <form id="issue-form" novalidate>
      <section class="form-section" aria-label="基本信息">
        <h2>基本信息</h2>
        <div class="form-grid basic-grid">
          <fieldset class="type-field"><legend>申请类型${required}</legend>
            <div id="type" class="choices">${Object.entries(types).map(([key, label]) =>
              `<label class="choice"><input type="radio" name="type" value="${key}" aria-required="true" aria-describedby="type-error"
                ${key === form.type ? 'checked' : ''}>${label}</label>`).join('')}</div>
            <p class="field-error" id="type-error"></p>
          </fieldset>
          ${common.map(spec => field(spec, form[spec[0]])).join('')}
        </div>
      </section>
      <section class="form-section" aria-labelledby="assign-title">
        <h2 id="assign-title">分配</h2>
        <div class="form-field assignment-field">
          <label for="assignee">指定开发</label>
          <div class="select-control"><select name="assignee" id="assignee" aria-describedby="assignee-hint assignee-error"
            ${developers.length ? '' : 'disabled'}>
            <option value="">未指定</option>${developers.map(key =>
              `<option value="${key}"${key === pending.assignee ? ' selected' : ''}>${actors[key].name}</option>`).join('')}
          </select></div>
          <p class="file-hint" id="assignee-hint">${developers.length ? '留空时，提交后进入待领取。' : '暂无可指派的开发，提交后进入待领取。'}</p>
          <p class="field-error" id="assignee-error" role="alert"></p>
        </div>
      </section>
      <div id="type-fields">${typeSection(form)}</div>
      <section class="form-section" aria-labelledby="attach-title">
        <h2 id="attach-title">附件</h2>
        <div class="file-control"><button type="button" class="admin-button" data-action="attach">添加附件</button>
          <p class="file-hint">PNG、JPG、TXT、LOG、PDF，每条最多 5 个，每个 10 MB</p>
          <input type="file" id="upload" accept=".png,.jpg,.jpeg,.txt,.log,.pdf" multiple hidden>
        </div>
        <p class="field-error file-error" id="file-error" role="alert"></p>
        <ul class="file-list" id="file-list">${attachmentRows(pending.files, true)}</ul>
      </section>
      ${footer('submit', '提交事项', '<button type="button" class="admin-button" data-action="save">保存草稿</button>')}
    </form>`
}

function detail(item) {
  const { form } = item
  const info = [
    ['申请人', actors[item.creator].name], ['负责人', actors[item.assignee]?.name || '未指定'],
    ['申请类型', types[form.type]], ['优先级', form.priority, `issue-priority${form.priority === 'P0' ? ' is-urgent' : ''}`],
  ]
  const canProcess = route.role === '开发' && item.assignee === route.actor
  let action = ''
  if (route.role === '开发' && item.status === 'claim') action = footer('claim', '领取事项')
  if (canProcess && item.status === 'todo') action = footer('start', '开始处理')
  if (canProcess && item.status === 'progress') {
    action = `<form id="process-form" novalidate>
      <section class="detail-section workflow-feedback"><h2>处理反馈</h2>
        ${field(['feedback', '处理说明', 'text'], pending?.feedback)}
      </section>${footer('finish', '提交处理结果')}
    </form>`
  } else if (item.feedback) {
    const receipt = focusFeedback ? '<p class="feedback-receipt" id="feedback-receipt">处理结果已提交</p>' : ''
    action = `<section class="detail-section workflow-feedback">
      <div class="feedback-heading">
        <h2 tabindex="-1"${receipt ? ' aria-describedby="feedback-receipt"' : ''}>处理反馈</h2>${receipt}
      </div>
      <p class="detail-text">${escaped(item.feedback)}</p>
      <p class="feedback-time">${actors[item.assignee].name} · ${dateTime(item.updated)}</p>
    </section>`
  }
  return `${back()}<div class="detail-head">
    <div class="workflow-heading">${badge(item.status)}
      <span class="workflow-updated">更新于 <time datetime="${item.updated}">${dateTime(item.updated)}</time></span>
    </div><h1 tabindex="-1">${escaped(form.title)}</h1></div>
    <dl class="detail-summary workflow-summary">${info.map(([key, value, style]) =>
      `<div><dt>${key}</dt><dd${style ? ` class="${style}"` : ''}>${escaped(value)}</dd></div>`).join('')}</dl>
    <section class="detail-section"><h2>详细描述</h2><p class="detail-text">${escaped(form.description)}</p></section>
    <section class="detail-section"><h2>${form.type === 'bug' ? '复现信息' : '需求信息'}</h2>
      <dl class="detail-grid">${specific[form.type].filter(([key]) => form[key]).map(([key, label, kind]) =>
        `<div${kind === 'text' ? ' class="wide"' : ''}><dt>${label}</dt><dd>${escaped(form[key])}</dd></div>`).join('')}</dl>
    </section>
    <section class="detail-section"><h2>${item.files.length ? `附件（${item.files.length}）` : '附件'}</h2>
      ${item.files.length ? `<ul class="file-list">${attachmentRows(item.files, false)}</ul>` : '<p class="file-hint">无附件</p>'}
    </section>${action}`
}

function empty(title, message, label, target) {
  return `<div class="issue-head"><h1 tabindex="-1">${title}</h1></div><div class="issue-empty">
    <p>${message}</p>${target ? `<a class="admin-button create-button" href="${target}">${label}</a>`
      : `<button class="admin-button" type="button" data-action="login">${label}</button>`}
  </div>`
}

function render() {
  const actor = actors[route.actor]
  const mainLabel = route.role === '测试' ? '我的事项' : '开发事项'
  const item = items.find(entry => entry.id === route.itemId)
  view.classList.remove('issue-reading', 'issue-detail')
  $('#nav').innerHTML = expired ? '' : `${route.role === '管理员' ? '' : `<a class="nav-link" href="${href()}"
    ${route.screen !== 'account' ? 'aria-current="page"' : ''}><span class="nav-icon list-icon" aria-hidden="true"></span>${mainLabel}</a>`}
    <a class="nav-link" href="${href('account')}" ${route.screen === 'account' ? 'aria-current="page"' : ''}>
      <span class="nav-icon person-icon" aria-hidden="true"></span>我的账号</a>`
  $('#identity').hidden = expired
  $('#identity').innerHTML = `<span class="avatar" aria-hidden="true">${actor.name[0]}</span>
    <div><p class="identity-name">${actor.name}</p><p class="identity-role">${actor.role}</p></div>`
  $('#review').hidden = params.get('review') !== '1'
  $('#review').innerHTML = '<span class="review-label">评审身份</span>' + ['lin', 'chen', 'he'].map(key => `<a href="#${key}/${home(key)}"
    ${route.actor === key ? 'aria-current="true"' : ''}>${actors[key].name} · ${actors[key].role}</a>`).join('')

  if (expired) view.innerHTML = empty('登录已失效', '请重新登录后查看事项。', '重新登录')
  else if (route.screen === 'account') {
    view.innerHTML = `<div class="issue-head"><h1 tabindex="-1">我的账号</h1></div>
      <dl class="account-details"><div><dt>用户名</dt><dd>${actor.name}</dd></div>
      <div><dt>角色</dt><dd>${actor.role}</dd></div></dl>`
  } else if (route.role === '管理员' || (route.role === '开发' ? !Object.hasOwn(sections, route.screen) : !['new', 'items'].includes(route.screen))) {
    view.innerHTML = empty('无权访问', '当前账号无权访问此页面。', '返回工作台', href())
  } else if (route.screen === 'new' || (item?.status === 'draft' && visible(item))) {
    view.classList.add('issue-reading')
    view.innerHTML = editor(route.screen === 'new' ? undefined : item)
  } else if (!route.itemId) view.innerHTML = list()
  else if (!item || !visible(item)) {
    view.innerHTML = empty('事项不可用', '该事项可能已领取、删除，或当前账号无法访问。', '返回列表', href())
  } else {
    view.classList.add('issue-detail')
    view.innerHTML = detail(item)
  }
}

function confirm(title, message, label) {
  if (confirmResult) return Promise.resolve(false)
  $('#confirm-title').textContent = title
  $('#confirm-message').textContent = message
  $('#confirm-action').textContent = label
  return new Promise(resolve => {
    confirmResult = resolve
    dialog.showModal()
  })
}

function confirmDone(accepted) {
  const resolve = confirmResult
  confirmResult = undefined
  dialog.close()
  resolve?.(accepted)
}
dialog.addEventListener('submit', event => {
  event.preventDefault()
  confirmDone(event.submitter.value === 'confirm')
})
dialog.addEventListener('cancel', event => {
  event.preventDefault()
  confirmDone(false)
})

async function navigate() {
  const target = current()
  if (route?.hash === target.hash) return
  if (busy || dirty) {
    history.replaceState(null, '', route.hash)
    if (busy || !await confirm('放弃本次修改？', '本次修改尚未保存。', '放弃修改')) return
    dirty = false
    location.hash = target.hash
    return
  }
  if (route && !route.itemId && target.itemId && route.actor === target.actor) {
    restore = { list: route.hash, row: target.hash, y: window.scrollY }
  }
  const moved = !!route
  const changedTab = route?.role === '开发' && route.actor === target.actor
    && !route.itemId && !target.itemId && Object.hasOwn(sections, route.screen) && Object.hasOwn(sections, target.screen)
  route = target
  pending = undefined
  if (route.itemId || route.screen === 'new') $('#notice').textContent = ''
  render()
  if (queuedNotice) {
    flash(queuedNotice)
    queuedNotice = ''
  }
  if (focusFeedback) {
    focusFeedback = false
    const feedback = view.querySelector('.workflow-feedback')
    feedback?.querySelector('h2')?.focus({ preventScroll: true })
    feedback?.scrollIntoView({ block: 'end' })
    return
  }
  const backTo = restore && route.hash === restore.list
  const row = backTo && view.querySelector(`a[href=${CSS.escape(restore.row)}]`)
  if (row) {
    window.scrollTo(0, restore.y)
    row.focus({ preventScroll: true })
    restore = undefined
  } else {
    window.scrollTo(0, 0)
    if (moved) $(changedTab ? '.queue-tab[aria-current="page"]' : 'main h1')?.focus({ preventScroll: true })
  }
}

function showFieldError(key, message) {
  const control = $(`#${key}`)
  if (message) control?.setAttribute('aria-invalid', 'true')
  else control?.removeAttribute('aria-invalid')
  const error = $(`#${key}-error`)
  if (error) error.textContent = message
}

function focusField(key) {
  const control = key === 'type' ? $('input[name=type]') : $(`#${key}`)
  control?.focus({ preventScroll: true })
  control?.closest('.form-field, .type-field')?.scrollIntoView({ block: 'center' })
}

function validate() {
  const { form } = pending
  const fields = [['type', '申请类型', []], ...common, ...(specific[form.type] || [])]
  const absent = fields.filter(([key, , , optional]) => !optional && !form[key]?.trim())
  absent.forEach(([key, label, kind]) => showFieldError(key, `请${Array.isArray(kind) ? '选择' : '填写'}${label}`))
  if (absent.length) focusField(absent[0][0])
  return absent.length === 0
}

async function write(action, button) {
  if (busy) return
  const item = items.find(entry => entry.id === route.itemId)
  if (action === 'submit' && !validate()) return
  if (action === 'finish' && !pending?.feedback?.trim()) {
    showFieldError('feedback', '请填写处理说明')
    focusField('feedback')
    return
  }
  if (action === 'claim' && !await confirm('领取事项？', '领取后，你将成为该事项的负责人。', '确认领取')) return
  const controls = [...view.querySelectorAll('button, input, select, textarea')].filter(control => !control.disabled)
  const label = button.textContent
  const error = $('#write-error')
  const progressLabels = { claim: '领取中…', start: '更新中…', finish: '提交中…', save: '保存中…', submit: '提交中…' }
  busy = true
  error.textContent = ''
  controls.forEach(control => { control.disabled = true })
  button.textContent = progressLabels[action]
  await new Promise(resolve => setTimeout(resolve, 520))
  busy = false
  controls.forEach(control => { control.disabled = false })
  button.textContent = label
  if (rejectNext) {
    rejectNext = false
    error.textContent = '网络连接失败，请重试。'
    button.focus({ preventScroll: true })
    if (action === 'finish') button.scrollIntoView({ block: 'nearest' })
    return
  }
  if (action === 'submit' && revokeSelection && pending.assignee) {
    revokeSelection = false
    const unavailable = developers.indexOf(pending.assignee)
    developers.splice(unavailable, 1)
    const select = $('#assignee')
    const option = [...select.options].find(candidate => candidate.value === pending.assignee)
    option?.remove()
    pending.assignee = ''
    select.value = ''
    showFieldError('assignee', '该开发账号已不可用，请重新选择。')
    focusField('assignee')
    return
  }
  const now = new Date().toISOString()
  if (action === 'claim' && claimConflict) {
    claimConflict = false
    Object.assign(item, { status: 'todo', assignee: route.actor === 'chen' ? 'he' : 'chen', updated: now })
    listNotice = '该事项已被其他开发领取。'
    restore = undefined
    go('inbox')
    return
  }
  if (action === 'save' || action === 'submit') {
    const form = Object.fromEntries(Object.entries(pending.form).filter(([key]) =>
      key === 'type' || common.some(field => field[0] === key) || specific[pending.form.type]?.some(field => field[0] === key))
      .map(([key, value]) => [key, value.trim()]))
    const change = { ...pending, form, updated: now, status: action === 'save' ? 'draft' : pending.assignee ? 'todo' : 'claim' }
    if (item) Object.assign(item, change)
    else items.push({ ...change, id: `new-${sequence++}`, creator: route.actor })
    dirty = false
    restore = undefined
    queuedNotice = action === 'save' ? '草稿已保存' : '事项已提交'
    go('items')
    return
  }
  if (action === 'claim') {
    Object.assign(item, { status: 'todo', assignee: route.actor, updated: now })
    restore = undefined
    queuedNotice = '事项已领取'
    go('assigned', item.id)
  } else if (action === 'start') {
    const y = window.scrollY
    Object.assign(item, { status: 'progress', updated: now })
    pending = { feedback: '' }
    render()
    window.scrollTo(0, y)
    focusField('feedback')
  } else {
    Object.assign(item, { status: 'verify', feedback: pending.feedback.trim(), updated: now })
    dirty = false
    restore = undefined
    focusFeedback = true
    go('feedback', item.id)
  }
}

function download(file) {
  if (!file) return
  const link = document.createElement('a')
  const url = URL.createObjectURL(file)
  link.href = url
  link.download = file.name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

view.addEventListener('focusin', event => {
  if (!event.target.matches('[data-download]')) return
  const actionBar = view.querySelector(':scope > .workflow-actions')
  const row = event.target.closest('li')
  if (!actionBar || !row) return
  const overlap = row.getBoundingClientRect().bottom + 8 - actionBar.getBoundingClientRect().top
  if (overlap > 0) window.scrollBy(0, overlap)
})

view.addEventListener('input', event => {
  const { name, value } = event.target
  if (!name || ['assignee', 'type'].includes(name)) return
  if (name === 'feedback') pending = { feedback: value }
  else if (pending?.form) pending.form[name] = value
  dirty = true
  showFieldError(name, '')
})
view.addEventListener('change', event => {
  if (!pending?.form) return
  const control = event.target
  if (control.name === 'type') {
    pending.form.type = control.value
    $('#type-fields').innerHTML = typeSection(pending.form)
    $('#type-fields section')?.classList.add('type-changed')
  } else if (control.name === 'assignee') {
    pending.assignee = control.value
  } else if (control.id === 'upload') {
    const errors = []
    for (const file of control.files) {
      if (!/\.(png|jpe?g|txt|log|pdf)$/i.test(file.name)) errors.push(`${file.name} 的格式不受支持。`)
      else if (file.size > 10_000_000) errors.push(`${file.name} 超过 10 MB。`)
      else if (pending.files.length === 5) {
        errors.push('每条事项最多添加 5 个附件。')
        break
      } else pending.files.push(file)
    }
    $('#file-error').textContent = errors.join(' ')
    $('#file-list').innerHTML = attachmentRows(pending.files, true)
    control.value = ''
  } else if (control.name) {
    pending.form[control.name] = control.value
  }
  if (control.name) showFieldError(control.name, '')
  dirty = true
})
view.addEventListener('submit', event => {
  event.preventDefault()
  const button = view.querySelector(event.target.id === 'process-form' ? '[data-action=finish]' : '[data-action=submit]')
  if (button) void write(button.dataset.action, button)
})
view.addEventListener('click', event => {
  const target = event.target.closest('[data-action], [data-download], [data-remove]')
  if (!target) return
  const { action, download: fileIndex, remove } = target.dataset
  if (fileIndex !== undefined) {
    event.preventDefault()
    const files = pending?.files || items.find(item => item.id === route.itemId)?.files
    download(files?.[Number(fileIndex)])
  } else if (remove !== undefined) {
    pending.files.splice(Number(remove), 1)
    dirty = true
    $('#file-list').innerHTML = attachmentRows(pending.files, true)
    $('#file-error').textContent = ''
    const focusTarget = $('#file-list button') || $('[data-action=attach]')
    focusTarget.focus()
  } else if (action === 'attach') $('#upload').click()
  else if (action === 'reload') {
    listFailed = false
    render()
    $('main h1')?.focus()
  } else if (action === 'login') {
    expired = false
    render()
    $('main h1')?.focus()
  } else void write(action, target)
})
window.addEventListener('hashchange', () => { void navigate() })
void navigate()
if (loading) setTimeout(() => {
  loading = false
  if (!route.itemId && route.screen !== 'new') render()
}, 850)
