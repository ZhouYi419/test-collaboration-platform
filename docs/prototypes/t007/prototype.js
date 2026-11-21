const view = document.querySelector('#view')
const scenario = new URLSearchParams(location.search).get('case')
const people = {
  tester: ['林溪', '测试'], developer: ['陈砚', '开发'], colleague: ['苏宁', '测试'], otherdev: ['何启', '开发'],
}
const types = { bug: 'Bug 修复', request: '需求' }
const priorities = ['P0', 'P1', 'P2', 'P3']
const statuses = {
  draft: '草稿', pending_claim: '待领取', pending_work: '待处理',
  in_progress: '处理中', pending_verify: '待验证', closed: '已关闭',
}
const queues = {
  inbox: { label: '待领取', states: ['pending_claim'], empty: '暂无待领取事项' },
  assigned: { label: '我的待办', states: ['pending_work', 'in_progress'], empty: '暂无待办' },
  feedback: { label: '已反馈', states: ['pending_verify', 'closed'], empty: '暂无已反馈事项' },
}
const sorts = { recent: '最近更新', oldest: '最早更新', priority: '优先级从高到低' }
const iconPaths = {
  plus: 'M12 5v14M5 12h14',
  bug: 'M9 6 7 4m8 2 2-2m-5 8v7 M6 10 3 8m3 6H3m3 3-3 2m15-9 3-2m-3 6h3m-3 3 3 2 M6 11a6 6 0 0 1 12 0v3a6 6 0 0 1-12 0z M6 11h12',
  request: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M18 15v6m-3-3h6',
  draft: 'M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6m-6 4h6',
  inbox: 'M3 10.5 6 5h12l3 5.5V19H3z M3 12h5l1.5 3h5l1.5-3h5',
  assigned: 'M9 5H5v15h14V5h-4 M9 3h6v4H9z M8 13l2.5 2.5L16 10',
  feedback: 'M20 4H4v13h5l3 3 3-3h5z M8 9h8m-8 4h5',
  arrow: 'm9 6 6 6-6 6',
  chevron: 'm6 9 6 6 6-6',
}
const dateFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short',
})
const round = (feedback, feedbackAt, outcome, reason, verifiedAt) => ({ feedback, feedbackAt, outcome, reason, verifiedAt })
const initialRounds = [
  round('导出请求随页面筛选条件更新，已经修正第二次导出返回空文件的问题。',
    '2026-11-20T10:20:00+08:00', 'returned', 'CSV 有记录了，但「仅失败」仍包含通过的用例。',
    '2026-11-20T10:43:00+08:00'),
  round('导出改为按选中的执行状态查询。请核对含重复执行的流水线报告。',
    '2026-11-20T13:14:00+08:00', 'returned', '有重试的用例会导出两次。请按最后一次执行结果去重。\n复验时用了同时含成功、失败和重试的报告。切换为「仅失败」后，同一编号在 CSV 中仍出现多次。请保留最终结果，避免把首次失败的旧记录也导出。',
    '2026-11-20T14:03:00+08:00'),
]
const completed = round('已按用例和最后一次执行结果去重。切换筛选后只导出当前状态的记录。',
  '2026-11-21T09:13:00+08:00', 'passed', '', '2026-11-21T09:38:00+08:00')
const waiting = round('用例编号与复制入口共用同一文本来源。请核对多段前缀及切换列表分页后的粘贴结果。',
  '2026-11-21T09:16:00+08:00', 'pending', '', null)

function issue(id, title, description, status, extra = {}) {
  return {
    id, title, description, status, type: 'bug', priority: 'P1', creator: 'tester',
    assignee: ['draft', 'pending_claim'].includes(status) ? '' : 'developer',
    updated: '2026-11-21T09:00:00+08:00', history: [], ...extra,
  }
}

