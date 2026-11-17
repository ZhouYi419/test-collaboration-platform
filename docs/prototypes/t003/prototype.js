const view = document.querySelector('#view')
const dialog = document.querySelector('#confirm')
const notice = document.querySelector('#notice')
const scenario = new URLSearchParams(location.search).get('state')
const reporter = '林溪'
const priorityOptions = ['P0', 'P1', 'P2', 'P3']
const environmentOptions = ['dev', 'uat', 'prd']
const severityOptions = ['致命', '严重', '一般', '轻微']
const typeLabels = { bug: 'Bug 修复', request: '需求' }
const fieldsByType = {
  bug: [
    { key: 'environment', label: '发生环境', options: environmentOptions },
    { key: 'severity', label: '严重程度', options: severityOptions },
    { key: 'steps', label: '复现步骤', multiline: true },
    { key: 'actual', label: '实际结果', multiline: true, pair: true },
    { key: 'expected', label: '预期结果', multiline: true, pair: true },
    { key: 'version', label: '影响版本', optional: true },
  ],
  request: [
    { key: 'background', label: '需求背景', multiline: true },
    { key: 'outcome', label: '期望效果', multiline: true },
    { key: 'acceptance', label: '验收标准', multiline: true },
    { key: 'scope', label: '影响范围', optional: true },
    { key: 'due', label: '期望完成日期', type: 'date', optional: true },
  ],
}
const commonFields = [
  { key: 'priority', label: '优先级', options: priorityOptions },
  { key: 'title', label: '标题', limit: 100, wide: true, placeholder: '简要说明问题或需求' },
  { key: 'description', label: '详细描述', multiline: true },
]

const sampleLog = new File(
  ['2026-11-17 14:31:23 [WARN] /reports/export returned an empty file after switching report filters.\n'],
  'report-export.log',
  { type: 'text/plain' },
)
const samples = [
  { id: 5, type: 'bug', title: '流水线报告导出在切换筛选后生成空文件', description: '先导出全部报告，再切换到仅失败。此时导出的文件只有表头。', priority: 'P1', steps: '1. 打开流水线报告\n2. 导出全部报告\n3. 切换为「仅失败」，再次导出', actual: '导出文件只有表头。', expected: '导出内容包含当前筛选命中的失败记录。', environment: 'uat', severity: '严重', version: 'v0.2.4', status: 'submitted', files: [sampleLog], updated: '2026-11-17T14:32:00+08:00' },
  { id: 4, type: 'request', title: '为失败用例增加一键复制编号', description: '在缺陷单中引用用例时，需要快速复制编号。', priority: 'P3', status: 'draft', files: [], updated: '2026-11-17T10:18:00+08:00' },
  { id: 3, type: 'request', title: '测试报告需要保留执行环境信息', description: '报告详情应展示本次执行时的环境快照。', priority: 'P2', background: '历史报告难以追溯实际执行时的环境。', outcome: '可从报告查看浏览器和操作系统版本。', acceptance: '打开报告可看到当次执行的浏览器与操作系统版本。', scope: '报告详情', status: 'submitted', files: [], updated: '2026-11-16T17:46:00+08:00' },
  { id: 2, type: 'bug', title: '在移动端切换账号后返回页面，先前列表仍短暂显示上一个账号的执行记录', description: '移动端回退时列表闪现旧数据。', priority: 'P0', environment: 'prd', status: 'draft', files: [], updated: '2026-11-16T11:09:00+08:00' },
  { id: 1, type: '', title: '', status: 'draft', files: [], updated: '2026-11-15T09:24:00+08:00' },
]
let items = scenario === 'empty' ? [] : samples
let nextId = samples.length + 1
let changedId
let listFailed = scenario === 'list-error'
let listLoading = scenario === 'loading'
let writeFails = scenario === 'write-error'
let expired = scenario === 'expired'
let route
let editor
let listPosition
let busy = false
let onConfirm
let noticeTimer

function escapeText(value = '') {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
  return String(value).replace(/[&<>"]/g, character => entities[character])
}

function dateTime(value) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short',
  }).format(new Date(value))
}

function statusBadge(status) {
  return status === 'draft'
    ? '<span class="issue-state is-draft">草稿</span>'
    : '<span class="issue-state">待领取</span>'
}

