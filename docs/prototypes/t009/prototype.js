const view = document.querySelector('#view')
const navigation = document.querySelector('#navigation')
const identity = document.querySelector('#identity')
const announcement = document.querySelector('#announcement')
const scenario = new URLSearchParams(location.search).get('case')
const day = 86_400_000
const today = '2026-11-21'

const statuses = {
  pending_claim: '待领取', pending_work: '待处理', in_progress: '处理中', pending_verify: '待验证', closed: '已关闭',
}
const series = { feedback: '处理反馈', passed: '验证通过', returned: '验证退回' }
const seriesKeys = Object.keys(series)
const roles = {
  tester: { name: '林可', label: '测试', workspace: '我的事项', scope: '我提交的事项',
    counts: { pending_claim: 4, pending_work: 6, in_progress: 9, pending_verify: 5, closed: 18 } },
  developer: { name: '陈航', label: '开发', workspace: '开发事项', scope: '我负责的事项',
    counts: { pending_work: 4, in_progress: 6, pending_verify: 3, closed: 20 } },
  admin: { name: '许遥', label: '管理员', workspace: '账号管理', scope: '全站已提交事项',
    counts: { pending_claim: 8, pending_work: 13, in_progress: 17, pending_verify: 11, closed: 63 } },
  unassigned: { name: '夏宁', label: '未分配', workspace: '我的账号' },
}
const sampleWeek = [
  [3, 1, 0], [5, 3, 1], [4, 2, 1], [7, 4, 2], [2, 1, 0], [6, 3, 1], [4, 2, 0],
]
const mockTitles = [
  '导出 CSV 后保留带前导零的订单编号',
  '保留工单列表的筛选条件和页码',
  '窄屏事项详情的长标题完整换行',
  '附件下载后保留原始日志文件名',
  '建设环境切换后会话仍可用',
]

let route
let range = preset('7')
let customOpen = false
let viewState = ['loading', 'error'].includes(scenario) ? 'loading' : 'ready'
let request
let selectedPoint = 0
let visibleBuckets = []
let focusOnReturn
let failNextRange = scenario === 'range-error'
let rangeFailed = false

function icon(name) {
  const paths = {
    next: 'm9 6 6 6-6 6',
    stats: 'M4 19h16M7 16v-4m5 4V5m5 11V8',
    bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  }
  return '<svg class="dashboard-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + paths[name] + '"/></svg>'
}

function offset(date, days) {
  return new Date(Date.parse(date) + days * day).toISOString().slice(0, 10)
}

function preset(kind) {
  return { kind, start: offset(today, kind === '30' ? -29 : -6), end: today }
}

function parsedRoute() {
  const [role, page, status] = location.hash.slice(1).split('/')
  return { role: Object.hasOwn(roles, role) ? role : 'tester', page: page || '', status }
}

function locationFor(page = '') {
  return '#' + route.role + (page ? '/' + page : '')
}

function navLink(text, url, active, symbol) {
  return '<a class="nav-link" href="' + url + '"' + (active ? ' aria-current="page"' : '') + '>' + symbol + text + '</a>'
}

function renderNavigation(role) {
  const account = roles[role]
  const workspace = account.counts ? navLink(account.workspace, locationFor('list'), route.page === 'list',
    '<span class="nav-icon list-icon" aria-hidden="true"></span>') : ''
  const dashboard = account.counts ? navLink('统计看板', locationFor(), !route.page, icon('stats')) : ''
  const profile = navLink('我的账号', locationFor('account'), route.page === 'account',
    '<span class="nav-icon person-icon" aria-hidden="true"></span>')
  navigation.innerHTML = workspace + dashboard + profile
  const bell = ['tester', 'developer'].includes(role) ? '<span class="dashboard-bell" aria-hidden="true">' + icon('bell') + '</span>' : ''
  identity.innerHTML = bell + '<span class="avatar" aria-hidden="true">' + account.name[0] +
    '</span><div class="identity-person"><p class="identity-name">' + account.name + '</p><p class="identity-role">' +
    account.label + '</p></div>'
}

function countsFor(role) {
  return Object.fromEntries(Object.entries(roles[role].counts).map(([state, count]) =>
    [state, scenario === 'empty' ? 0 : count],
  ))
}

