const accountDialog = document.querySelector('#account-dialog')
const authView = document.querySelector('#auth')
const accountLabels = { enabled: '已启用', pending: '待启用', disabled: '已停用' }
const accountSections = { account: '我的账号', accounts: '账号管理', authorizations: '管理员授权' }
let directory
let accountPage = 1
let accountScreen
let registeredName = ''
let authOffline = new URLSearchParams(location.search).get('state') === 'auth-network'
let accountFailureUsed = false
const registeredPasswords = new Map()

function makeDirectory() {
  const sample = (key, name, email, role, status) => ({ key, name, email, role, status })
  return [
    ...Object.entries(actors).map(([key, actor]) => ({ key, ...actor, status: 'enabled' })),
    sample('pending', '周若宁', 'zhou.ruoning@example.test', '未分配', 'pending'),
    sample('disabled', '贺简', 'he.jian@example.test', '测试', 'disabled'),
    sample('length', 'quality-platform-reliability-assurance-oncall-team-shift-primary', 'quality-platform-reliability-assurance-oncall-team.primary@example.test', '开发', 'enabled'),
    sample('jing', '许静', 'xu.jing@example.test', '开发', 'enabled'),
    sample('tao', '陶然', 'tao.ran@example.test', '测试', 'enabled'),
    sample('wan', '宋晚', 'song.wan@example.test', '未分配', 'pending'),
    sample('bo', '何泊', 'he.bo@example.test', '未分配', 'pending'),
  ]
}

function person(account, showEmail = true) {
  return `<div class="account-person"><span class="avatar" aria-hidden="true">${escaped(account.name[0])}</span>
    <div>${escaped(account.name)}${showEmail ? `<span class="account-email">${escaped(account.email)}</span>` : ''}</div></div>`
}

function renderAccounts(updatedKey) {
  directory ??= makeDirectory()
  const { screen, actor, role } = route
  const record = directory.find(account => account.key === actor)
  const title = accountSections[screen]
  if (accountScreen !== `${actor}/${screen}`) accountPage = 1
  accountScreen = `${actor}/${screen}`
  const heading = `<div class="issue-head"><h1 tabindex="-1">${title}</h1></div>`
  const authorization = screen === 'authorizations'
  if ((authorization && !record.operator) || (screen === 'accounts' && role !== '管理员')) {
    view.innerHTML = empty('无权访问', '当前账号无权访问此页面。', '返回我的账号', href('account'))
    return
  }
  if (loading || (listFailed && scenario === 'list-error')) {
    view.innerHTML = heading + (loading
      ? '<div class="issue-empty" role="status">正在加载…</div>'
      : '<div class="issue-empty"><p role="alert">加载失败，请重试。</p><button class="admin-button" data-action="reload" type="button">重新加载</button></div>')
    return
  }
  if (screen === 'account') {
    view.innerHTML = `${heading}<section class="surface account-profile" aria-label="账号信息">
      <div class="profile-body">${person(record, false)}
        <dl class="profile-meta">
          <div><dt>邮箱</dt><dd>${escaped(record.email)}</dd></div>
          <div><dt>角色</dt><dd>${record.role}</dd></div>
        </dl>
      </div>
      <div class="profile-actions">
        <p class="field-error" id="logout-error" role="alert"></p>
        <button class="admin-button" type="button" data-account-command="logout">退出登录</button>
      </div>
    </section>`
    return
  }
  const accounts = scenario === 'empty' ? [] : directory
  const perPage = 8
  const pages = Math.ceil(accounts.length / perPage)
  const rows = accounts.slice((accountPage - 1) * perPage, accountPage * perPage)
  view.innerHTML = `${heading}<div class="list-panel">${rows.length ? `<table class="account-table" aria-label="${title}">
    <colgroup><col><col><col><col></colgroup>
    <thead><tr><th scope="col">账号</th><th scope="col">角色</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead>
    <tbody>${rows.map(account => `<tr tabindex="-1" data-account-row="${account.key}">
      <th scope="row">${person(account)}</th><td>${account.role}</td>
      <td><span class="issue-state" data-status="${account.status}">${accountLabels[account.status]}</span></td>
      <td>${account.role === '管理员' ? (authorization ? '<span class="granted">已授予</span>' : '<span aria-label="不可编辑">—</span>') : `${account.key === updatedKey ? '<span class="account-receipt" aria-hidden="true">已更新</span>' : ''}<button type="button" class="account-edit"
        data-account-command="edit" data-key="${account.key}" aria-label="${authorization ? '授予管理员' : '编辑'}：${escaped(account.name)}">${authorization ? '授予管理员' : '编辑'}</button>`}</td>
    </tr>`).join('')}</tbody></table>` : '<div class="issue-empty"><h2>暂无账号</h2></div>'}
    ${pages > 1 ? `<div class="pagination" role="group" aria-label="分页">
      <span class="page-count" role="status">第 ${accountPage} / ${pages} 页</span>
      <div class="page-actions"><button class="admin-button" type="button" data-account-command="previous" ${accountPage === 1 ? 'disabled' : ''}>上一页</button>
      <button class="admin-button" type="button" data-account-command="next" ${accountPage >= pages ? 'disabled' : ''}>下一页</button></div>
    </div>` : ''}</div>`
}