function priorityText(priority) {
  return priority
    ? `<span class="issue-priority${priority === 'P0' ? ' is-urgent' : ''}">${escapeText(priority)}</span>`
    : '<span class="unset-priority" aria-label="未选择优先级">—</span>'
}

function flash(message) {
  clearTimeout(noticeTimer)
  notice.textContent = message
  noticeTimer = setTimeout(() => { notice.textContent = '' }, 3300)
}

function issueList() {
  const header = '<div class="issue-head"><h1 tabindex="-1">我的事项</h1><a class="admin-primary create-button" href="#new"><span aria-hidden="true">+</span>新建事项</a></div>'
  if (listLoading) return header + '<div class="issue-empty" role="status">正在加载事项…</div>'
  if (listFailed) return header + '<div class="issue-empty"><p role="alert">事项加载失败，请重试。</p><button type="button" class="admin-button" data-action="retry">重新加载</button></div>'
  if (!items.length) return header + '<div class="issue-empty"><h2>暂无事项</h2></div>'
  return header + `
    <table class="issue-table" aria-label="我的事项">
      <colgroup><col><col><col><col><col></colgroup>
      <thead><tr><th scope="col">标题</th><th scope="col">类型</th><th scope="col">优先级</th><th scope="col">状态</th><th scope="col">更新时间</th></tr></thead>
      <tbody>${items.map(item => `
        <tr${item.id === changedId ? ' class="recently-changed"' : ''}>
          <th scope="row"><a class="issue-title" href="#issue-${item.id}">${escapeText(item.title || '未命名草稿')}</a></th>
          <td class="issue-type">${typeLabels[item.type] || '未选择'}</td>
          <td>${priorityText(item.priority)}</td>
          <td>${statusBadge(item.status)}</td>
          <td class="issue-time"><time datetime="${item.updated}">${dateTime(item.updated)}</time></td>
        </tr>`).join('')}
      </tbody>
    </table>`
}

const backLink = '<a class="back-link" href="#items"><span aria-hidden="true">←</span> 我的事项</a>'
const requiredMark = '<span class="required" aria-hidden="true">*</span>'

function fieldMarkup(field, data) {
  const { key, label, options, type, multiline, wide, pair, optional, placeholder } = field
  const value = data[key] || ''
  const attributes = `id="${key}" name="${key}" aria-describedby="${key}-error"${optional ? '' : ' aria-required="true"'}`
  let control
  if (options) {
    control = `<div class="select-control"><select ${attributes}><option value="">请选择</option>${options.map(option =>
      `<option${option === value ? ' selected' : ''}>${option}</option>`).join('')}</select></div>`
  } else if (multiline) {
    control = `<textarea ${attributes} maxlength="5000">${escapeText(value)}</textarea>`
  } else {
    control = `<input ${attributes} type="${type || 'text'}" ${type === 'date' ? '' : `maxlength="${field.limit || 120}"`} value="${escapeText(value)}"${placeholder ? ` placeholder="${placeholder}"` : ''}>`
  }
  return `<div class="form-field${wide || (multiline && !pair) ? ' wide' : ''}">
    <label for="${key}">${label}${optional ? '' : requiredMark}</label>
    ${control}<p class="field-error" id="${key}-error"></p>
  </div>`
}

function typeFields(data, changed = false) {
  const fields = fieldsByType[data.type]
  if (!fields) return ''
  const heading = data.type === 'bug' ? '复现信息' : '需求信息'
  return `<section class="form-section${changed ? ' type-changed' : ''}" aria-label="${heading}">
    <h2>${heading}</h2><div class="form-grid">${fields.map(field => fieldMarkup(field, data)).join('')}</div>
  </section>`
}

function formatSize(bytes) {
  return bytes < 1000 ? `${bytes} B` : bytes < 1000000
    ? `${(bytes / 1000).toFixed(1)} KB` : `${(bytes / 1000000).toFixed(1)} MB`
}

function fileList(files, editable) {
  return files.map((file, index) => `
    <li><div class="file-name">
      <a href="#" data-download="${index}" download="${escapeText(file.name)}">${escapeText(file.name)}</a>
      <span class="file-size">${formatSize(file.size)}</span>
    </div>
    ${editable ? `<button class="account-edit" type="button" data-remove="${index}" aria-label="移除 ${escapeText(file.name)}">移除</button>` : ''}
    </li>`).join('')
}

