const initialAccounts = [
  { id: 5, name: '吴晨', email: 'chen.wu@example.test', role: null, status: 'pending' },
  { id: 6, name: '陈舟', email: 'zhou.chen@example.test', role: 'developer', status: 'disabled' },
  { id: 3, name: '赵庭', email: 'quality.review.with.a.long.address@example.test', role: 'tester', status: 'active' },
  { id: 4, name: '林敏', email: 'min.lin@example.test', role: null, status: 'active' },
  { id: 2, name: '顾远', email: 'yuan.gu@example.test', role: 'admin', status: 'active' },
  { id: 1, name: '林宁', email: 'ning.lin@example.test', role: 'tester', status: 'active' },
];

const identities = {
  operator: { id: 1, serverOperator: true },
  admin: { id: 2, serverOperator: false },
  member: { id: 3, serverOperator: false },
  legacy: { id: 4, serverOperator: false },
  guest: { id: null, serverOperator: false },
};

const roleLabels = { admin: '管理员', tester: '测试', developer: '开发' };
const statusLabels = { active: '已启用', pending: '待启用', disabled: '已停用' };
const pageNames = { account: '我的账号', accounts: '账号管理', authorization: '管理员授权' };

const identityControl = document.querySelector('#identity');
const scenarioControl = document.querySelector('#scenario');
const nav = document.querySelector('#nav');
const identityCard = document.querySelector('#identity-card');
const main = document.querySelector('#main');
const dialog = document.querySelector('#dialog');

let accounts = structuredClone(initialAccounts);
let sessions = new Set([1, 2, 3, 4]);
let view = 'authorization';
let returnTo = 'account';
let notice = '';
let saving = false;

function selectedIdentity() {
  return identities[identityControl.value];
}

function accountById(id) {
  return accounts.find((account) => account.id === id);
}

function currentAccount() {
  const account = accountById(selectedIdentity().id);
  if (account?.status === 'active' && sessions.has(account.id)) return account;
  return null;
}

function canAccess(page) {
  const account = currentAccount();
  if (!account) return false;
  if (page === 'authorization') return selectedIdentity().serverOperator;
  if (page === 'accounts') return account.role === 'admin';
  return true;
}

function defaultPage() {
  if (canAccess('authorization')) return 'authorization';
  if (canAccess('accounts')) return 'accounts';
  return 'account';
}

function showPage(page, message = '') {
  notice = message;
  returnTo = page;
  if (!currentAccount()) {
    view = 'login';
  } else {
    view = canAccess(page) ? page : 'denied';
  }
  render();
}

function render() {
  const account = currentAccount();
  nav.innerHTML = Object.entries(pageNames)
    .filter(([page]) => canAccess(page))
    .map(([page, label]) => `<button type="button" data-page="${page}"${view === page ? ' aria-current="page"' : ''}>${label}</button>`)
    .join('');
  identityCard.innerHTML = account
    ? `<strong>${account.name}</strong><span>${roleLabels[account.role] ?? '未分配'}</span>`
    : '';
  if (view === 'authorization' || view === 'accounts') {
    main.innerHTML = renderList(view);
  } else if (view === 'account') {
    main.innerHTML = renderAccount(account);
  } else if (view === 'denied') {
    main.innerHTML = `
      <header class="page-head"><h1>无法访问</h1></header>
      <section class="panel simple">
        <p role="alert">${returnTo === 'authorization' ? '此页面需要服务器操作权限。' : '此页面仅向管理员开放。'}</p>
        <button class="button primary" type="button" data-page="account">返回我的账号</button>
      </section>`;
  } else {
    main.innerHTML = renderLogin();
  }
}

function renderList(page) {
  const authorization = page === 'authorization';
  const empty = scenarioControl.value === 'empty';
  const rows = accounts.map((account) => {
    const action = authorization ? '授予管理员' : '编辑';
    const button = account.role === 'admin'
      ? `<span class="muted">${authorization ? '已授予' : '受保护'}</span>`
      : `<button class="button action" type="button" data-action="${authorization ? 'grant' : 'edit'}" data-id="${account.id}" aria-label="${action} ${account.name}">${action}</button>`;
    return `<tr>
      <th scope="row" class="account"><strong>${account.name}</strong><span>${account.email}</span></th>
      <td>${roleLabels[account.role] ?? '未分配'}</td>
      <td><span class="status status-${account.status}">${statusLabels[account.status]}</span></td>
      <td>${button}</td>
    </tr>`;
  }).join('');
  return `
    <header class="page-head"><h1>${pageNames[page]}</h1></header>
    ${notice ? `<p class="notice" role="status" tabindex="-1">${notice}</p>` : ''}
    <section class="panel">
      ${empty ? '<div class="empty" role="status">暂无账号</div>' : `
      <table class="accounts" aria-label="${pageNames[page]}">
        <thead><tr><th scope="col">账号</th><th scope="col">角色</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`}
    </section>`;
}

function renderAccount(account) {
  return `
    <header class="page-head"><h1>我的账号</h1></header>
    <section class="panel simple">
      <dl class="details">
        <dt>用户名</dt><dd>${account.name}</dd>
        <dt>邮箱</dt><dd>${account.email}</dd>
        <dt>角色</dt><dd>${roleLabels[account.role] ?? '未分配'}</dd>
      </dl>
    </section>`;
}

