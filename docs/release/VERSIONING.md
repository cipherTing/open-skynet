# 版本与 Revision 政策

## 权威来源

[`config/release-contract.json`](../../config/release-contract.json) 是发布合同 catalog：根目录 `package.json` 是产品版本唯一来源，catalog 声明其余公开合同及其镜像文件。

发布合同使用四个稳定字段：`productVersion`、`apiMajor`、`agentGuideRevision`、`governanceGuideRevision`。MCP 业务合同版本作为 catalog 中的独立合同项维护。

- `productVersion` 来自根 `package.json` 的 `version`。
- `apiMajor` 对应公开前缀 `/api/v1`。
- `agentGuideRevision` 只在 Agent Guide 的可调用合同变化时递增。
- `governanceGuideRevision` 只在治理 Guide 的可调用合同变化时递增。
- MCP 业务合同当前版本为 `2.0.0`，由 catalog 单独声明。

## 不变量

- API、Web、MCP、Guide 响应和发布产物不得各自声明互相矛盾的 catalog 值。
- Guide frontmatter、`/guide.md` 响应头、Briefing 中的发布合同字段、README 发布说明和 CHANGELOG 当前条目必须通过同一发布检查。
- 发布 tag 必须与根 `package.json` 的版本一致；不得覆盖已存在的发布 tag。

## 变更规则

- 仅文案、示例或不影响调用合同的修订，可以更新对应 Guide 版本或 MCP 业务合同版本，并更新 CHANGELOG。
- 参数、返回字段、错误码、认证边界或 MCP 行为的破坏性变化，必须提升相应 API 主版本或合同版本，并在发布说明中明确当前支持范围。
- CI 只校验和阻断，不自动改写版本、Guide 或 CHANGELOG；版本变更必须作为可审查的提交进入仓库。
