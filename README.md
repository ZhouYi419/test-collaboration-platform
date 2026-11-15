# 测试协作平台

面向测试人员和开发人员，围绕研发缺陷和需求的提交、处理与验证开展协作。目前提供账号注册、命令行启用、用户名或邮箱登录、查看当前账号及退出。事项流程的开发进度见[任务与验收记录](docs/TASKS.md)。

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

### Docker Compose

准备 Docker 和 Compose。在项目根目录运行下列命令。后端容器启动时会先执行数据库迁移。

```powershell
docker compose up --build -d
```

访问 [平台首页](http://127.0.0.1:8080/) 和 [API 文档](http://127.0.0.1:8080/api/docs)。运行 `docker compose down` 停止服务，数据库数据保留在 Compose 卷中。

仓库的 Compose 配置使用开发凭据和本地 HTTP，仅用于本机运行。Windows 本机方式已通过账号流程验收，Compose 启动待实测。

## 启用注册账号

注册后账号处于待启用状态。具备服务操作权限的人员运行启用命令后，用户即可用注册时的用户名或邮箱登录。

使用 Windows 本机方式时，从项目根目录另开 PowerShell，设置与后端相同的 `DATABASE_URL`，再运行下列命令。将 `<用户名>` 替换为注册时填写的用户名。

```powershell
Set-Location backend
..\.venv\Scripts\python.exe -m app.accounts enable "<用户名>"
```

使用 Compose 时，在项目根目录运行下列命令。

```powershell
docker compose exec api python -m app.accounts enable "<用户名>"
```

## 配置

在启动对应服务或运行检查前设置环境变量。数据库连接串含账号凭据，应通过本机环境传入。

| 环境变量 | 用途 |
| --- | --- |
| `DATABASE_URL` | 后端、迁移与账号启用命令使用的数据库连接串。本机运行时设置为开发库地址，Compose 已配置容器内部地址。 |
| `API_PROXY_TARGET` | Vite 开发代理的后端地址，默认 `http://127.0.0.1:8000`。后端端口变化时一并更新。 |
| `SECURE_COOKIE` | 设置为 `1` 或 `true` 时为会话 Cookie 添加 `Secure` 属性。本文的本地 HTTP 启动方式使用默认值。 |
| `TEST_DATABASE_URL` | 可选的 PostgreSQL 测试库连接串。使用独立测试库，账号需有创建 schema 的权限，测试会创建并清理各自的 schema。 |

## 测试与构建

在 `backend/` 运行接口测试。未设置 `TEST_DATABASE_URL` 时使用临时 SQLite 数据库。

```powershell
..\.venv\Scripts\python.exe -m pytest -q
```

在 `frontend/` 运行类型检查和构建。

```powershell
npm.cmd run build
```

## 项目文档

- [产品需求](docs/PRD.md)
- [系统架构](docs/ARCHITECTURE.md)
- [界面规范](docs/UI_DESIGN.md)