function currentLink(state, content, classes) {
  const tag = route.role === 'admin' ? 'div' : 'a'
  const link = tag === 'a' ? ' href="' + locationFor('list/' + state) + '" id="' + classes + '-' + state + '" data-jump' : ''
  return '<' + tag + ' class="' + classes + '"' + link + '>' + content + '</' + tag + '>'
}

function workItem(label, count, state, lead = false, shared = false) {
  const chevron = route.role === 'admin' ? '' : icon('next')
  const name = '<span class="' + (lead ? 'work-summary-label' : '') + '">' + label +
    (shared ? '<span class="shared-label">共享</span>' : '') + '</span>'
  const number = '<strong class="' + (lead ? 'work-summary-count' : '') + '">' + count + '</strong>'
  return currentLink(state, name + '<span class="work-summary-right">' + number + chevron + '</span>',
    lead ? 'work-summary' : 'work-row')
}

function snapshot() {
  const role = route.role
  const count = countsFor(role)
  const total = Object.values(count).reduce((sum, value) => sum + value, 0)
  const workload = count.pending_work + count.in_progress
  const work = {
    tester: () => workItem('待验证', count.pending_verify, 'pending_verify', true),
    developer: () => workItem('我的待办', workload, 'assigned', true) + '<div class="work-list">' +
      workItem('待处理', count.pending_work, 'pending_work') + workItem('处理中', count.in_progress, 'in_progress') +
      workItem('待领取队列', scenario === 'empty' ? 0 : roles.admin.counts.pending_claim, 'pending_claim', false, true) + '</div>',
    admin: () => workItem('全站未关闭', total - count.closed, '', true) + '<div class="work-list">' +
      workItem('待领取', count.pending_claim, '') + workItem('待处理或处理中', workload, '') +
      workItem('待验证', count.pending_verify, '') + '</div>',
  }
  const bar = Object.entries(count).filter(([, value]) => value > 0).map(([state, value]) =>
    '<span class="status-part" data-status="' + state + '" style="flex:' + value + '"></span>',
  ).join('')
  const distribution = Object.entries(count).map(([state, value]) =>
    currentLink(state, '<span class="status-dot" data-status="' + state + '"></span><span>' +
      statuses[state] + '</span><strong>' + value + '</strong>' + (role === 'admin' ? '' : icon('next')), 'status-row'),
  ).join('')
  return '<div class="dash-panel dashboard-grid"><section class="snapshot-cell' +
    (role === 'tester' ? ' is-primary-only' : '') + '" aria-labelledby="work-title"><h2 id="work-title">当前待办</h2>' +
    work[role]() + '</section><section class="snapshot-cell" aria-labelledby="status-title"><div class="panel-heading">' +
    '<h2 id="status-title">状态分布</h2><span class="panel-scope">' + roles[role].scope + ' · ' + total + ' 条</span></div>' +
    '<div class="status-bar" aria-hidden="true">' + bar + '</div><div class="status-rows">' + distribution + '</div></section></div>'
}

function sampleActivity() {
  if (scenario === 'empty') return []
  const rows = []
  for (let index = 0; index < 62; index++) {
    const date = offset(today, index - 61)
    const base = sampleWeek[(index + 1) % sampleWeek.length]
    const scale = route.role === 'admin' ? 3 : 1
    const shift = route.role === 'developer' ? -1 : 0
    rows.push({
      date, feedback: Math.max(0, base[0] * scale + shift),
      passed: Math.max(0, base[1] * scale + shift), returned: base[2] * scale,
    })
  }
  return rows
}

function makeBuckets() {
  const first = Date.parse(range.start)
  const count = Math.round((Date.parse(range.end) - first) / day) + 1
  const step = Math.max(1, Math.ceil(count / 31))
  const data = Array.from({ length: Math.ceil(count / step) }, (_, index) => ({
    date: offset(range.start, index * step), end: offset(range.start, Math.min(count, (index + 1) * step) - 1),
    feedback: 0, passed: 0, returned: 0,
  }))
  for (const row of sampleActivity()) {
    if (row.date < range.start || row.date > range.end) continue
    const index = Math.floor((Date.parse(row.date) - first) / day / step)
    for (const key of seriesKeys) data[index][key] += row[key]
  }
  return data
}

