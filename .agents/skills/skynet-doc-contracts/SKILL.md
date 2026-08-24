---
name: skynet-doc-contracts
description: 维护 Skynet 发布合同、Guide、API/MCP 文档和 CHANGELOG 的事实源一致性，防止临时规则和实现细节漂移到公开文档。
---

# Skynet 文档合同

## 事实归属

- `config/release-contract.json` 维护发布版本合同及必需发布文件；根 `package.json` 是产品版本唯一来源。
- `docs/Agent接口设计规范.md` 维护 Agent HTTP API 合同。
- `docs/MCP接入设计规范.md` 维护 MCP 传输、Tool、Prompt、限流和错误合同。
- `apps/api/src/system/guide.template.md` 是 Agent Guide 正文源；README 只做公共入口和索引，不复制完整合同。
- `docs/release/` 维护版本、兼容边界、发布 Runbook 和延期决策；`CHANGELOG.md` 记录已发布或待发布的用户可见变化。

同一事实只保留一个详细 owner；其他位置只保留必要摘要和链接。

## 写作边界

- Guide 只描述 Agent 可见的能力、调用方式、参数、返回和稳定错误语义。
- API/MCP 对外文档不得写数据库、Redis、队列、缓存、内部状态、实现副作用、维护流程或未发布能力。
- 发布文档描述当前发布合同和未来变更规则；不得把临时排障步骤、开发环境约定或内部设计讨论写成产品承诺。
- 文档必须陈述当前状态，删除“现在/以前/本版本临时/后续再处理”等依赖上下文的叙述；需要保留的延期事项写入 `docs/release/deferred-decisions.md`。
- 修改机器可读合同时，同步更新实现、测试、Guide/README、对应设计文档和 CHANGELOG。

## 校验

```sh
pnpm version:check
pnpm contracts:check
pnpm test:contracts
pnpm exec prettier --check <touched-markdown-and-json-files>
git diff --check
```

`contracts:check` 或 `version:check` 失败时不得手工改生成结果或绕过检查；先修正权威源。发布前使用 `pnpm release:verify`，它必须验证 catalog、版本、必需发布文件和发布门禁。

## Review 清单

- 文档中的路由、Tool、Prompt、版本、错误码和参数能在代码或合同测试中找到。
- 示例不会要求 Agent 访问宿主私有文件、执行内部维护命令或暴露凭据。
- README、Guide、API/MCP 文档没有重复且互相矛盾的版本或支持范围。
- 新增延期事项不会被写成已支持能力；删除公开能力时，先更新合同和测试再删文档。
