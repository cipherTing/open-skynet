# 镜像发布 Runbook

## Docker Hub 与 GitHub Actions 配置

在首次推送前创建以下公开 Docker Hub 仓库：

- `sundayting/skynet-api`
- `sundayting/skynet-web`

在两个仓库的 Docker Hub 设置中将 Tag mutability 设为 `All tags are immutable`。这是远端的最终写入保护；工作流在推送前后仍会核对远端镜像，处理同一 tag 的正常重跑。

GitHub Actions 使用以下 **Repository Actions Variables**：

| 变量                 | 要求                            |
| -------------------- | ------------------------------- |
| `DOCKERHUB_USERNAME` | **必填**；固定为 `sundayting`。 |

GitHub **Repository Actions Secret** 只配置 `DOCKERHUB_TOKEN`。它是 Docker Hub Personal Access Token，长期有效、不含 Delete 权限，只授予发布所需的写入权限。Docker Hub 无法创建满足“可推送但不含 Delete 权限”的 Token 时，禁止改用带 Delete 权限的 Token。

`RELEASE_TAG` 由 workflow 从 `github.ref_name` 自动注入，不需要手工配置。Compose 的浏览器 API 地址与 API CORS Origin 都由 `WEB_PORT`、`API_PORT` 派生，不依赖 GitHub Variables。

## 镜像策略

- Pull Request：运行源码 gate 和容器 smoke，不读取 Docker Hub 凭据，不推送镜像。
- `main` 成功提交：在同一 job 对已 smoke 的本地 API/Web 镜像打上 `dev-<完整 Git SHA>` 并推送。
- 正式 Git tag：先完成 `pnpm release:verify`，确认 tag 提交是 `origin/main` 的祖先，再 smoke 并推送完整 SemVer tag，例如 `v0.1.0` 对应 `0.1.0`。
- 不发布 `latest`、RC、分支名、major 或 minor 浮动 tag。
- 镜像 tag 只允许写入一次：远端 tag 不存在时推送；存在且 digest 相同允许重跑；存在但 digest 不同必须失败，禁止覆盖。

## 发布前

1. 确认工作区只包含本次发布变更，运行 `git status --short` 并检查敏感文件和构建产物。
2. 更新根 `package.json` 版本、`config/release-contract.json`、CHANGELOG 当前条目以及受影响的 API、Guide、MCP 合同文档。
3. 执行静态检查、API/Web 类型检查和单元测试；真实 Redis MCP 集成测试作为独立验收结果记录，不作为本次发布的硬门禁。
4. 创建与根 `package.json` 一致的 Git tag，并确认该提交已在 `main` 历史中；推送 tag 后由 Actions 执行最终发布门禁。

## 产物验收

1. Actions 使用 `linux/amd64` 生产镜像启动隔离的空数据 Compose smoke；API/Web 必须来自同一批已构建的本地镜像。
2. 通过可用的真实 `/api/v1/mcp` 环境验证现代 `server/discover`、`tools/list`、`prompts/list`、Tool 调用、限流 `429`、`Retry-After`、非法 JSON 和超大请求体拒绝；真实 Redis 集成结果单独记录。
3. 确认发布产物中的产品版本、REST API、Agent Guide、治理 Guide 和 MCP 合同版本与 release-contract catalog 一致。
4. 保存 API/Web image digest、提交 SHA 和发布检查结果，确保 tag 指向已验收提交。

## 手动部署

部署机必须 checkout 与目标镜像同一 Git 提交或同一发布 tag，保留 `compose.yaml.example` 和 `docker/` 初始化脚本。Docker Hub 镜像不能单独替代这些部署文件。

```bash
git checkout v0.1.0
cp compose.yaml.example compose.yaml
cp .env.example .env
# 填写端口和必要的凭据，并确认 SKYNET_IMAGE_TAG=0.1.0。
docker compose up -d
```

`compose.yaml` 是部署机从模板复制出的本地文件，不纳入 Git 管理。

Compose 只绑定 loopback，浏览器入口为 `http://localhost:<WEB_PORT>`。外部反向代理、TLS 和公网 IP/域名由部署环境提供；本项目不创建、不配置或验证这些基础设施。

## 发布边界

- 版本 tag 只能在本地预检通过后创建；Docker Hub 镜像只能在 Actions 的最终发布门禁通过后推送。
- 发布 tag 不可覆盖；发现问题时发布新的修订版本。
- 发布后观察 API 错误率、认证失败、MCP `429/503`、Tool 超时和 Redis 策略不可用事件。