function compactDay(date) {
  const [year, month, number] = date.split('-')
  return year === today.slice(0, 4) ? Number(month) + '.' + Number(number) : year + '.' + Number(month) + '.' + Number(number)
}

function periodText(bucket) {
  return compactDay(bucket.date) + (bucket.date === bucket.end ? '' : ' – ' + compactDay(bucket.end))
}

function totalMarkup(totals) {
  return '<dl class="totals">' + seriesKeys.map(key => '<div><dt><span class="series-mark" data-series="' + key +
    '" aria-hidden="true"></span>' + series[key] + '</dt><dd data-total="' + key + '">' + totals[key] +
    (key === 'feedback' ? ' 轮' : ' 次') + '</dd></div>').join('') + '</dl>'
}

function displayPoint(bucket) {
  return '<strong>' + periodText(bucket) + '</strong>' + seriesKeys.map(key => series[key] + ' ' + bucket[key]).join(' · ')
}

function makePlot(data) {
  if (!data.some(row => seriesKeys.some(key => row[key] > 0))) {
    return '<p class="chart-empty">所选日期内暂无反馈或验证记录</p>'
  }
  const highest = Math.max(...data.flatMap(row => seriesKeys.map(key => row[key])))
  const increment = Math.max(1, Math.ceil(highest / 4))
  const max = increment * 4
  const every = Math.ceil(data.length / 6)
  const points = data.map((bucket, i) => '<button class="plot-column" type="button" data-point="' + i +
    '" tabindex="' + (i === selectedPoint ? '0' : '-1') + '" aria-pressed="' + (i === selectedPoint) +
    '" aria-label="' + periodText(bucket) + ' ' + seriesKeys.map(key => series[key] + ' ' + bucket[key]).join('，') +
    '">' + seriesKeys.map(key => '<span class="bar" data-series="' + key + '" aria-hidden="true" style="--height:' +
    (100 * bucket[key] / max) + '%"></span>').join('') + '</button>').join('')
  const days = data.map((bucket, i) => '<span>' + (i % every === 0 || i === data.length - 1 ? bucket.date.slice(5).replace('-', '.') : '') + '</span>').join('')
  const ticks = [4, 3, 2, 1, 0].map(unit => '<span>' + unit * increment + '</span>').join('')
  return '<div class="plot" style="--buckets:' + data.length + '"><div class="axis" aria-hidden="true">' +
    ticks + '</div><div class="plot-area"><div class="plot-bars" aria-label="反馈与验证趋势">' + points +
    '</div></div><div class="plot-days" aria-hidden="true">' + days + '</div></div><p class="chart-readout" id="chart-readout">' +
    displayPoint(data[selectedPoint]) + '</p><details class="data-details"><summary>查看数据</summary>' +
    '<table class="data-table" aria-label="反馈与验证趋势数据"><thead><tr><th scope="col">日期</th>' +
    seriesKeys.map(key => '<th scope="col">' + series[key] + '</th>').join('') + '</tr></thead><tbody>' +
    data.map(bucket => '<tr><th scope="row">' + periodText(bucket) + '</th>' +
      seriesKeys.map(key => '<td>' + bucket[key] + '</td>').join('') + '</tr>').join('') + '</tbody></table></details>'
}