async function pendingAccountAction(button, progress, controls, delay = 380) {
  const label = button.textContent
  const disabled = controls.filter(control => !control.disabled)
  button.style.inlineSize = `${button.getBoundingClientRect().width}px`
  button.setAttribute('aria-busy', 'true')
  disabled.forEach(control => { control.disabled = true })
  button.textContent = progress
  await new Promise(resolve => setTimeout(resolve, delay))
  button.textContent = label
  button.style.removeProperty('inline-size')
  button.removeAttribute('aria-busy')
  disabled.forEach(control => { control.disabled = false })
}

function openAccountEditor(account, authorization, trigger) {
  const title = authorization ? '授予管理员角色' : '编辑账号'
  const warning = account.role === '未分配' ? '' : '原有角色将替换为管理员。'
  const options = (choices, current) => choices.map(([value, label]) =>
    `<option value="${value}"${value === current ? ' selected' : ''}>${label}</option>`).join('')
  accountDialog.innerHTML = `<form method="dialog" novalidate>
    <div class="dialog-body"><h2 id="account-dialog-title">${title}</h2>${person(account)}
    ${authorization ? `<p>授予后，此账号将启用。${warning}</p>` : `
      <div class="account-field"><label for="account-role">角色</label>
        <select id="account-role" name="role" aria-describedby="account-role-error">${options(
          [['未分配', '未分配'], ['测试', '测试'], ['开发', '开发']], account.role)}</select>
        <p class="field-error" id="account-role-error" role="alert"></p>
      </div>
      <div class="account-field"><label for="account-status">状态</label>
        <select id="account-status" name="status">${options(Object.entries(accountLabels), account.status)}</select>
      </div><p class="field-error" id="disable-impact" hidden>停用后，该账号的全部会话会立即失效。</p>`}
    </div><div class="dialog-actions">
      <p class="field-error" id="account-write-error" role="alert"></p>
      <div class="dialog-buttons">
      <button type="button" class="admin-button" autofocus>取消</button>
      <button class="admin-primary" value="save">${authorization ? '确认授予' : '保存修改'}</button>
    </div></div></form>`
  const form = accountDialog.querySelector('form')
  const status = form.elements.namedItem('status')
  const role = form.elements.namedItem('role')
  const error = form.querySelector('#account-write-error')
  const submit = form.querySelector('[value=save]')
  let saving = false
  form.querySelector('[autofocus]').onclick = () => accountDialog.close()
  accountDialog.oncancel = event => { if (saving) event.preventDefault() }
  accountDialog.onclose = () => { if (trigger?.isConnected) trigger.focus({ preventScroll: true }) }
  form.onchange = () => {
    error.textContent = ''
    role?.removeAttribute('aria-invalid')
    const roleError = form.querySelector('#account-role-error')
    if (roleError) roleError.textContent = ''
    if (status) form.querySelector('#disable-impact').hidden = status.value !== 'disabled' || account.status !== 'enabled'
  }
  form.onsubmit = async event => {
    event.preventDefault()
    if (saving) return
    if (!authorization && status.value === 'enabled' && role.value === '未分配' && account.status !== 'enabled') {
      form.querySelector('#account-role-error').textContent = '请选择测试或开发角色。'
      role.setAttribute('aria-invalid', 'true')
      role.focus()
      return
    }
    saving = true
    error.textContent = ''
    $('#account-announcement').textContent = ''
    await pendingAccountAction(submit, authorization ? '授予中…' : '保存中…', [...form.querySelectorAll('button, select')])
    saving = false
    if (['account-write-error', 'grant-error'].includes(scenario) && !accountFailureUsed) {
      accountFailureUsed = true
      error.textContent = '服务暂时不可用，请重试。'
      submit.focus()
      return
    }
    Object.assign(account, { role: authorization ? '管理员' : role.value, status: authorization ? 'enabled' : status.value })
    if (actors[account.key]) actors[account.key].role = account.role
    accountDialog.close()
    renderAccounts(account.key)
    const changed = view.querySelector(`[data-account-row="${account.key}"]`)
    const next = changed?.querySelector('button') || changed || view.querySelector('h1')
    next?.focus({ preventScroll: true })
    changed?.scrollIntoView({ block: 'nearest' })
    changed?.classList.add('row-updated')
    if (changed) setTimeout(() => changed.classList.remove('row-updated'), 1000)
    $('#account-announcement').textContent = authorization ? '已授予管理员角色' : '账号已更新'
  }
  accountDialog.showModal()
}

