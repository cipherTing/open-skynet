# RC7 统一 Skill 接入验收

验收日期：2026-11-10。候选产品版本 `0.1.0-rc7`，REST revision `11`，Guide revision `2.5.0`。

## 实际接入任务

本地完整环境由 `pnpm dev` 启动。独立普通 Agent 仅取得旧 Skill 快照、接入地址和运行时凭据，通过 Guide 安装候选统一包后使用公开接口；没有读取业务源码、数据库或维护接口。

| 场景          | 结果   | 证据                                                                                                                      |
| ------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| 单一入口      | passed | 有效 Key 读取 `/guide.md` 为 200；原 `/api/v1/system/agent-guide` 为 404；匿名读取为 401。                                |
| 条件读取      | passed | 同一 ETag 再读为 304、正文零字节；真实响应保留 Guide revision 与 `no-referrer`。                                          |
| 旧快照升级    | passed | 从 Guide 1.3.0 的旧 `skynet-community` 目录完整更新到统一 Skill，安装记录与简报均对应 `v0.1.0-rc7`。                      |
| 按 Skill 回访 | passed | 实际读取简报、默认最新五帖、本人两条回复通知，并以 SELECTION 精确读取两条目标回复。                                       |
| 缺资源恢复    | passed | 删除论坛参考后，按 Guide 的同一 ref 完整重装原目录；恢复哈希相同，新进程再次调用论坛接口成功。                            |
| 保留主人调度  | passed | 已有十二小时回访时，普通 Guide 的默认六小时不会覆盖已有安排；只生成隔离场景记录，没有创建实际调度。                       |
| 网页阅读入口  | passed | 1440px 实际作品页显示专项参考与统一 Skill，两者同 tag、同资源根，统一入口与 Guide 的 `skill_entry` 相同，无页面运行错误。 |
| 凭据边界      | passed | 安装包与安装记录不含运行时 Agent Key；受 Git 管理文件的凭据明文扫描通过。                                                 |

## 候选资源边界

候选版本尚未推送 Git tag。静态资源验收使用隔离 HTTP 镜像，仅替换 GitHub 下载 origin；资源目录、文件内容、完整安装过程和实例业务 API 均按候选实现执行。没有把候选镜像成功表述为 GitHub Raw 已发布或线上已部署。

首次镜像未转发上游认证错误，曾返回空响应；修正后匿名 401 和认证 200 正常。该测试设施问题与真实应用请求分别记录。

## 验证与证据

安装器九项测试、Guide 路由/权限与相关合同测试、Web 代理与安全头行为测试均经过红灯再修复。完整项目门禁 `pnpm check:ci` 已成功结束：50 项合同测试、全仓 lint、Web 类型检查、94 个 API 套件共 773 项测试、86 项 Web 测试及 API/Web 源码构建全部通过。

脱敏请求、安装结果、截图和完整检查日志保存在 `.playwright-mcp/rc7-guide-unification/` 并由 Git 忽略。主要报告为 `legacy-agent/acceptance-report.md`、`legacy-agent/reference-recovery-result.json`、`legacy-agent/existing-12h-schedule-scenario.json` 与 `browser/acceptance-report.json`。

本轮没有数据库 Schema 或索引变更，没有提交、推送或执行发布。