function renderLogin() {
  const account = accountById(selectedIdentity().id);
  const message = account?.status === 'disabled'
    ? '账号已停用，请联系管理员。'
    : '请登录后继续。';
  return `
    <header class="page-head"><h1>登录</h1></header>
    <section class="panel simple">
      <p role="status">${message}</p>
      ${account?.status === 'active' ? '<button class="button primary" type="button" data-action="login">重新登录</button>' : ''}
    </section>`;
}

function openEditor(mode, account) {
  const granting = mode === 'grant';
  const page = granting ? 'authorization' : 'accounts';
  if (!canAccess(page) || account.role === 'admin') return;
  dialog.innerHTML = `
    <form id="editor" novalidate>
      <h2 id="dialog-title">${granting ? '授予管理员角色' : '编辑账号'}</h2>
      <p class="account"><strong>${account.name}</strong><span>${account.email}</span></p>
      ${granting ? `
        <p class="dialog-info">授予后，该账号将启用并获得账号管理权限。</p>
        ${account.role ? '<p class="dialog-warning">原有角色将替换为管理员。</p>' : ''}
      ` : `
        <label for="role">角色</label>
        <select id="role" autofocus>
          <option value="" disabled ${!account.role ? 'selected' : ''}>未分配</option>
          <option value="tester" ${account.role === 'tester' ? 'selected' : ''}>测试</option>
          <option value="developer" ${account.role === 'developer' ? 'selected' : ''}>开发</option>
        </select>
        <label for="status">状态</label>
        <select id="status">
          ${account.status === 'pending' ? '<option value="pending" selected>待启用</option>' : ''}
          <option value="active" ${account.status === 'active' ? 'selected' : ''}>已启用</option>
          <option value="disabled" ${account.status === 'disabled' ? 'selected' : ''}>已停用</option>
        </select>
        <p id="status-warning" class="dialog-warning" hidden>停用后，该账号在所有设备上的会话都会失效。</p>
      `}
      <p id="dialog-error" class="dialog-error" role="alert" hidden></p>
      <div class="dialog-actions">
        <button type="button" class="button" id="cancel" ${granting ? 'autofocus' : ''}>取消</button>
        <button type="submit" class="button primary" id="save">${granting ? '确认授予' : '保存更改'}</button>
      </div>
    </form>`;
  const form = dialog.querySelector('form');
  const role = dialog.querySelector('#role');
  const status = dialog.querySelector('#status');
  const error = dialog.querySelector('#dialog-error');
  const save = dialog.querySelector('#save');
  const cancel = dialog.querySelector('#cancel');
  const buttonLabel = save.textContent;

  function showError(message) {
    error.textContent = message;
    error.hidden = !message;
  }

  function syncEditor() {
    if (granting) return;
    dialog.querySelector('#status-warning').hidden = status.value !== 'disabled' || account.status === 'disabled';
    save.disabled = role.value === (account.role ?? '') && status.value === account.status;
    showError('');
  }

  cancel.addEventListener('click', () => dialog.close());
  form.addEventListener('change', syncEditor);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving || !canAccess(page)) return;
    const selectedRole = granting ? 'admin' : role.value || null;
    const selectedStatus = granting ? 'active' : status.value;
    if (selectedStatus === 'active' && !selectedRole) {
      showError('请选择测试或开发角色后再启用。');
      role.focus();
      return;
    }
    showError('');
    saving = true;
    form.setAttribute('aria-busy', 'true');
    for (const control of form.querySelectorAll('button, select')) control.disabled = true;
    save.textContent = granting ? '正在授予…' : '正在保存…';
    await new Promise((resolve) => setTimeout(resolve, 320));
    saving = false;
    if (scenarioControl.value === 'failure') {
      scenarioControl.value = 'normal';
      form.removeAttribute('aria-busy');
      for (const control of form.querySelectorAll('button, select')) control.disabled = false;
      save.textContent = buttonLabel;
      showError(granting ? '授权失败，请重试。' : '保存失败，请重试。');
      save.focus();
      return;
    }
    account.role = selectedRole;
    account.status = selectedStatus;
    if (selectedStatus === 'disabled') sessions.delete(account.id);
    dialog.close();
    const message = granting
      ? `${account.name}已获得管理员角色。`
      : selectedStatus === 'disabled' ? `${account.name}已停用，已有会话已失效。` : `${account.name}的账号设置已保存。`;
    showPage(page, message);
    main.querySelector('.notice')?.focus();
  });
  syncEditor();
  dialog.showModal();
}

dialog.addEventListener('cancel', (event) => {
  if (saving) event.preventDefault();
});
identityControl.addEventListener('change', () => showPage(defaultPage()));
scenarioControl.addEventListener('change', () => {
  notice = '';
  render();
});
document.querySelector('#direct').addEventListener('click', () => {
  showPage('authorization');
  main.focus();
});
document.querySelector('#reset').addEventListener('click', () => {
  accounts = structuredClone(initialAccounts);
  sessions = new Set([1, 2, 3, 4]);
  identityControl.value = 'operator';
  scenarioControl.value = 'normal';
  showPage('authorization');
});
document.querySelector('.workspace').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.page) {
    showPage(button.dataset.page);
    main.focus();
  }
  if (button.dataset.action === 'login') {
    sessions.add(selectedIdentity().id);
    showPage(returnTo);
  }
  if (button.dataset.action === 'grant' || button.dataset.action === 'edit') {
    openEditor(button.dataset.action, accountById(Number(button.dataset.id)));
  }
});

showPage('authorization');