document.querySelector('#view').addEventListener('click', async event => {
  const action = event.target.closest('[data-account-command]')
  if (!action) return
  const command = action.dataset.accountCommand
  if (command === 'edit') {
    const account = directory.find(record => record.key === action.dataset.key)
    if (account) openAccountEditor(account, route.screen === 'authorizations', action)
  } else if (command === 'logout') {
    $('#logout-error').textContent = ''
    await pendingAccountAction(action, '退出中…', [action], 320)
    if (!action.isConnected) return
    if (scenario === 'logout-error' && !accountFailureUsed) {
      accountFailureUsed = true
      $('#logout-error').textContent = '退出失败，请重试。'
      action.focus()
    } else location.hash = '#login'
  } else {
    accountPage += command === 'next' ? 1 : -1
    renderAccounts()
    const next = view.querySelector(`[data-account-command="${command}"]:not([disabled])`) || view.querySelector('tbody tr')
    next?.scrollIntoView({ block: 'nearest' })
    next?.focus({ preventScroll: true })
  }
})

function authField(name, label, type, options = {}) {
  const id = `auth-${name}`
  return `<div class="form-field">
    <label for="${id}">${label}</label>
    ${type === 'password' ? '<div class="password-row">' : ''}<input id="${id}" type="${type}" name="${name}"
      value="${escaped(options.value || '')}" autocomplete="${options.autocomplete || 'off'}" maxlength="${options.max || 128}"
      required aria-describedby="${id}-error">
    ${type === 'password' ? `<button type="button" class="admin-button" aria-label="显示${label}" aria-pressed="false" data-toggle-password="${id}">显示</button></div>` : ''}
    <p class="field-error" id="${id}-error"></p>
  </div>`
}

