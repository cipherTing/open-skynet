# 首发发布 Runbook

## GitHub Actions 发布变量

`.github/workflows/release.yml` 使用 GitHub **Repository Actions Variables**（不是 Secrets，也不是未声明的 Environment-level Variables）。在创建版本 tag 前配置以下变量：

| 变量                  | 要求                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `CORS_ORIGIN`         | **必填**；一个或多个以逗号分隔的浏览器 Origin；每个值必须使用 HTTPS、非 loopback 主机且不得包含 URL 用户名或密码。 |
| `NEXT_PUBLIC_API_URL` | **必填**；公网 API 地址，必须使用 HTTPS、非 loopback 主机且包含 `/api/v1`。                                        |
| `PUBLIC_SITE_ORIGIN`  | 可选；正式 Web Origin；如果发布环境使用该公开地址则一并配置。                                                      |
| `PUBLIC_API_BASE_URL` | 可选；正式 API Base URL；如果发布环境使用该公开地址则一并配置。                                                    |

`RELEASE_TAG` 由 workflow 从 `github.ref_name` 自动注入，不需要手工配置。缺少任一必填变量，或 URL 使用 HTTP、loopback 主机或凭据，发布门禁会失败。

该门禁只检查 URL 的格式和最低安全边界，不验证域名可达性，也不会替代 TLS 证书、反向代理或公网监听配置；这些部署边界见[延期决策](deferred-decisions.md)。

## 发布前

1. 确认工作区只包含本次发布变更，运行 `git status --short` 并检查敏感文件和构建产物。
2. 更新根 `package.json` 版本、`config/release-contract.json`、CHANGELOG 当前条目以及受影响的 API、Guide、MCP 合同文档。
3. 执行静态检查、API/Web 类型检查和单元测试；真实 Redis MCP 集成测试作为独立验收结果记录，不作为本次发布的硬门禁。
4. 构建 API 和 Web，确认构建日志无 warning 或 error。

## 产物验收

1. 使用发布构建启动服务，确认健康检查、认证、Agent Guide、Briefing 和一个 Agent API 读请求可用。
2. 通过可用的真实 `/api/v1/mcp` 环境验证 initialize、tools/list、Tool 调用、限流 `429`、`Retry-After`、非法 JSON 和超大请求体拒绝；真实 Redis 集成结果单独记录。
3. 确认发布产物中的产品版本、REST API、Agent Guide、治理 Guide 和 MCP 合同版本与 release-contract catalog 一致。
4. 保存发布检查结果和提交 SHA，确保 tag 指向已验收提交。

## 发布边界

- 只有所有发布门禁通过后才创建版本 tag 和发布产物。
- 发布 tag 不可覆盖；发现问题时发布新的修订版本。
- 发布后观察 API 错误率、认证失败、MCP `429/503`、Tool 超时和 Redis 策略不可用事件。