function activity() {
  const panel = view.querySelector('.activity-panel')
  if (!panel) return
  visibleBuckets = makeBuckets()
  selectedPoint = visibleBuckets.length - 1
  const totals = Object.fromEntries(seriesKeys.map(key => [key, visibleBuckets.reduce((sum, bucket) => sum + bucket[key], 0)]))
  const options = { '7': '最近 7 天', '30': '最近 30 天', custom: '自选日期' }
  const choices = Object.entries(options).map(([key, name]) => '<button type="button" data-range="' + key +
    '" aria-pressed="' + (range.kind === key) + '"' + (key === 'custom' ? ' aria-expanded="' + customOpen + '"' : '') +
    '>' + name + '</button>').join('')
  const dates = !customOpen ? '' :
    '<form class="date-editor" novalidate><div class="form-field"><label for="date-from">开始日期</label>' +
    '<input type="date" id="date-from" value="' + range.start + '" max="' + today + '" aria-describedby="date-error" required></div>' +
    '<div class="form-field"><label for="date-to">结束日期</label><input type="date" id="date-to" value="' + range.end + '" max="' +
    today + '" aria-describedby="date-error" required></div><div class="date-action">' +
    '<button class="admin-button" type="button" data-action="close-dates">取消</button>' +
    '<button class="admin-primary" type="submit">应用</button></div><p id="date-error" role="alert" hidden></p></form>'
  const dateText = range.start.replaceAll('-', '.') + ' – ' + range.end.replaceAll('-', '.')
  const chart = rangeFailed ? '<div class="dash-inline-state"><p role="alert">近期进度读取失败</p>' +
    '<button class="admin-button" type="button" data-action="retry-range">按原日期重试</button></div>' : makePlot(visibleBuckets)
  panel.innerHTML = '<div class="activity-head"><div><h2 id="activity-title">近期进度</h2>' +
    '<p class="dash-hint">按反馈和验证的发生日期统计，反馈按轮计。' +
    (visibleBuckets[0].date !== visibleBuckets[0].end ? '长区间分段显示。' : '') +
    '</p></div><div class="range-choices" role="group" aria-label="统计日期">' +
    choices + '</div></div>' + dates + '<div class="activity-summary">' + (rangeFailed ? '' : totalMarkup(totals)) +
    '<p class="range-caption">' + dateText + '</p></div>' + chart
}

function heading(text) {
  return '<div class="dashboard-title"><h1 tabindex="-1">' + text + '</h1></div>'
}

function mockList() {
  const back = '<a class="back-link" href="' + locationFor() + '"><span aria-hidden="true">←</span> 返回统计看板</a>'
  const account = roles[route.role]
  if (route.role === 'admin') return back + heading('账号管理')
  const count = countsFor(route.role)
  const state = Object.hasOwn(statuses, route.status) ? route.status : null
  const available = scenario === 'empty' ? 0 : roles.admin.counts.pending_claim
  const selected = state === 'pending_claim' && route.role === 'developer' ? available :
    state ? count[state] ?? 0 : route.status === 'assigned' ? count.pending_work + count.in_progress :
      Object.values(count).reduce((sum, number) => sum + number, 0)
  const label = route.status === 'assigned' ? '我的待办' : state ? statuses[state] : '全部'
  const rows = mockTitles.slice(0, selected).map(title => '<li><p><span class="mock-result-title">' +
    title + '</span><span class="issue-state" data-status="' + (state || 'in_progress') + '">' +
    (state ? statuses[state] : '处理中') + '</span></p></li>').join('')
  return back + heading(account.workspace) + '<section class="dash-panel"><div class="panel-heading"><h2>' + label +
    '</h2><span class="panel-scope">共 ' + selected + ' 条</span></div>' +
    (rows ? '<ul class="mock-list">' + rows + '</ul>' : '<p class="dash-inline-state">暂无符合条件的事项</p>') + '</section>'
}

function render(focus = false) {
  const previous = route
  route = parsedRoute()
  if (previous && previous.role !== route.role) {
    range = preset('7')
    customOpen = false
    focusOnReturn = undefined
    rangeFailed = false
  }
  renderNavigation(route.role)
  if (route.page === 'account') {
    view.innerHTML = heading('我的账号') + '<section class="dash-panel"><h2>' + roles[route.role].name +
      '</h2><p class="dash-hint">' + roles[route.role].label + '</p></section>'
  } else if (!roles[route.role].counts) {
    view.innerHTML = heading('统计看板') + '<section class="dash-panel dash-state"><h2>当前账号无权访问</h2>' +
      '<p>请联系管理员分配角色。</p></section>'
  } else if (route.page === 'list') {
    view.innerHTML = mockList()
  } else if (viewState === 'loading') {
    view.innerHTML = heading('统计看板') + '<p class="dash-panel dash-state" role="status">正在读取统计…</p>'
  } else if (viewState === 'error') {
    view.innerHTML = heading('统计看板') + '<section class="dash-panel dash-state">' +
      '<h2 role="alert">统计读取失败</h2><p>请重试以更新当前待办和近期进度。</p>' +
      '<button class="admin-button" type="button" data-action="retry">重新加载</button></section>'
  } else {
    view.innerHTML = heading('统计看板') + snapshot() + '<section class="dash-panel activity-panel" aria-labelledby="activity-title"></section>'
    activity()
  }
  if (!focus) return
  if (!route.page && previous?.page === 'list' && focusOnReturn) {
    window.scrollTo(0, focusOnReturn.scroll)
    document.getElementById(focusOnReturn.id)?.focus({ preventScroll: true })
    focusOnReturn = undefined
  } else {
    window.scrollTo(0, 0)
    view.querySelector('h1')?.focus({ preventScroll: true })
  }
}