function renderAuth(screen, message = '') {
  directory ??= makeDirectory()
  const registering = screen === 'register'
  const signup = registering ? '创建账号' : '登录'
  const brand = '<div class="brand"><span class="brand-mark" aria-hidden="true"><i></i></span><span>测试协作平台</span></div>'
  const success = screen === 'registered'
  const authBrand = coreMode ? `<div class="auth-top">${brand}</div>` : `<div class="auth-rail">${brand}<div class="auth-art" aria-hidden="true">
    <div class="auth-signal"><i></i><span></span><span></span></div>
    <div class="auth-signal"><i></i><span></span><span></span></div>
    <div class="auth-signal">${icon('check')}<span></span><span></span></div>
  </div></div>`
  const suggestedName = registering ? '' : registeredName
  if (screen === 'login') registeredName = ''
  authView.innerHTML = `${authBrand}<div class="auth-main"><section class="auth-card">
    ${success ? `<div class="success-icon icon-md">${icon('check')}</div><h1 tabindex="-1">注册成功</h1>
      <p class="success-copy">请等待管理员启用账号。</p><a class="admin-primary" href="#login">返回登录</a>` : `
      <header class="auth-header"><h1 tabindex="-1">${signup}</h1><a href="${registering ? '#login' : '#register'}">${registering ? '返回登录' : '创建账号'}</a></header>
      <form id="auth-form" novalidate>
      ${authField('username', registering ? '用户名' : '用户名或邮箱', 'text', { autocomplete: 'username', value: suggestedName, max: registering ? 64 : 254 })}
      ${registering ? authField('email', '邮箱', 'email', { autocomplete: 'email', max: 254 }) : ''}
      ${authField('password', '密码', 'password', { autocomplete: registering ? 'new-password' : 'current-password' })}
      ${registering ? authField('passwordConfirm', '确认密码', 'password', { autocomplete: 'new-password' }) : ''}
      <button class="admin-primary" type="submit">${registering ? '注册' : '登录'}</button>
      <p class="action-error" id="auth-error" role="alert">${message}</p></form>`}
  </section></div>`
  if (success) return
  const form = authView.querySelector('form')
  form.addEventListener('click', event => {
    const button = event.target.closest('[data-toggle-password]')
    if (!button) return
    const control = document.getElementById(button.dataset.togglePassword)
    const showing = control.type === 'password'
    control.type = showing ? 'text' : 'password'
    const verb = showing ? '隐藏' : '显示'
    button.textContent = verb
    button.setAttribute('aria-pressed', String(showing))
    button.setAttribute('aria-label', verb + control.labels[0].textContent)
  })
  const error = form.querySelector('#auth-error')
  const setError = (control, text = '') => {
    if (text) control.setAttribute('aria-invalid', 'true')
    else control.removeAttribute('aria-invalid')
    document.getElementById(`${control.id}-error`).textContent = text
  }
  form.addEventListener('input', event => {
    setError(event.target)
    error.textContent = ''
  })
  form.addEventListener('submit', async event => {
    event.preventDefault()
    const submit = form.querySelector('[type=submit]')
    if (submit.disabled) return
    const { username, email, password, passwordConfirm } = form.elements
    const name = username.value.trim()
    const normalizedEmail = email?.value.trim().toLowerCase()
    const problems = []
    if (!name) problems.push([username, registering ? '请填写用户名。' : '请填写用户名或邮箱。'])
    else if (registering && name.includes('@')) problems.push([username, '用户名不能包含 @。'])
    if (registering && (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))) problems.push([email, '请输入有效的邮箱地址。'])
    if (!password.value) problems.push([password, '请填写密码。'])
    else if (registering && password.value.length < 8) problems.push([password, '密码至少 8 个字符。'])
    if (registering && (!passwordConfirm.value || passwordConfirm.value !== password.value)) problems.push([passwordConfirm, '请确认两次输入的密码一致。'])
    if (problems.length) {
      problems.forEach(([control, text]) => setError(control, text))
      problems[0][0].focus()
      return
    }
    error.textContent = ''
    await pendingAccountAction(submit, registering ? '注册中…' : '登录中…', [...form.querySelectorAll('input, button')])
    if (!form.isConnected) return
    if (authOffline) {
      authOffline = false
      error.textContent = '网络连接失败，请重试。'
      submit.focus()
      return
    }
    const account = directory.find(candidate => [candidate.name.toLowerCase(), candidate.email.toLowerCase()].includes(name.toLowerCase()))
    if (registering) {
      const conflict = directory.some(candidate => candidate.email.toLowerCase() === normalizedEmail) ? email : account ? username : null
      if (conflict) {
        setError(conflict, '该账号信息已被使用。')
        conflict.focus()
        return
      }
      const key = `registered-${directory.length}`
      directory.push({ key, name, email: normalizedEmail, role: '未分配', status: 'pending' })
      registeredPasswords.set(key, password.value)
      registeredName = name
      location.hash = '#registered'
    } else if (!account || password.value !== (registeredPasswords.get(account.key) || 'Demo1234')) {
      error.textContent = '用户名、邮箱或密码不正确。'
      password.focus()
    } else if (account.status !== 'enabled') {
      error.textContent = account.status === 'pending' ? '账号尚未启用，请联系管理员。' : '账号已停用，请联系管理员。'
      submit.focus()
    } else {
      actors[account.key] = { ...account }
      location.hash = `#${account.key}/account`
    }
  })
}