const examples = [
  issue('report', '切换筛选条件后，流水线报告导出为空',
    '先导出全部流水线报告，再切换到仅失败。第二次下载的 CSV 只有表头。',
    'closed', {
      updated: completed.verifiedAt, history: [...initialRounds, completed],
      specifics: [['发生环境', 'uat'], ['严重程度', '严重'],
        ['复现步骤', '1. 打开含失败记录的流水线报告，导出全部记录。\n2. 切换为「仅失败」，再次导出。', 'wide'],
        ['实际结果', 'CSV 只包含表头。', 'actual'], ['预期结果', 'CSV 包含当前筛选条件下的失败记录。', 'expected']],
    }),
  issue('copy', '为失败用例增加一键复制编号',
    '关闭报告详情后需要在缺陷单中引用用例编号。手选会带空格，长前缀也容易遗漏。',
    'pending_verify', {
      type: 'request', priority: 'P2', updated: waiting.feedbackAt,
      specifics: [['需求背景', '缺陷单里经常引用带多段前缀的用例编号。', 'wide'],
        ['期望效果', '在失败列表选择复制，得到当前用例的完整编号。', 'wide'],
        ['验收标准', '粘贴结果与用例详情编号一致，保留前缀，首尾无多余空格。', 'wide']],
      history: [round('已为列表添加复制入口。', '2026-11-20T09:21:00+08:00', 'returned',
        '复制结果缺少多段式编号的前缀。', '2026-11-20T13:35:00+08:00'), waiting],
    }),
  issue('retry', '批量重跑后，执行列表未刷新',
    '发起重跑后，原记录仍显示为失败。手动刷新后才看见正在执行的新状态。',
    'in_progress', { history: [round('重跑提交后等待任务受理，再刷新执行列表。',
      '2026-11-20T16:05:00+08:00', 'returned', '弱网时仍停留在旧状态，需关闭并重新打开列表。',
      '2026-11-20T17:31:00+08:00')] }),
  issue('snapshot', '历史报告保留执行环境快照',
    '报告应保留执行时的浏览器和操作系统版本，后续升级后仍能追溯。',
    'pending_work', { type: 'request', priority: 'P2' }),
  issue('edge', '窄屏下运行日志中的长下载链接会超出详情边界',
    '预发布环境的运行日志包含断不开的长链接。390 像素宽度下横向滚动后才看得到下载记录。',
    'pending_claim', { priority: 'P2' }),
  issue('network', '网络恢复后仍然提示请求失败',
    '切换网络后先进入执行列表，再打开详情。详情加载完成，页面仍有上一条错误。',
    'pending_claim', { creator: 'colleague', priority: 'P0' }),
  issue('private', '通知面板的未读状态不会同步',
    '仅在另一个开发的待办中可见。', 'in_progress', { creator: 'colleague', assignee: 'otherdev' }),
]
const otherTitles = [
  '任务名称含空格时无法过滤', '重试后报告中的执行次数与用例页不一致', '支持从执行详情复制环境名称',
  '同名用例排序在两次刷新之间变化', '删除草稿后列表仍显示旧条目', '发布版本时间比实际时间慢八小时',
  '新增执行说明的多行记录', '报告详情找不到最后一次重试结果', '访问不存在的附件会显示空白页',
  '导入用例时保留分组顺序', '长标题在手机上被截断', '作业执行成功后列表未更新',
  '用例详情展示测试环境变更', '多步验证的第二步无法展开', '刷新后未保存的备注没有提示',
  '报告导出文件名前缀不一致', '错误日志显示不完整', '为回归用例增加运行编号',
  '多个刷新请求导致报告顺序跳动', '显示浏览器版本用于复测比对', '查看归档报告时状态文字颜色不一致',
  '下载失败后可以再次点击附件', '测试说明补充不同分辨率下的截图入口', '旧版 Safari 运行记录显示未处理',
]
const populated = [...examples, ...otherTitles.map((title, index) => {
  const status = ['draft', 'pending_claim', 'pending_work', 'in_progress', 'pending_verify', 'closed'][index % 6]
  const type = index % 3 === 2 ? 'request' : 'bug'
  const timestamp = new Date(Date.UTC(2026, 10, 19, 6, -index * 15)).toISOString()
  const feedback = status === 'closed' || status === 'pending_verify'
    ? [round('已按复现步骤完成修正。', timestamp, status === 'closed' ? 'passed' : 'pending', '', timestamp)]
    : []
  return issue('sample-' + index, title, '在预发布环境复测时定位到该问题，请按详情中的条件检查。',
    status, { type, priority: status === 'draft' ? '' : priorities[index % 4], updated: timestamp, history: feedback })
})]
const items = scenario === 'empty' ? [] : populated
const perPage = 20
let listFailure = scenario === 'list-error'
let historyFailure = scenario === 'history-error'
let generation = 0
let filtersOpen = false
let restore
let route = parseRoute(location.hash)