function refresh(failed = false, delay = 420) {
  clearTimeout(request)
  viewState = 'loading'
  render()
  request = setTimeout(() => {
    viewState = failed ? 'error' : 'ready'
    render(true)
  }, delay)
}

function changeRange(kind) {
  if (kind === 'custom') {
    customOpen = true
    activity()
    view.querySelector('#date-from').focus()
  } else {
    range = preset(kind)
    customOpen = false
    applyRange()
  }
}

function applyRange() {
  rangeFailed = failNextRange
  failNextRange = false
  activity()
  const target = rangeFailed ? '[data-action="retry-range"]' : '[data-range="' + range.kind + '"]'
  view.querySelector(target)?.focus({ preventScroll: true })
  if (!rangeFailed) announcement.textContent = '近期进度日期已更新。'
}

function showSelected(index, focus = false) {
  const point = visibleBuckets[index]
  if (!point) return
  selectedPoint = index
  view.querySelectorAll('[data-point]').forEach(button => {
    const active = Number(button.dataset.point) === index
    button.tabIndex = active ? 0 : -1
    button.setAttribute('aria-pressed', String(active))
    if (active && focus) button.focus({ preventScroll: true })
  })
  view.querySelector('#chart-readout').innerHTML = displayPoint(point)
}

view.addEventListener('click', event => {
  const jump = event.target.closest('[data-jump]')
  if (jump) focusOnReturn = { id: jump.id, scroll: window.scrollY }
  const option = event.target.closest('[data-range]')
  if (option) changeRange(option.dataset.range)
  const point = event.target.closest('[data-point]')
  if (point) showSelected(Number(point.dataset.point))
  const action = event.target.closest('[data-action]')?.dataset.action
  if (action === 'retry') refresh()
  if (action === 'retry-range') applyRange()
  if (action === 'close-dates') {
    customOpen = false
    activity()
    view.querySelector('[data-range="custom"]').focus({ preventScroll: true })
  }
})

view.addEventListener('keydown', event => {
  const point = event.target.closest('[data-point]')
  if (!point || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const index = Number(point.dataset.point)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? visibleBuckets.length - 1 :
    Math.max(0, Math.min(visibleBuckets.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1)))
  showSelected(next, true)
})

view.addEventListener('submit', event => {
  if (!event.target.matches('.date-editor')) return
  event.preventDefault()
  const start = view.querySelector('#date-from')
  const end = view.querySelector('#date-to')
  const error = view.querySelector('#date-error')
  for (const input of [start, end]) input.removeAttribute('aria-invalid')
  let message = ''
  let invalid = start
  if (!start.value || !end.value) {
    message = '请选择开始日期和结束日期。'
    invalid = start.value ? end : start
  } else if (start.valueAsNumber > Date.parse(today) || end.valueAsNumber > Date.parse(today)) {
    message = '日期不能晚于今天。'
    invalid = start.valueAsNumber > Date.parse(today) ? start : end
  } else if (end.valueAsNumber < start.valueAsNumber) {
    message = '结束日期不能早于开始日期。'
    invalid = end
  }
  if (message) {
    error.hidden = false
    error.textContent = message
    invalid.setAttribute('aria-invalid', 'true')
    invalid.focus({ preventScroll: true })
    error.scrollIntoView({ block: 'nearest' })
    return
  }
  range = { kind: 'custom', start: start.value, end: end.value }
  customOpen = false
  applyRange()
})

window.addEventListener('hashchange', () => render(true))
render()
if (scenario === 'loading') refresh(false, 2300)
if (scenario === 'error') refresh(true)
