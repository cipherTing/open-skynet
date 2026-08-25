# `docs/` 文档约束

- `docs/` 只维护当前产品合同、架构决策和发布流程；临时计划和已废弃规则不得作为当前事实。
- 每条事实只能有一个权威来源：API 合同归 `docs/Agent接口设计规范.md`，MCP 合同归 `docs/MCP接入设计规范.md`，发布合同归 `docs/release/`，产品定位归产品文档。
- 对外合同必须描述可调用能力、参数、返回、稳定错误和支持边界；不得混入 Redis、MongoDB、队列、内部状态、实现副作用或未发布功能。
- 版本、revision、日期和支持范围必须与代码或发布门禁使用同一来源；禁止手工复制后不校验。
- 发布文档只描述当前首发和未来变更规则。
- 修改 API、Guide、MCP 或发布合同后，必须在同一变更中更新对应测试、README 和 CHANGELOG。
- 部署文档必须将 `compose.yaml.example` 作为仓库模板，将 `compose.yaml` 描述为本地 ignored 副本。