function issueEditor() {
  const { data } = editor
  return `${backLink}
    <div class="issue-head form-head"><h1 tabindex="-1">${data.id ? '编辑草稿' : '新建事项'}</h1><p class="reporter">申请人<strong>${reporter}</strong></p></div>
    <form id="issue-form" novalidate>
      <section class="form-section" aria-label="基本信息">
        <h2>基本信息</h2>
        <div class="form-grid basic-grid">
          <fieldset class="type-field">
            <legend>申请类型${requiredMark}</legend>
            <div class="choices" id="type">
              ${Object.entries(typeLabels).map(([value, label]) => `<label class="choice"><input type="radio" name="type" value="${value}" aria-required="true" aria-describedby="type-error"${value === data.type ? ' checked' : ''}>${label}</label>`).join('')}
            </div>
            <p class="field-error" id="type-error"></p>
          </fieldset>
          ${commonFields.map(field => fieldMarkup(field, data)).join('')}
        </div>
      </section>
      <div id="type-fields">${typeFields(data)}</div>
      <section class="form-section" aria-labelledby="attachments-title">
        <h2 id="attachments-title">附件</h2>
        <div class="file-control">
          <button type="button" class="admin-button" data-action="attach" aria-describedby="file-hint">添加附件</button>
          <p class="file-hint" id="file-hint">PNG、JPG、TXT、LOG、PDF，每条最多 5 个，每个 10 MB</p>
          <input type="file" id="file-input" accept=".png,.jpg,.jpeg,.txt,.log,.pdf" multiple hidden>
        </div>
        <p class="field-error file-error" id="file-error" role="alert"></p>
        <ul class="file-list" id="files">${fileList(data.files, true)}</ul>
      </section>
      <div class="form-actions">
        <p class="action-error" id="action-error" role="alert"></p>
        <div class="action-buttons">
          ${data.id ? '<button type="button" class="admin-button delete-draft" data-action="delete">删除草稿</button>' : ''}
          <button type="button" class="admin-button" data-action="save">保存草稿</button>
          <button type="submit" class="admin-primary">提交事项</button>
        </div>
      </div>
    </form>`
}

function issueDetail(item) {
  const fields = fieldsByType[item.type]
  return `${backLink}
    <div class="detail-head">${statusBadge(item.status)}<h1 tabindex="-1">${escapeText(item.title)}</h1></div>
    <dl class="detail-summary">
      <div><dt>申请类型</dt><dd>${typeLabels[item.type]}</dd></div>
      <div><dt>申请人</dt><dd>${reporter}</dd></div>
      <div><dt>优先级</dt><dd>${priorityText(item.priority)}</dd></div>
      <div><dt>更新时间</dt><dd>${dateTime(item.updated)}</dd></div>
    </dl>
    <section class="detail-section">
      <h2>详细描述</h2><p class="detail-text">${escapeText(item.description)}</p>
    </section>
    <section class="detail-section">
      <h2>${item.type === 'bug' ? '复现信息' : '需求信息'}</h2>
      <dl class="detail-grid">${fields.filter(field => item[field.key]).map(field =>
        `<div${field.multiline && !field.pair ? ' class="wide"' : ''}><dt>${field.label}</dt><dd>${escapeText(item[field.key])}</dd></div>`).join('')}</dl>
    </section>
    <section class="detail-section">
      <h2>附件${item.files.length ? `（${item.files.length}）` : ''}</h2>
      ${item.files.length ? `<ul class="file-list">${fileList(item.files, false)}</ul>` : '<p class="file-hint">无附件</p>'}
    </section>`
}

function account() {
  return `<div class="issue-head"><h1 tabindex="-1">我的账号</h1></div>
    <dl class="account-details"><div><dt>用户名</dt><dd>${reporter}</dd></div>
    <div><dt>角色</dt><dd>${scenario === 'forbidden' ? '开发' : '测试'}</dd></div></dl>`
}

function messagePage(title, message, action) {
  return `<div class="issue-head"><h1 tabindex="-1">${title}</h1></div>
    <div class="issue-empty"><p>${message}</p>${action}</div>`
}

