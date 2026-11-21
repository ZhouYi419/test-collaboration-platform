# 测试协作平台

面向测试人员和开发人员，围绕研发缺陷和需求的提交、处理与验证开展协作。测试人员可以提交、指定开发、验证结果、退回或关闭事项。开发可以领取、开始处理和提交反馈。双方可查看逐轮处理历史、事项通知和个人统计。管理员可分配角色、启停账号并查看全站统计。[任务与验收记录](docs/TASKS.md)

## 本地运行

### Windows 本机开发

准备 Python 3.13、Node.js 24（含 npm）和 PostgreSQL 18。在 PostgreSQL 中创建开发数据库及账号，授予该账号在开发库中执行迁移的权限。从项目根目录运行下列命令，并将连接串替换为本机开发库的连接串。

```powershell
if (-not (Test-Path .venv/Scripts/python.exe)) { python -m venv .venv }
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
$env:DATABASE_URL = 'postgresql+psycopg://local_user:replace_me@127.0.0.1:5432/collaboration'
Set-Location backend
..\.venv\Scripts\python.exe -m alembic upgrade head
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

另开一个 PowerShell 终端，从项目根目录启动前端。

```powershell
Set-Location frontend
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

通过 [平台首页](http://127.0.0.1:5173/) 注册和登录，通过 [API 文档](http://127.0.0.1:8000/api/docs) 查看接口。分别在前后端终端按 `Ctrl+C` 停止服务。

本地开发使用单份建库基线。旧版 `schema_baseline` 的开发库先保留为备份，再用当前基线新建库。需要保留数据时，复制并核对账号、会话、事项、附件及已有验证记录，再切换本地服务的 `DATABASE_URL`。首次启用消息通知时，`notifications` 从新发生的事项动作开始记录。

### Docker Compose

准备 Docker 和 Compose。在项目根目录运行下列命令。后端容器启动时会先执行数据库迁移。

```powershell
docker compose up --build -d
```

访问 [平台首页](http://127.0.0.1:8080/) 和 [API 文档](http://127.0.0.1:8080/api/docs)。运行 `docker compose down` 停止服务，数据库数据保留在 Compose 卷中。

仓库的 Compose 配置使用开发凭据和本地 HTTP，仅用于本机运行。Windows 本机方式已通过账号流程验收，Compose 启动待实测。

## 初始化管理员

先注册用于操作服务器的账号，并核对其用户名。服务操作人员在服务器上启用这个账号，获取它的账号 ID。此账号用于登录并进入「管理员授权」。

使用 Windows 本机方式时，从项目根目录另开 PowerShell，设置与后端相同的 `DATABASE_URL`，再运行下列命令。将 `<用户名>` 替换为注册时填写的用户名。

```powershell
Set-Location backend
..\.venv\Scripts\python.exe -m app.accounts enable "<用户名>" --role tester
```

将命令返回的账号 ID 加入启动后端的终端环境变量 `SERVER_OPERATOR_USER_IDS`，再重启后端。

```powershell
$env:SERVER_OPERATOR_USER_IDS = '<账号 ID>'
```

使用 Compose 时，在项目根目录启用账号、配置返回的 ID，再重新创建相关容器。

```powershell
docker compose exec api python -m app.accounts enable "<用户名>" --role tester
$env:SERVER_OPERATOR_USER_IDS = '<账号 ID>'
docker compose up -d --force-recreate api web
```

登录该账号，打开「管理员授权」，选择已注册的账号并确认。授予时会启用目标账号，并将原角色替换为管理员。管理员从「账号管理」为普通账号分配测试或开发角色并启用。

## 配置

在启动对应服务或运行检查前设置环境变量。数据库连接串含账号凭据，应通过本机环境传入。

| 环境变量 | 用途 |
| --- | --- |
| `DATABASE_URL` | 后端、迁移与账号启用命令使用的数据库连接串。本机运行时设置为开发库地址，Compose 已配置容器内部地址。 |
| `API_PROXY_TARGET` | Vite 开发代理的后端地址，默认 `http://127.0.0.1:8000`。后端端口变化时一并更新。 |
| `SERVER_OPERATOR_USER_IDS` | 可进入管理员授权页的账号 ID，由具备服务器操作权限的人员配置。多个 ID 用逗号分隔，默认留空。更换或重建数据库后须重新核对 ID。 |
| `SECURE_COOKIE` | 设置为 `1` 或 `true` 时为会话 Cookie 添加 `Secure` 属性。本文的本地 HTTP 启动方式使用默认值。 |
| `TEST_DATABASE_URL` | 可选的 PostgreSQL 测试库连接串。使用独立测试库，账号需有创建 schema 的权限，测试会创建并清理各自的 schema。 |

## 测试与构建

在 `backend/` 运行接口测试。未设置 `TEST_DATABASE_URL` 时使用临时 SQLite 数据库。

```powershell
..\.venv\Scripts\python.exe -m pytest -q
```

在 `frontend/` 运行请求层回归、类型检查和构建。请求层测试使用 Node.js 24 内置测试运行器。

```powershell
npm.cmd test
npm.cmd run build
```

前端 API 请求默认在 60 秒后超时，覆盖响应体和附件读取。写请求不自动重试。事项保存和处理的手动重试沿用原请求标识。当前仓库尚未配置 GitHub Actions。

### 浏览器回归

在 Windows 本机安装 Google Chrome 和 Microsoft Edge，按前面的步骤安装前端依赖。然后在项目根目录安装浏览器测试依赖并下载 Playwright Firefox。

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-e2e.txt
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $PWD '.pytest_cache/playwright-browsers'
.\.venv\Scripts\python.exe -m playwright install firefox
.\e2e\run.ps1
```

在同一个 PowerShell 窗口可用 `.\e2e\run.ps1 -Suite chrome` 单独执行一组，也可选择 `edge` 或 `firefox`。每个用例启动临时前后端并创建独立的 SQLite 数据库。脚本输出报告路径，`results.xml` 包含浏览器版本和测试结果，`evidence/` 保留页面用例失败时的截图与追踪，`tmp/` 保留临时服务日志。[覆盖与验收记录](docs/TASKS.md#浏览器验收)

## 项目文档

- [产品需求](docs/PRD.md)
- [系统架构](docs/ARCHITECTURE.md)
- [界面规范](docs/UI_DESIGN.md)