function escaped(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

function icon(name) {
  return `<svg class="issue-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="${iconPaths[name]}"/></svg>`
}

function formatted(value) {
  return `<time datetime="${value}">${dateFormat.format(new Date(value))}</time>`
}

function parseRoute(hash) {
  const [path, search] = hash.slice(1).split('?')
  const [name, issueId] = path.split('/')
  const actor = Object.hasOwn(people, name) ? name : 'tester'
  const developer = people[actor][1] === '开发'
  const params = new URLSearchParams(search)
  const queue = Object.hasOwn(queues, params.get('queue')) ? params.get('queue') : 'inbox'
  const allowed = developer ? queues[queue].states : Object.keys(statuses)
  const status = params.get('status')
  const priority = params.get('priority')
  const type = params.get('type')
  const sort = params.get('sort')
  const page = Number(params.get('page'))
  return {
    actor, developer, queue, issueId,
    q: (params.get('q') || '').trim().slice(0, 100),
    type: Object.hasOwn(types, type) ? type : '',
    priority: priorities.includes(priority) ? priority : '',
    status: allowed.includes(status) ? status : '',
    sort: Object.hasOwn(sorts, sort) ? sort : 'recent',
    page: Number.isSafeInteger(page) && page >= 1 ? page : 1,
    history: params.get('history') === '1',
  }
}

function path(extra = {}) {
  const data = { ...route, issueId: '', history: false, ...extra }
  const query = new URLSearchParams()
  if (data.developer) query.set('queue', data.queue)
  for (const key of ['q', 'type', 'priority', 'status']) if (data[key]) query.set(key, data[key])
  if (data.sort !== 'recent') query.set('sort', data.sort)
  if (data.page > 1) query.set('page', data.page)
  if (data.history) query.set('history', '1')
  return `#${data.actor}${data.issueId ? '/' + data.issueId : ''}${query.size ? '?' + query : ''}`
}

function shell() {
  const [name, role] = people[route.actor]
  const accounts = { tester: 'lin', developer: 'chen', colleague: 'su', otherdev: 'he' }
  document.querySelector('#identity').innerHTML = `<span class="avatar" aria-hidden="true">${name[0]}</span>
    <div><p class="identity-name">${name}</p><p class="identity-role">${role}</p></div>`
  document.querySelector('#workspace-nav').innerHTML = `<a class="nav-link" aria-current="page" href="#${route.actor}">
    <span class="nav-icon list-icon" aria-hidden="true"></span>${route.developer ? '开发事项' : '我的事项'}</a>
    <a class="nav-link" href="../t005/index.html#${accounts[route.actor]}/account"><span class="nav-icon person-icon" aria-hidden="true"></span>我的账号</a>`
}

function canRead(item) {
  return route.developer ? item.status === 'pending_claim' || item.assignee === route.actor : item.creator === route.actor
}

function canReadHistory(item) {
  return item.status !== 'draft' && (route.developer ? item.assignee === route.actor : item.creator === route.actor)
}

function issueBadge(status) {
  return `<span class="issue-state" data-status="${status}">${statuses[status]}</span>`
}

function selectField(label, name, values) {
  return `<div class="form-field query-field"><label for="query-${name}">${label}</label>
    <div class="select-control"><select id="query-${name}" name="${name}">
      ${values.map(([value, text]) => `<option value="${value}"${route[name] === value ? ' selected' : ''}>${text}</option>`).join('')}
    </select></div></div>`
}

function queryForm() {
  const selected = [route.type, route.priority, route.status, route.sort !== 'recent'].filter(Boolean).length
  const allowed = route.developer ? queues[route.queue].states : Object.keys(statuses)
  return `<form class="issue-query" id="query-form" aria-label="查询事项">
    <div class="form-field query-keyword"><label for="query-keyword">关键词</label>
      <input id="query-keyword" type="search" name="q" maxlength="100" value="${escaped(route.q)}" placeholder="搜索标题或详细描述">
    </div>
    <div class="query-filters" id="query-filters" data-expanded="${filtersOpen}">
      ${selectField('类型', 'type', [['', '全部类型'], ...Object.entries(types)])}
      ${selectField('优先级', 'priority', [['', '全部优先级'], ...priorities.map(value => [value, value])])}
      ${allowed.length > 1 ? selectField('状态', 'status', [['', '全部状态'], ...allowed.map(value => [value, statuses[value]])]) : ''}
      ${selectField('排序', 'sort', Object.entries(sorts))}
    </div>
    <button class="query-submit admin-primary" type="submit">查询</button>
    <button class="query-clear admin-button" type="button" data-action="clear">清空</button>
    <button class="query-toggle" type="button" data-action="filters" aria-controls="query-filters" aria-expanded="${filtersOpen}">
      筛选和排序${selected ? `<span class="query-count">（${selected}）</span>` : ''}${icon('chevron')}
    </button>
  </form>`
}

function renderList() {
  const title = route.developer ? '开发事项' : '我的事项'
  const tabs = route.developer ? `<nav class="queue-tabs" aria-label="开发事项分类">${Object.entries(queues).map(([queue, data]) =>
    `<a class="queue-tab" href="#${route.actor}?queue=${queue}" ${queue === route.queue ? 'aria-current="page"' : ''}>${icon(queue)}${data.label}</a>`).join('')}</nav>` : ''
  view.innerHTML = `<div class="issue-head ${route.developer ? 'is-queue' : ''}"><h1 tabindex="-1">${title}</h1>
    ${!route.developer ? `<a class="admin-primary create-button" href="../t005/index.html#lin/new">${icon('plus')}新建事项</a>` : ''}
    </div>${tabs}${queryForm()}<div id="list-results"></div>`
}

function queryItems() {
  const q = route.q.toLowerCase()
  const matches = items.filter(item => canRead(item)
    && (!route.developer || queues[route.queue].states.includes(item.status))
    && (!q || [item.title, item.description].some(text => text.toLowerCase().includes(q)))
    && (!route.type || item.type === route.type)
    && (!route.priority || item.priority === route.priority)
    && (!route.status || item.status === route.status))
  const rank = value => value ? priorities.indexOf(value) : priorities.length
  return matches.sort((a, b) => {
    if (route.sort === 'priority' && rank(a.priority) !== rank(b.priority)) return rank(a.priority) - rank(b.priority)
    const order = new Date(a.updated) - new Date(b.updated)
    return (route.sort === 'oldest' ? order : -order) || a.id.localeCompare(b.id)
  })
}

function pagination(hasNext) {
  if (route.page === 1 && !hasNext) return ''
  function control(label, target, enabled) {
    return enabled ? `<a class="admin-button" href="${escaped(path({ page: target }))}">${label}</a>` :
      `<button class="admin-button" disabled>${label}</button>`
  }
  return `<nav class="accounts-pagination issue-pagination" aria-label="事项分页"><span>第 ${route.page} 页</span><div class="page-actions">
    ${control('上一页', route.page - 1, route.page > 1)}${control('下一页', route.page + 1, hasNext)}
  </div></nav>`
}

function listContent(matches) {
  const start = (route.page - 1) * perPage
  const rows = matches.slice(start, start + perPage)
  const filtered = route.q || route.type || route.priority || route.status
  if (!rows.length) {
    const title = route.page > 1 ? '当前页没有事项' : filtered ? '没有符合条件的事项' :
      route.developer ? queues[route.queue].empty : '暂无事项'
    return `<div class="issue-empty query-placeholder" tabindex="-1"><h2>${title}</h2>
      ${filtered ? '<button class="admin-button" data-action="clear">清空条件</button>' : ''}</div>${pagination(false)}`
  }
  return `<div class="issue-list-panel" tabindex="-1"><table class="issue-table ${route.developer && route.queue === 'inbox' ? 'uniform-queue' : ''}"
    aria-label="${route.developer ? queues[route.queue].label : '我的事项'}"><colgroup><col><col><col><col><col></colgroup>
    <thead><tr><th scope="col">标题</th><th scope="col">类型</th><th scope="col">优先级</th><th scope="col">状态</th><th scope="col">更新时间</th></tr></thead>
    <tbody>${rows.map(item => `<tr>
      <th scope="row"><div class="issue-title-cell"><span class="item-symbol" data-type="${item.status === 'draft' ? 'draft' : item.type}">
        ${icon(item.status === 'draft' ? 'draft' : item.type)}</span>
        <a class="issue-title" data-id="${item.id}" href="${escaped(path({ issueId: item.id }))}">${escaped(item.title)}</a></div></th>
      <td class="issue-type">${types[item.type]}</td><td><span class="issue-priority" data-priority="${item.priority}">${item.priority || '—'}</span></td>
      <td>${issueBadge(item.status)}</td><td class="issue-time">${formatted(item.updated)}<span class="row-arrow">${icon('arrow')}</span></td>
    </tr>`).join('')}</tbody></table></div>${pagination(matches.length > start + rows.length)}`
}

function focus(element) {
  if (!element) return
  element.focus({ preventScroll: true })
  const rect = element.getBoundingClientRect()
  const header = document.querySelector('.workspace-header')
  const top = getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().bottom : 0
  if (rect.top < top + 10 || rect.top > innerHeight - 60) element.scrollIntoView({ block: 'start' })
}

async function loadList(moveFocus) {
  const request = ++generation
  const result = document.querySelector('#list-results')
  result.setAttribute('aria-busy', 'true')
  result.innerHTML = '<p class="issue-empty query-placeholder" role="status">正在加载事项…</p>'
  await new Promise(resolve => setTimeout(resolve, scenario === 'loading' ? 730 : 210))
  if (generation !== request || !result.isConnected) return
  result.removeAttribute('aria-busy')
  if (listFailure) {
    listFailure = false
    result.innerHTML = '<div class="issue-empty query-placeholder"><p role="alert">暂时无法读取事项，请重试。</p><button class="admin-button" data-action="retry-list">重新加载</button></div>'
    focus(result.querySelector('[data-action="retry-list"]'))
    return
  }
  result.innerHTML = listContent(queryItems())
  const link = restore && Array.from(result.querySelectorAll('.issue-title')).find(row => row.dataset.id === restore.id)
  if (link) {
    window.scrollTo(0, restore.scroll)
    focus(link)
  } else if (restore || moveFocus) {
    focus(result.querySelector('[tabindex="-1"]'))
  }
  restore = undefined
  document.querySelector('#announcement').textContent = result.querySelectorAll('tbody tr').length
    ? `第 ${route.page} 页，${result.querySelectorAll('tbody tr').length} 条事项` : '没有可显示的事项'
}

function detail(item) {
  const type = types[item.type]
  const name = people[item.creator][0]
  const assignee = item.assignee ? people[item.assignee][0] : ''
  const latest = item.history.at(-1)
  const verification = item.history.findLast(entry => entry.outcome !== 'pending')
  const info = [['申请人', name], ['负责人', assignee || '未指定'], ['申请类型', type], ['优先级', item.priority || '—']]
  const specifics = item.specifics ?? (item.type === 'bug'
    ? [['发生环境', 'uat'], ['严重程度', '一般'], ['复现步骤', '打开对应事项的执行或报告页面，按描述中的条件操作。']]
    : [['需求背景', item.description], ['验收标准', '按说明完成操作后，页面可复查实际结果。']])
  const history = canReadHistory(item) ? `<details class="issue-history" ${route.history ? 'open' : ''}>
    <summary class="history-toggle"><h2>处理与验证历史</h2>${icon('chevron')}</summary>
    <div class="history-body" id="issue-history-body"></div>
  </details>` : ''
  const feedback = latest ? `<aside class="detail-workflow"><div class="workflow-panel issue-review-panel">
    <section class="detail-section">
      <h2>${item.status === 'in_progress' ? '上次处理反馈' : '处理反馈'}</h2><p class="detail-text">${escaped(latest.feedback)}</p>
      <p class="feedback-time">${assignee} · ${formatted(latest.feedbackAt)}</p>
    </section>
    ${verification ? `<section class="detail-section"><h2>${latest.outcome === 'pending' ? '上次验证' : '验证结果'}</h2>
      <p class="verification-outcome" data-outcome="${verification.outcome}">${verification.outcome === 'passed' ? '验证通过' : '验证未通过，已退回'}</p>
      ${verification.reason ? `<p class="detail-text verification-reason">${escaped(verification.reason)}</p>` : ''}
      <p class="verification-meta">${name} · ${formatted(verification.verifiedAt)}</p>
    </section>` : ''}
  </div></aside>` : ''
  view.innerHTML = `<a class="back-link" href="${escaped(path())}"><span aria-hidden="true">←</span> ${route.developer ? '开发事项' : '我的事项'}</a>
    <div class="detail-head"><h1 tabindex="-1">${escaped(item.title)}</h1>
      <div class="workflow-heading">${issueBadge(item.status)}<span class="workflow-updated">更新于 ${formatted(item.updated)}</span></div></div>
    <div class="detail-layout">
      <section class="detail-section detail-properties"><h2>事项属性</h2><dl class="detail-summary">${info.map(([label, value]) =>
        `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl></section>
      <div class="detail-content"><section class="detail-section"><h2>详细描述</h2><p class="detail-text">${escaped(item.description)}</p></section>
        <section class="detail-section"><h2>${type === '需求' ? '需求信息' : '复现信息'}</h2><dl class="detail-grid">${specifics.map(([label, value, layout]) =>
          `<div${layout === 'wide' ? ' class="wide"' : layout ? ` class="comparison" data-comparison="${layout}"` : ''}><dt>${label}</dt><dd>${escaped(value)}</dd></div>`).join('')}</dl></section>
        <section class="detail-section"><h2>附件</h2><p class="file-hint">无附件</p></section>
      </div>${feedback}
    </div>${history}`
}

async function loadHistory(item, body, retry = false) {
  if (!body || body.getAttribute('aria-busy') === 'true') return
  body.setAttribute('aria-busy', 'true')
  body.innerHTML = '<p class="history-feedback" role="status">正在加载历史…</p>'
  await new Promise(resolve => setTimeout(resolve, scenario === 'loading' ? 730 : 220))
  if (!body.isConnected) return
  body.removeAttribute('aria-busy')
  if (historyFailure) {
    historyFailure = false
    body.innerHTML = '<div class="history-feedback"><p role="alert">暂时无法读取历史，请重试。</p><button class="admin-button" data-action="retry-history">重新加载</button></div>'
    focus(body.querySelector('button'))
    return
  }
  if (!item.history.length) {
    body.innerHTML = '<p class="history-feedback" tabindex="-1">暂无处理与验证历史。</p>'
    if (retry) focus(body.querySelector('p'))
    return
  }
  const labels = { pending: '待验证', passed: '验证通过', returned: '验证未通过，已退回' }
  body.innerHTML = `<ol class="history-rounds">${item.history.map((entry, index) =>
    `<li class="history-round"><div class="history-round-header"><h3 tabindex="-1">第 ${index + 1} 轮</h3>
      <span class="history-round-status" data-outcome="${entry.outcome}">${labels[entry.outcome]}</span></div>
      <div class="history-round-content"><div><h4>处理反馈</h4><p class="detail-text">${escaped(entry.feedback)}</p>
        <p class="history-round-meta">${people[item.assignee][0]} · ${formatted(entry.feedbackAt)}</p></div>
        ${entry.outcome === 'pending' ? '' : `<div><h4>验证结果</h4>
          ${entry.reason ? `<p class="detail-text">${escaped(entry.reason)}</p>` : ''}
          <p class="history-round-meta">${people[item.creator][0]} · ${formatted(entry.verifiedAt)}</p></div>`}
      </div></li>`).reverse().join('')}</ol>`
  if (retry) focus(body.querySelector('h3'))
  else {
    const summary = body.parentElement.querySelector('summary')
    if (body.parentElement.open && summary.getBoundingClientRect().top > innerHeight * 0.64) {
      summary.scrollIntoView({ block: 'start' })
    }
  }
}

function render(moveFocus = false) {
  generation++
  shell()
  if (!route.issueId) {
    renderList()
    void loadList(moveFocus)
    return
  }
  const item = items.find(value => value.id === route.issueId)
  if (item && canRead(item)) {
    detail(item)
  } else {
    view.innerHTML = `<div class="issue-head"><h1 tabindex="-1">事项不可用</h1></div>
      <div class="issue-empty"><p role="alert">事项不存在或当前账号无法访问。</p>
        <a class="admin-button create-button" href="${escaped(path())}">返回列表</a></div>`
  }
  window.scrollTo(0, 0)
  const summary = route.history ? view.querySelector('.issue-history > summary') : null
  focus(summary ?? view.querySelector('h1'))
}

function applyQuery(next) {
  const target = path(next)
  filtersOpen = false
  if (location.hash === target) {
    render(true)
    return
  }
  location.hash = target
}

view.addEventListener('submit', event => {
  if (event.target.id !== 'query-form') return
  event.preventDefault()
  const data = new FormData(event.target)
  applyQuery({
    q: String(data.get('q') || '').trim(), type: data.get('type'), priority: data.get('priority'),
    status: data.get('status'), sort: data.get('sort'), page: 1,
  })
})

view.addEventListener('click', event => {
  const target = event.target.closest('[data-action]')
  if (!target) return
  if (target.dataset.action === 'filters') {
    filtersOpen = !filtersOpen
    target.setAttribute('aria-expanded', String(filtersOpen))
    view.querySelector('#query-filters').dataset.expanded = String(filtersOpen)
  } else if (target.dataset.action === 'clear') {
    applyQuery({ q: '', type: '', priority: '', status: '', sort: 'recent', page: 1 })
  } else if (target.dataset.action === 'retry-list') {
    void loadList(true)
  } else if (target.dataset.action === 'retry-history') {
    const item = items.find(value => value.id === route.issueId)
    if (item && canReadHistory(item)) void loadHistory(item, view.querySelector('.history-body'), true)
  }
})

view.addEventListener('toggle', event => {
  if (!event.target.matches('details.issue-history[open]')) return
  const item = items.find(value => value.id === route.issueId)
  const body = event.target.querySelector('.history-body')
  if (item && canReadHistory(item) && !body.hasChildNodes()) void loadHistory(item, body)
}, true)

window.addEventListener('hashchange', () => {
  const next = parseRoute(location.hash)
  if (!route.issueId && next.issueId) restore = { list: path(), id: next.issueId, scroll: window.scrollY }
  const sameList = !route.issueId && !next.issueId && route.actor === next.actor && route.queue === next.queue
  const changedQueue = !route.issueId && !next.issueId && route.actor === next.actor && route.queue !== next.queue
  if (!next.issueId) window.scrollTo(0, 0)
  route = next
  if (!route.issueId && restore?.list !== path()) restore = undefined
  render(sameList)
  if (changedQueue) focus(view.querySelector('.queue-tab[aria-current="page"]'))
})

render()
