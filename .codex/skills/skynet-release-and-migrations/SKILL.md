---
name: skynet-release-and-migrations
description: '发布 Skynet 版本、镜像或修改 MongoDB Schema、索引和迁移时使用；维护发布合同、自动前向迁移与部署门禁。'
---

# Skynet 发布与数据库迁移

在发布版本、构建或发布镜像、修改公开合同，或变更 MongoDB Schema、索引、迁移和生产部署编排时使用。本 Skill 不用于普通功能开发、局部 UI 调整或无持久化影响的文案修改。

## 先读事实源

- 产品版本唯一来源是根 [`package.json`](../../../package.json)；公开合同目录是 [`config/release-contract.json`](../../../config/release-contract.json)。
- 版本、兼容边界和镜像发布规则以 [`docs/release/`](../../../docs/release/) 为准，尤其是 [`VERSIONING.md`](../../../docs/release/VERSIONING.md) 与 [`release-runbook.md`](../../../docs/release/release-runbook.md)。
- 数据库迁移事实以 [`database-migrations.ts`](../../../apps/api/src/database/database-migrations.ts)、[`database-indexes.ts`](../../../apps/api/src/database/database-indexes.ts) 和 [`compose.yaml.example`](../../../compose.yaml.example) 为准。
- 文档和提交前验证范围以 [`skynet-doc-contracts`](../../../.agents/skills/skynet-doc-contracts/SKILL.md) 与 [`skynet-pre-push-checks`](../../../.agents/skills/skynet-pre-push-checks/SKILL.md) 为准。

## 发布合同

- 根 `package.json`、工作区镜像版本和 release contract 必须一致；涉及 Agent API、Guide 或 MCP 合同时，同步更新对应合同、测试、CHANGELOG 和必要的发布文档。
- 正式 Git tag 必须等于根版本加既定前缀，且不能覆盖已有 tag。
- 正式 SemVer 镜像只能由 GitHub Actions 发布。手工镜像仅限已经验证并已推送提交的不可变 `dev-<完整 SHA>`；禁止发布 `latest`、浮动 tag 或覆盖不同 digest 的同名 tag。
- 发布、推送、创建 tag、发布镜像和合并分支都是外部写入；没有用户当场明确授权时，只做本地验证并报告结果。

## 自动数据库迁移

- 生产升级只能通过已登记、前向、可验证且可重跑的迁移完成；禁止恢复人工 `--allow-drop`、启动时 `syncIndexes()` 或请求路径 DDL。
- 每条已发布迁移必须保持独立稳定 ID 与 checksum。需要改变既有迁移行为时，新增迁移，不修改已记录迁移的语义。
- 迁移必须使用跨实例互斥锁、租约续期和有上界的批量回填。迁移、索引对齐与迁移记录写入必须在同一持锁流程中完成。
- 索引变化先完成数据规范化、创建并验证目标索引，再删除名称和定义均精确匹配的遗留索引。未知漂移、同名不同定义或新约束不满足时必须失败，禁止泛化自动删除。
- 迁移记录只能在迁移和最终 Schema 索引对齐均成功后写入；失败后必须可安全重跑。

## 部署与验证

- 部署机的 checkout 必须与目标镜像版本一致；`compose.yaml` 与 `.env` 是从模板生成的本地文件，不能提交。API、Web 和迁移任务必须使用同一个镜像版本选择。
- Compose 顺序必须保持为：Mongo 初始化成功，迁移任务成功，API 就绪，Web 启动。迁移失败时不能绕过它启动服务，应检查迁移任务日志并修正根因。
- 修改发布脚本、Dockerfile、Compose 或发布合同至少运行 `pnpm check:fast`。正式发布时，先将发布提交推送到 `main`，创建本地版本 tag，以该 tag 运行 `RELEASE_TAG=<tag> pnpm release:verify`，通过后再推送 tag；局部测试不能替代发布门禁。
- 修改迁移或索引时，运行相关 API 测试、`pnpm containers:check`、Compose 配置校验和真实就绪接口验证；变更范围需要时补跑全量 API 测试与构建。
