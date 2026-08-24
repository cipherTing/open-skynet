---
name: skynet-api-mcp-code-review
description: 审查 Skynet Agent API、Agent Guide 和 MCP 变更，确认公开合同、认证边界、限流、幂等和真实入口行为一致。
---

# Skynet API/MCP 代码审查

## 范围边界

这是日常开发审查 Skill，不是发布门禁。默认不检查产品版本、tag、CHANGELOG、发布目录、生产 URL 或 `release:verify`；只有用户明确要求发布验收时，才切换到发布流程并读取对应发布文档。

## 先确认范围

读取 `git diff --stat`、受影响模块的路由、DTO、领域 Service、测试、Guide 和 API/MCP 设计文档。以 `docs/Agent接口设计规范.md`、`docs/MCP接入设计规范.md` 和实际代码为事实源，不以单个测试或注释推断合同。

## 必查合同

- 路由、HTTP method、DTO 字段、返回字段、稳定错误码和状态码是否同时更新。
- Agent 身份是否来自认证上下文；参数不能覆盖当前 Agent、用户、角色或权限。
- Agent API 和 MCP 是否只调用既有领域 Service，不暴露任意 REST、数据库、队列或内部执行器。
- 写操作是否有明确幂等语义；不可安全重放的操作是否拒绝自动重试。
- MCP 的 initialize、tools/list、tools/call、Prompt、限流、并发、请求体和 `Retry-After` 是否在真实 HTTP 入口成立。
- 错误是否保留调用方需要采取的稳定语义，并隐藏 MongoDB、Redis、队列、堆栈和内部实现细节。
- Guide、API/MCP 设计文档和相关合同测试是否在同一变更中同步；面向用户的接入说明发生变化时，再同步 README。

## 必查执行路径

- 不只检查 Guard 或 middleware 是否被调用；验证拒绝请求不会进入业务 Service 或产生副作用。
- 不只使用手工装配的测试；至少有一次真实 Nest HTTP 入口或运行产物 smoke。
- 对限流、并发、超时、Redis 不可用、非法 JSON、超大 body、重复幂等键和未知 Tool 检查成功、拒绝和副作用三类结果。
- 检查异步操作的所有权、超时后的真实完成、连接关闭、租约释放和晚到 Promise 错误处理。

审查结论必须区分实现缺陷、合同缺口、测试缺口和未执行验证；不要把“没有运行发布检查”报告成 API/MCP 缺陷。

## 证据命令

```sh
pnpm --filter @skynet/api lint
pnpm --filter @skynet/api exec jest --config jest.config.cjs --runInBand --watchman=false
```

定向运行时在 Jest 命令末尾追加受影响的 spec 路径。触及 Web 调用或展示时补充 `pnpm --filter @skynet/web lint`、`pnpm --filter @skynet/web typecheck` 和相关单元测试。涉及页面交互的浏览器审查必须先获得用户确认，未确认不得启动 browser-use。按 [`docs/development/TESTING.md`](../../../docs/development/TESTING.md) 报告每项已选择验证的结果、要求级别、方法和证据。

## 发现问题时

按阻断程度报告：文件和行号、实际行为、公开影响、可复现证据、最小修复边界和缺失测试。不要把风格建议伪装成合同阻断，也不要通过增加 fallback、兼容旁路或放宽权限来掩盖合同问题。
