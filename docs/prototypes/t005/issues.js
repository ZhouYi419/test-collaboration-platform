const $ = selector => document.querySelector(selector)
const view = $('#view')
const dialog = $('#confirm')
const params = new URLSearchParams(location.search)
const scenario = params.get('state')
const coreMode = params.get('design') !== 'legacy'
document.body.classList.toggle('core-design', coreMode)
const actors = {
  lin: { name: '林溪', email: 'lin.xi@example.test', role: '测试' },
  su: { name: '苏宁', email: 'su.ning@example.test', role: '测试' },
  chen: { name: '陈砚', email: 'chen.yan@example.test', role: '开发' },
  he: { name: '何启', email: 'he.qi@example.test', role: '开发' },
  admin: { name: '周予', email: 'zhou.yu@example.test', role: '管理员' },
  operator: { name: '秦禾', email: 'qin.he@example.test', role: '未分配', operator: true },
  member: { name: '叶澄', email: 'ye.cheng@example.test', role: '未分配' },
}
const statuses = { draft: '草稿', claim: '待领取', todo: '待处理', progress: '处理中', verify: '待验证' }
const types = { bug: 'Bug 修复', request: '需求' }
const sections = { inbox: '待领取', assigned: '我的待办', feedback: '已反馈' }
const iconPaths = {
  list: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8m-8 5h5"/>',
  user: '<circle cx="12" cy="8" r="3"/><path d="M5 20v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 19v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1m2-14a3 3 0 1 1 0 6m1 3a4 4 0 0 1 3 4v1"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v2"/>',
  inbox: '<path d="M4 6h16l2 9v4H2v-4l2-9Z"/><path d="M2 15h6l2 2h4l2-2h6"/>',
  assigned: '<rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 4h6v3H9zm0 10 2 2 4-4"/>',
  feedback: '<path d="M5 5h14v11h-6l-5 4v-4H5Z"/><path d="M9 10h6"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4m0 4h.01"/>',
  bug: '<rect x="8" y="7" width="8" height="12" rx="4"/><path d="m9 7-2-3m8 3 2-3M4 10h4m8 0h4M4 14h4m8 0h4M6 19l2-2m8 0 2 2M12 11v4"/>',
  request: '<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M12 9v6m-3-3h6"/>',
  draft: '<path d="M13 4H6v16h12v-9m-9 5 1-4 7-7 3 3-7 7-4 1Z"/>',
  file: '<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 13h6m-6 4h6"/>',
  arrow: '<path d="m10 6 6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
}
function icon(key) {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${iconPaths[key]}</svg>`
}
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
const longLog = new File(['[WARN] Retry restored a stale execution status.\n'],
  'android-runner-execution-retry-status-after-account-switch-with-slow-network-regression.log', { type: 'text/plain' })
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
    description: '在 UAT 的回归执行列表中批量重跑失败用例。任务已启动，但列表仍显示旧状态，直到手动刷新页面。测试人员无法判断重跑是否已受理。',
    steps: '打开回归执行列表，筛选失败用例。\n选中两条失败记录，点击「批量重跑」。\n等待启动提示出现，观察列表中的执行状态。',
    actual: '两条记录持续显示「失败」，手动刷新后才更新。', expected: '重跑受理后，所选记录主动更新为「执行中」。' },
  'progress', 'chen', { files: [longLog], updated: '2026-11-17T14:49:00+08:00' }),
  demo('verified', { ...exportBug, title: '修复报告详情中失败原因被截断', priority: 'P3',
    description: '超长错误被截断，无法直接复制完整信息。', steps: '打开包含多行错误的报告。',
    actual: '失败原因只显示第一行。', expected: '可展开并复制完整错误内容。' },
  'verify', 'chen', { updated: '2026-11-17T16:02:00+08:00', feedback: '失败原因改为支持展开的多行文本。请用包含换行和长行的报告复测展示及复制。' }),
  demo('draft', { ...exportBug, title: '合并报告后，失败用例的排序发生变化',
    description: '合并两次报告后，失败用例的顺序与原列表不一致。', steps: '合并两次报告后打开失败用例列表。',
    actual: '用例顺序与原报告不一致。', expected: '失败用例按执行时间排序。' },
  'draft', '', { files: [log], updated: '2026-11-17T09:30:00+08:00' }),
  demo('blank', {}, 'draft', '', { updated: '2026-11-17T09:16:00+08:00' }),
]
const samples = [
  '测试报告中的通过率与执行明细不一致', '保存用例后，备注中的换行被合并', '支持在用例详情复制运行标识',
  '长文件名导致 Android 设备上的附件操作被遮挡', '超时重试时，结果页保留上一次错误文案',
  '执行记录缺少构建版本号', '批量导出时，CSV 中的中文模块名显示异常',
  '为环境切换增加未保存提示', 'Firefox 刷新后，执行详情丢失已展开的日志',
  '批量选择失效记录后，运行按钮仍可点击', '对回归报告增加时区标识',
  '复制报告链接后，URL 缺少当前筛选条件', '让历史执行的环境变量支持分组查看',
]
if (scenario !== 'empty') samples.forEach((title, i) => {
  const request = [2, 7, 10, 12].includes(i)
  const form = request ? copyRequest : exportBug
  items.push(demo(`sample-${i}`, {
    ...form, title, description: request ? '在执行记录与回归报告之间核对信息时，需要保留当前上下文。' : '在历史执行记录上可稳定复现。请对照页面显示和报告中的实际值。',
    priority: ['P2', 'P1', 'P3', 'P2'][i % 4],
  }, 'claim', '', { updated: new Date(Date.UTC(2026, 10, 16 - Math.floor(i / 3), 8, (i * 11) % 60)).toISOString() }))
})
const developers = scenario === 'no-developers' ? [] : ['chen', 'he']
let route
let pending
let dirty = false
let busy = false
let restore
let rejectNext = scenario === 'write-error'
let claimConflict = scenario === 'race'
let revokeSelection = scenario === 'assignee-revoked'
let developersFailed = scenario === 'candidate-error'
let downloadFailed = scenario === 'download-error'
let loading = scenario === 'loading'
let listFailed = scenario === 'list-error'
let expired = scenario === 'expired'
let listNotice = ''
let queuedNotice = ''
let queuedRow
let focusFeedback = false
let confirmResult
let noticeTimer
let sequence = 1

function escaped(value = '') {
  return String(value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char])
}

function current(hash = location.hash || '#chen/inbox') {
  const [key, screen, itemId] = hash.slice(1).split('/')
  if (['login', 'register', 'registered'].includes(key)) return { hash, actor: 'member', screen: key, auth: true }
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
  return route.role === '开发' && item.status !== 'draft' && (item.status === 'claim' || item.assignee === route.actor)
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
      ${route.screen === key ? 'aria-current="page"' : ''}>${icon(key)}${label}</a>`).join('')}
  </nav>`
  let content
  if (loading) content = '<p class="issue-empty" role="status">正在加载事项…</p>'
  else if (listFailed) content = '<div class="issue-empty"><p role="alert">事项加载失败，请重试。</p><button class="admin-button" type="button" data-action="reload">重新加载</button></div>'
  else if (!allowed.length) {
    const emptyText = { inbox: '暂无待领取事项', assigned: '暂无待办', feedback: '暂无已反馈事项', items: '暂无事项' }
    content = `<div class="issue-empty"><span class="empty-icon">${icon('inbox')}</span><h2>${emptyText[route.screen]}</h2></div>`
  } else {
    const uniformQueue = coreMode && route.screen === 'inbox' ? ' uniform-queue' : ''
    content = `<table class="issue-table${uniformQueue}" aria-label="${tester ? '我的事项' : sections[route.screen]}">
      <colgroup><col><col><col><col><col></colgroup>
      <thead><tr><th scope="col">标题</th><th scope="col">类型</th><th scope="col">优先级</th><th scope="col">状态</th><th scope="col">更新时间</th></tr></thead>
      <tbody>${allowed.sort((a, b) => new Date(b.updated) - new Date(a.updated)).map(item => {
        const { title, type, priority } = item.form
        return `<tr>
          <th scope="row"><div class="issue-title-cell">${coreMode ? `<span class="item-symbol" data-type="${type || 'draft'}">${icon(type || 'draft')}</span>` : ''}
            <a class="issue-title" href="${href(route.screen, item.id)}">${escaped(title || '未命名草稿')}</a></div></th>
          <td class="issue-type">${types[type] || '未选择'}</td>
          <td>${priority ? `<span class="issue-priority${priorityClass(priority)}">${escaped(priority)}</span>` : '—'}</td>
          <td>${badge(item.status)}</td><td class="issue-time"><time datetime="${item.updated}">${dateTime(item.updated)}</time>${coreMode ? `<span class="row-arrow">${icon('arrow')}</span>` : ''}</td>
        </tr>`
      }).join('')}</tbody>
    </table>`
  }
  const notice = listNotice ? `<p class="action-error workflow-notice" role="alert">${listNotice}</p>` : ''
  listNotice = ''
  return `<div class="issue-head${tester ? '' : ' is-queue'}"><h1 tabindex="-1">${tester ? '我的事项' : '开发事项'}</h1>
    ${tester ? `<a class="admin-primary create-button" href="${href('new')}">${coreMode ? icon('plus') : '<span aria-hidden="true">+</span>'}新建事项</a>` : ''}
  </div>${notice}${coreMode ? tabs : ''}<div class="list-panel">${coreMode ? '' : tabs}${content}</div>`
}

const priorityClass = priority => ({ P0: ' is-urgent', P1: ' is-p1' }[priority] || '')
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
    <a href="#" data-download="${index}">${coreMode ? icon('file') : ''}<span>${escaped(file.name)}</span></a>
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
  const basics = `<section class="form-section" aria-label="基本信息">
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
      </section>`
  const assignment = `<section class="form-section assignment-section" aria-labelledby="assign-title">
        <h2 id="assign-title">分配</h2>
        <div class="form-field assignment-field">
          <label for="assignee">指定开发</label>
          <div class="select-control"><select name="assignee" id="assignee" aria-describedby="assignee-hint assignee-error"
            ${developers.length && !developersFailed ? '' : 'disabled'}>
            <option value="">未指定</option>${developers.map(key =>
              `<option value="${key}"${key === pending.assignee ? ' selected' : ''}>${actors[key].name}</option>`).join('')}
          </select></div>
          <p class="file-hint" id="assignee-hint">${developersFailed ? '开发候选加载失败。' : developers.length ? '留空时，提交后进入待领取。' : '暂无可指派的开发，提交后进入待领取。'}</p>
          <p class="field-error" id="assignee-error" role="alert"></p>
          ${developersFailed ? '<div><button type="button" class="admin-button" data-action="retry-candidates">重新加载</button></div>' : ''}
        </div>
      </section>`
  const specifics = `<div id="type-fields">${typeSection(form)}</div>`
  const files = `<section class="form-section attachments-section" aria-labelledby="attach-title">
        <h2 id="attach-title">附件</h2>
        <div class="file-control"><button type="button" class="admin-button" data-action="attach">${coreMode ? icon('plus') : ''}添加附件</button>
          <p class="file-hint">PNG、JPG、TXT、LOG、PDF，每条最多 5 个，每个 10 MB</p>
          <input type="file" id="upload" accept=".png,.jpg,.jpeg,.txt,.log,.pdf" multiple hidden>
        </div>
        <p class="field-error file-error" id="file-error" role="alert"></p>
        <ul class="file-list" id="file-list">${attachmentRows(pending.files, true)}</ul>
      </section>`
  return `<div class="issue-head form-head"><h1 tabindex="-1">${item ? '编辑草稿' : '新建事项'}</h1>
    <p class="reporter">申请人<strong>${actors[route.actor].name}</strong></p></div>
    <form id="issue-form" novalidate>
      ${coreMode
        ? `<div class="editor-layout"><div class="editor-fields surface">${basics}${specifics}</div>
          <div class="editor-support surface">${assignment}${files}</div></div>`
        : `<div class="surface">${basics}${assignment}${specifics}${files}</div>`}
      ${footer('submit', '提交事项', (item ? '<button type="button" class="admin-button danger" data-action="delete">删除草稿</button>' : '') + '<button type="button" class="admin-button" data-action="save">保存草稿</button>')}
    </form>`
}

function detail(item) {
  const { form } = item
  const info = [
    ['申请人', actors[item.creator].name], ['负责人', actors[item.assignee]?.name || '未指定'],
    ['申请类型', types[form.type]], ['优先级', form.priority, `issue-priority${priorityClass(form.priority)}`],
  ]
  const canProcess = route.role === '开发' && item.assignee === route.actor
  let action = ''
  if (route.role === '开发' && item.status === 'claim') action = footer('claim', '领取事项')
  if (canProcess && item.status === 'todo') action = footer('start', '开始处理')
  if (canProcess && item.status === 'progress') {
    action = `<form id="process-form" class="section-card workflow-feedback" novalidate>
      <h2>处理反馈</h2>
        ${field(['feedback', '处理说明', 'text'], pending?.feedback)}
      ${footer('finish', '提交处理结果')}
    </form>`
  } else if (item.feedback) {
    const receipt = focusFeedback ? '<p class="feedback-receipt" id="feedback-receipt">处理结果已提交</p>' : ''
    action = `<section class="section-card workflow-feedback">
      <div class="feedback-heading">
        <h2 tabindex="-1"${receipt ? ' aria-describedby="feedback-receipt"' : ''}>处理反馈</h2>${receipt}
      </div>
      <p class="detail-text">${escaped(item.feedback)}</p>
      <p class="feedback-time">${actors[item.assignee].name} · ${dateTime(item.updated)}</p>
    </section>`
  }
  const steps = (key, value) => coreMode && key === 'steps' && value.includes('\n')
    ? `<ol class="repro-steps">${value.split('\n').filter(Boolean).map(line =>
        `<li>${escaped(line.replace(/^\d+[.、)）]\s*/, ''))}</li>`).join('')}</ol>`
    : escaped(value)
  return `<div class="detail-head"><h1 tabindex="-1">${escaped(form.title)}</h1>
    <div class="workflow-heading">${badge(item.status)}
      <span class="workflow-updated">更新于 <time datetime="${item.updated}">${dateTime(item.updated)}</time></span>
      ${coreMode && canProcess && item.status === 'progress' ? '<button type="button" class="admin-button feedback-jump" data-feedback-jump>处理反馈</button>' : ''}
    </div></div>
    <div class="detail-layout"><aside class="section-card detail-properties" aria-labelledby="property-heading">
      <h2 id="property-heading">事项属性</h2><dl class="detail-summary">${info.map(([key, value, style]) =>
        `<div><dt>${key}</dt><dd${style ? ` class="${style}"` : ''}>${escaped(value)}</dd></div>`).join('')}</dl>
    </aside><div class="detail-content"><div class="surface">
    <section class="detail-section"><h2>详细描述</h2><p class="detail-text">${escaped(form.description)}</p></section>
    <section class="detail-section"><h2>${form.type === 'bug' ? '复现信息' : '需求信息'}</h2>
      <dl class="detail-grid">${specific[form.type].filter(([key]) => form[key]).map(([key, label, kind]) =>
        `<div${kind === 'text' ? ' class="wide"' : kind === 'pair' ? ` class="comparison" data-comparison="${key}"` : ''}><dt>${label}</dt><dd>${steps(key, form[key])}</dd></div>`).join('')}</dl>
    </section>
    <section class="detail-section"><h2>${item.files.length ? `附件（${item.files.length}）` : '附件'}</h2>
      ${item.files.length ? `<ul class="file-list">${attachmentRows(item.files, false)}</ul>` : '<p class="file-hint">无附件</p>'}
      <p class="field-error" id="download-error" role="alert"></p>
    </section></div>${coreMode ? '' : action}</div>${coreMode && action ? `<div class="detail-workflow">${action}</div>` : ''}</div>`
}

function empty(title, message, label, target) {
  return `<div class="issue-head"><h1 tabindex="-1">${title}</h1></div><div class="issue-empty"><span class="empty-icon">${icon('alert')}</span>
    <p>${message}</p>${target ? `<a class="admin-button create-button" href="${target}">${label}</a>`
      : `<button class="admin-button" type="button" data-action="login">${label}</button>`}
  </div>`
}

function render() {
  const actor = actors[route.actor]
  $('#workspace').hidden = route.auth || expired
  $('#auth').hidden = !route.auth && !expired
  if (route.auth || expired) {
    renderAuth(expired ? 'login' : route.screen, expired ? '登录已失效，请重新登录。' : '')
    expired = false
    return
  }
  const item = items.find(entry => entry.id === route.itemId)
  const navigation = []
  if (route.role === '测试' || route.role === '开发') navigation.push([home(route.actor), route.role === '测试' ? '我的事项' : '开发事项', 'list'])
  if (route.role === '管理员') navigation.push(['accounts', '账号管理', 'users'])
  if (actor.operator) navigation.push(['authorizations', '管理员授权', 'lock'])
  navigation.push(['account', '我的账号', 'user'])
  const area = ['new', 'items'].includes(route.screen) ? 'items' : Object.hasOwn(sections, route.screen) ? 'inbox' : route.screen
  const label = { items: '我的事项', inbox: '开发事项', accounts: '账号管理', authorizations: '管理员授权', account: '我的账号' }[area] || '工作区'
  const routeBack = route.role === '开发' && Object.hasOwn(sections, route.screen) ? route.screen : area
  const subpage = route.screen === 'new' ? '新建事项' : item?.status === 'draft' && visible(item) ? '编辑草稿' : route.itemId ? '事项详情' : ''
  $('#brand').href = href('account')
  $('#context').hidden = !subpage && !coreMode
  $('#context').innerHTML = subpage ? `<nav class="breadcrumbs" aria-label="页面路径">
    <a href="${href(routeBack)}"><span aria-hidden="true">←</span> ${label}</a>${coreMode ? '' : `<span aria-hidden="true">/</span>
    <span aria-current="page">${subpage}</span>`}</nav>` : ''
  view.classList.remove('issue-reading', 'issue-detail')
  $('#nav').innerHTML = navigation.map(([screen, title, glyph]) => `<a class="nav-link" href="${href(screen)}"
    ${area === screen ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${title}</span></a>`).join('')
  $('#identity').innerHTML = `<span class="avatar" aria-hidden="true">${escaped(actor.name[0])}</span>
    <div><p class="identity-name">${escaped(actor.name)}</p><p class="identity-role">${actor.role}</p></div>`

  if (['account', 'accounts', 'authorizations'].includes(route.screen)) renderAccounts()
  else if (route.role === '开发' ? !Object.hasOwn(sections, route.screen) : route.role !== '测试' || !['new', 'items'].includes(route.screen)) {
    view.innerHTML = empty('无权访问', '当前账号无权访问此页面。', '返回我的账号', href('account'))
  } else if (route.itemId && (loading || listFailed)) {
    view.innerHTML = '<div class="issue-head"><h1 tabindex="-1">事项详情</h1></div>' + (loading
      ? '<div class="issue-empty" role="status">正在加载事项…</div>'
      : '<div class="issue-empty"><p role="alert">事项加载失败，请重试。</p><button type="button" class="admin-button" data-action="reload">重新加载</button></div>')
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
  $('#confirm-action').classList.toggle('danger', label === '删除草稿')
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
  if (queuedRow) {
    const saved = view.querySelector(`.issue-title[href=${CSS.escape(queuedRow)}]`)
    queuedRow = undefined
    if (saved) {
      const row = saved.closest('tr')
      row.classList.add('row-updated')
      saved.focus({ preventScroll: true })
      saved.scrollIntoView({ block: 'nearest' })
      setTimeout(() => row.classList.remove('row-updated'), 1000)
      return
    }
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
    if (moved) $(changedTab ? '.queue-tab[aria-current="page"]' : $('#auth').hidden ? '#view h1' : '#auth h1')?.focus({ preventScroll: true })
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
  if (action === 'delete' && !await confirm('删除草稿？', '删除后无法恢复。', '删除草稿')) return
  const controls = [...view.querySelectorAll('button, input, select, textarea')].filter(control => !control.disabled)
  const label = button.textContent
  const error = $('#write-error')
  const progressLabels = { claim: '领取中…', start: '更新中…', finish: '提交中…', save: '保存中…', submit: '提交中…', delete: '删除中…' }
  busy = true
  error.textContent = ''
  // 等待文案会变短，锁住操作尺寸以保持按钮和相邻操作的位置。
  if (coreMode) {
    button.style.inlineSize = `${button.getBoundingClientRect().width}px`
    button.setAttribute('aria-busy', 'true')
  }
  controls.forEach(control => { control.disabled = true })
  button.textContent = progressLabels[action]
  await new Promise(resolve => setTimeout(resolve, 520))
  busy = false
  controls.forEach(control => { control.disabled = false })
  button.textContent = label
  if (coreMode) {
    button.style.removeProperty('inline-size')
    button.removeAttribute('aria-busy')
  }
  if (rejectNext) {
    rejectNext = false
    error.textContent = '网络连接失败，请重试。'
    button.focus({ preventScroll: true })
    if (action === 'finish') $('#process-form').scrollIntoView({ block: 'nearest' })
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
  if (action === 'delete') {
    items.splice(items.indexOf(item), 1)
    dirty = false
    restore = undefined
    queuedNotice = '草稿已删除'
    go('items')
    return
  }
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
    const savedId = item?.id ?? `new-${sequence++}`
    if (item) Object.assign(item, change)
    else items.push({ ...change, id: savedId, creator: route.actor })
    dirty = false
    restore = undefined
    queuedNotice = action === 'save' ? '草稿已保存' : '事项已提交'
    if (coreMode) queuedRow = href('items', savedId)
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

function download(file, trigger) {
  if (!file) return
  const message = $('#download-error') || $('#file-error')
  if (downloadFailed) {
    downloadFailed = false
    if (message) message.textContent = '附件下载失败，请重新下载。'
    trigger.focus({ preventScroll: true })
    return
  }
  if (message) message.textContent = ''
  const link = document.createElement('a')
  const url = URL.createObjectURL(file)
  link.href = url
  link.download = file.name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

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
  if (event.target.closest('[data-feedback-jump]')) {
    focusField('feedback')
    return
  }
  const target = event.target.closest('[data-action], [data-download], [data-remove]')
  if (!target) return
  const { action, download: fileIndex, remove } = target.dataset
  if (fileIndex !== undefined) {
    event.preventDefault()
    const files = pending?.files || items.find(item => item.id === route.itemId)?.files
    download(files?.[Number(fileIndex)], target)
  } else if (remove !== undefined) {
    pending.files.splice(Number(remove), 1)
    dirty = true
    $('#file-list').innerHTML = attachmentRows(pending.files, true)
    $('#file-error').textContent = ''
    const focusTarget = $('#file-list button') || $('[data-action=attach]')
    focusTarget.focus()
  } else if (action === 'attach') $('#upload').click()
  else if (action === 'retry-candidates') {
    developersFailed = false
    $('#assignee').disabled = !developers.length
    $('#assignee-hint').textContent = '留空时，提交后进入待领取。'
    target.remove()
    $('#assignee').focus()
  }
  else if (action === 'reload') {
    listFailed = false
    render()
    $('main h1')?.focus()
  } else if (action) void write(action, target)
})
window.addEventListener('hashchange', () => { void navigate() })
void navigate()
if (loading) setTimeout(() => {
  loading = false
  if (route.screen !== 'new' && !route.auth && !dirty) render()
}, 850)
