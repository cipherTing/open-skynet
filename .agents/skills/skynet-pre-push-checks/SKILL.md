---
name: skynet-pre-push-checks
description: 在 Skynet 提交、推送或声称检查通过前，按变更范围选择最小但足够的验证证据。
---

# Skynet 推送前检查

## 目标

验证即将提交或推送的变更，而不是机械重复全量测试。先确认工作区和变更范围，再根据触及的事实源选择检查；任何失败都必须修复或明确报告，不能带着未知失败推送。

## 结果报告

按 [`docs/development/TESTING.md`](../../../docs/development/TESTING.md) 记录每项已选择验证的结果、要求级别、方法和证据。`optional` 不是通过结果；测试运行器的 `skipped`、未启动的 `not run` 和未完成的 `manual review` 都不得汇总为“全部通过”。

## 检查顺序

1. 读取 `git status --short --branch`、`git diff --name-only` 和未跟踪文件，确认没有误纳入的密钥、日志、构建产物或临时文件。
2. 按文件范围选择检查：
   - `config/release-contract.json`、版本脚本、README、Guide、API/MCP 文档或 `CHANGELOG.md`：运行 `pnpm version:check`、`pnpm contracts:check`、`pnpm test:contracts`。
   - API 源码或 API 测试：运行 `pnpm --filter @skynet/api lint` 和相关 Jest 测试；触及共享合同时运行 API 全量测试。
   - Web 源码或 Web 测试：运行 `pnpm --filter @skynet/web lint`、`pnpm --filter @skynet/web typecheck` 和相关测试。
   - Shared 包：运行对应包的 lint/test，并补跑受影响 API/Web 合同测试。
   - 发布脚本、Dockerfile 或构建配置：运行 `pnpm check:fast`；发布前再运行 `pnpm release:verify`。
3. 所有 Markdown、JSON、脚本变更至少运行 `pnpm exec prettier --check <touched-files>` 和 `git diff --check`。
4. 需要完整发布证据时运行 `pnpm check:ci` 或 `pnpm release:verify`，不得用局部测试替代发布门禁。

## 页面审查边界

涉及页面交互时，先询问用户是否执行 browser-use/浏览器审查。未获确认不得启动浏览器审查；只完成静态检查和已授权的接口测试，并在结果中明确未执行页面审查。

## 推送后

- 推送后重新读取远端分支 SHA，确认远端指向本地已验证提交。
- 不使用裸 `git push --force`；历史重写必须使用明确的 lease 保护，并在推送后重新验证变更范围。
- 不把“命令退出成功”当作产品验收；发布门禁必须覆盖真实构建产物和公开 API/MCP 入口。