function navigate() {
  const target = location.hash.slice(1) || 'items'
  if (route === target) return
  if (busy || editor?.dirty) {
    history.replaceState(null, '', `#${route}`)
    if (busy) return
    confirmChange('放弃本次修改？', '本次修改尚未保存。', '放弃修改', () => {
      editor.dirty = false
      location.hash = target
    })
    return
  }
  const focusHeading = Boolean(route)
  if (route === 'items') {
    listPosition = { target, scroll: window.scrollY }
  }
  route = target
  editor = undefined
  view.classList.remove('issue-reading')
  if (route !== 'items') notice.textContent = ''
  const item = items.find(entry => route === `issue-${entry.id}`)
  const itemsLink = document.querySelector('#items-link')
  const accountLink = document.querySelector('#account-link')
  itemsLink.hidden = expired || scenario === 'forbidden'
  accountLink.hidden = expired
  document.querySelector('#identity').hidden = expired
  document.querySelector('#identity-role').textContent = scenario === 'forbidden' ? '开发' : '测试'
  itemsLink.toggleAttribute('aria-current', route !== 'account')
  accountLink.toggleAttribute('aria-current', route === 'account')
  document.querySelector('.nav-link[aria-current]')?.setAttribute('aria-current', 'page')
  if (expired) {
    view.innerHTML = messagePage('登录已失效', '请重新登录后查看事项。', '<button class="admin-button" data-action="login">重新登录</button>')
  } else if (route === 'account') {
    view.innerHTML = account()
  } else if (scenario === 'forbidden') {
    view.innerHTML = messagePage('无权访问', '我的事项仅向测试人员开放。', '<a class="admin-button create-button" href="#account">返回我的账号</a>')
  } else if (route === 'items') {
    view.innerHTML = issueList()
    const previous = listPosition
    listPosition = undefined
    const origin = previous && view.querySelector(`[href=${CSS.escape(`#${previous.target}`)}]`)
    const restorePosition = changedId === undefined && origin
    changedId = undefined
    if (restorePosition) {
      window.scrollTo(0, previous.scroll)
      origin.focus({ preventScroll: true })
      return
    }
  } else if (route === 'new' || item?.status === 'draft') {
    view.classList.add('issue-reading')
    editor = { data: item ? { ...item, files: [...item.files] } : { files: [] }, dirty: false }
    view.innerHTML = issueEditor()
  } else if (item) {
    view.classList.add('issue-reading')
    view.innerHTML = issueDetail(item)
  } else {
    view.innerHTML = messagePage('事项不可用', '该事项可能已删除，或当前账号无法访问。', '<a class="admin-button create-button" href="#items">返回我的事项</a>')
  }
  window.scrollTo(0, 0)
  if (focusHeading) view.querySelector('h1')?.focus({ preventScroll: true })
}

function rerender() {
  route = undefined
  navigate()
}

function confirmChange(title, message, label, callback) {
  dialog.returnValue = 'cancel'
  dialog.querySelector('#confirm-title').textContent = title
  dialog.querySelector('#confirm-message').textContent = message
  dialog.querySelector('#confirm-action').textContent = label
  onConfirm = callback
  dialog.showModal()
}

function markError(key, message = '') {
  const target = view.querySelector(`#${key}`)
  if (!target) return
  if (message) target.setAttribute('aria-invalid', 'true')
  else target.removeAttribute('aria-invalid')
  view.querySelector(`#${key}-error`).textContent = message
}

function validate(data) {
  const missing = []
  if (!data.type) missing.push({ key: 'type', label: '申请类型', choose: true })
  const fields = [...commonFields, ...(fieldsByType[data.type] || [])]
  for (const field of fields) {
    if (!field.optional && !data[field.key]?.trim()) missing.push({ ...field, choose: Boolean(field.options) })
  }
  missing.forEach(field => markError(field.key, `请${field.choose ? '选择' : '填写'}${field.label}`))
  if (missing.length) {
    const element = missing[0].key === 'type'
      ? view.querySelector('input[name="type"]') : view.querySelector(`#${missing[0].key}`)
    element.focus({ preventScroll: true })
    element.closest('.form-field, .type-field').scrollIntoView({ block: 'center' })
  }
  return !missing.length
}

function addFiles(picked) {
  const errors = []
  for (const file of picked) {
    if (!/\.(png|jpe?g|txt|log|pdf)$/i.test(file.name)) {
      errors.push(`${file.name} 的格式不受支持。`)
    } else if (file.size > 10000000) {
      errors.push(`${file.name} 超过 10 MB。`)
    } else if (editor.data.files.length === 5) {
      errors.push('每条事项最多添加 5 个附件。')
      break
    } else {
      editor.data.files.push(file)
      editor.dirty = true
    }
  }
  view.querySelector('#files').innerHTML = fileList(editor.data.files, true)
  view.querySelector('#file-error').textContent = errors.join(' ')
}

function write(action) {
  if (busy || !editor) return
  const { data } = editor
  if (action === 'submit' && !validate(data)) return
  busy = true
  const buttons = [...view.querySelectorAll('#issue-form button')]
  const labels = { save: '保存', submit: '提交', delete: '删除' }
  const active = view.querySelector(action === 'submit' ? '[type="submit"]' : `[data-action="${action}"]`)
  const oldLabel = active.textContent
  const actionError = view.querySelector('#action-error')
  const controls = [...buttons, ...view.querySelectorAll('input, textarea, select')]
  actionError.textContent = ''
  controls.forEach(element => { element.disabled = true })
  active.textContent = `${labels[action]}中…`
  setTimeout(() => {
    busy = false
    if (writeFails) {
      writeFails = false
      controls.forEach(element => { element.disabled = false })
      active.textContent = oldLabel
      actionError.textContent = `网络连接失败，请重试${labels[action]}。`
      active.focus({ preventScroll: true })
      return
    }
    if (action === 'delete') {
      items = items.filter(item => item.id !== data.id)
      flash('草稿已删除')
    } else {
      const values = Object.fromEntries(Object.entries(data).map(([key, value]) =>
        [key, typeof value === 'string' ? value.trim() : value]))
      const otherType = data.type === 'bug' ? 'request' : 'bug'
      fieldsByType[otherType].forEach(field => { delete values[field.key] })
      changedId = data.id || nextId++
      items = [{
        ...values,
        id: changedId,
        status: action === 'submit' ? 'submitted' : 'draft',
        updated: new Date().toISOString(),
      }, ...items.filter(item => item.id !== data.id)]
      flash(action === 'submit' ? '事项已提交' : '草稿已保存')
    }
    editor.dirty = false
    location.hash = 'items'
  }, 550)
}

dialog.addEventListener('submit', event => {
  event.preventDefault()
  const result = event.submitter.value
  const callback = onConfirm
  onConfirm = undefined
  dialog.close(result)
  if (result === 'confirm') callback?.()
})
dialog.addEventListener('cancel', () => { onConfirm = undefined })

view.addEventListener('input', event => {
  const { name, value } = event.target
  if (!editor || !name || name === 'type') return
  editor.data[name] = value
  editor.dirty = true
  markError(name)
})

view.addEventListener('change', event => {
  if (!editor) return
  if (event.target.name === 'type') {
    editor.data.type = event.target.value
    editor.dirty = true
    view.querySelector('#type-fields').innerHTML = typeFields(editor.data, true)
    markError('type')
  } else if (event.target.id === 'file-input') {
    addFiles(event.target.files)
    event.target.value = ''
  }
})

view.addEventListener('submit', event => {
  event.preventDefault()
  write('submit')
})

view.addEventListener('click', event => {
  const button = event.target.closest('[data-action], [data-remove], [data-download]')
  if (!button) return
  const { action, remove, download } = button.dataset
  if (download !== undefined) {
    event.preventDefault()
    const files = editor?.data.files || items.find(item => route === `issue-${item.id}`)?.files
    const file = files?.[Number(download)]
    if (!file) return
    const link = document.createElement('a')
    const url = URL.createObjectURL(file)
    link.href = url
    link.download = file.name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } else if (remove !== undefined && editor) {
    editor.data.files.splice(Number(remove), 1)
    editor.dirty = true
    view.querySelector('#file-error').textContent = ''
    view.querySelector('#files').innerHTML = fileList(editor.data.files, true)
    const next = view.querySelector(`[data-remove="${remove}"]`) || view.querySelector('[data-action="attach"]')
    next.focus()
  } else if (action === 'attach') {
    view.querySelector('#file-input').click()
  } else if (action === 'save') {
    write('save')
  } else if (action === 'delete') {
    confirmChange('删除草稿？', '草稿及附件将一并删除。', '删除草稿', () => write('delete'))
  } else if (action === 'retry') {
    listFailed = false
    rerender()
  } else if (action === 'login') {
    expired = false
    rerender()
  }
})

window.addEventListener('hashchange', navigate)
navigate()
if (listLoading) setTimeout(() => {
  listLoading = false
  if (route === 'items') rerender()
}, 900)
