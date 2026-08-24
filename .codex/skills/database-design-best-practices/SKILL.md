---
name: database-design-best-practices
description: 审查或设计 Skynet 的 MongoDB/Mongoose 数据模型、字段、唯一约束、索引、嵌入文档和持久化不变量时使用。重点识别拼接业务键、无结构 Object、无界数组、可变账本、错误 TTL 语义和无消费者索引，并给出可直接落地的结构化方案。
---

# 数据库最佳设计规范

## 使用边界

只处理持久化模型、字段类型、文档边界、引用关系、唯一约束、索引、时间字段、审计账本和数据库级不变量。

不得把 Controller、MCP、缓存、队列或页面实现当成数据库事实；先读取真实 Schema、写入路径、查询路径和当前数据库索引，再下结论。

## 审查流程

1. 盘点 `apps/api/src/database/schemas/`、模型注册、所有写入服务和高频查询。
2. 对每个集合记录：主键、引用字段、状态字段、时间字段、数组上界、嵌入结构、唯一约束和查询排序。
3. 用真实数据库 `listIndexes()`、样本文档和 `explain("executionStats")` 验证 Schema 与实际集合是否一致。
4. 把问题按 P0/P1/P2/P3 分级；每条必须给出文件、字段或索引证据、危害和修复方向。
5. 先修正事实模型，再调整索引；禁止用兼容字段、旁路字段或运行时修复掩盖模型错误。

## 身份与唯一性

- MongoDB `_id` 是文档身份；内部关联默认使用 `ObjectId`/`Schema.Types.ObjectId`，对外序列化为字符串。若选择字符串 ID，必须在模型边界统一类型、格式和生成规则，不能同一关系混用两种类型。
- 不得把多个业务字段拼成一个字符串再作为唯一事实，例如 `TYPE:ID:VERSION`、`circleId:scope`。字段必须分别持久化，并用 MongoDB 复合唯一索引表达约束。
- 复合唯一键的字段必须是事实字段；派生键只能作为明确的外部标识，不能同时承担事实存储和完整性约束。
- 多态目标使用判别字段加目标 ID（必要时加版本、轮次）的复合索引；不同集合的 ID 类型不明确时，改用显式引用结构或拆分集合。
- 唯一约束必须由 MongoDB 索引保证。Mongoose 的 `unique` 只是建索引助手，不是校验器；业务错误处理必须识别 duplicate-key 错误。
- 删除后允许重名时使用 partial unique index；不要用软删除字段拼接替代 partial index。

## 文档结构与不变量

- 核心业务联合类型不得使用 `type: Object` 或无边界 Mixed。按判别字段建立嵌入 Schema，声明 required、enum、长度、数值范围和跨字段校验。
- 只有确实不可查询、大小有上限的外部元数据才允许使用 Mixed；必须声明大小上限和序列化格式。
- 嵌入文档只用于有界、同生命周期、按父文档一起读取的数据。修订、投票、评论、浏览、事件和其他可持续增长历史必须独立集合。
- 所有数组都必须有可证明的上界；无界关系使用独立关系集合。不要把用户、帖子或事件 ID 持续追加到一个文档数组中。
- 计数器、快照和缓存投影必须明确是事实还是派生值；派生值要有重算来源、版本或校验，不得与不可审计的自由修改混在一起。
- 固定形状的计数对象使用嵌入 Schema 或数据库 JSON Schema 校验，保证键集合、整数和非负约束。

## 事件、账本与幂等

- 审计、积分、治理裁决和其他历史事实默认 append-only：核心字段 immutable，禁止 update/delete；纠正只能追加新的补偿事件。
- `sourceType`、`reason`、`status`、`choice` 等业务枚举必须由共享常量和 Schema enum 同时约束；禁止裸字符串作为永久协议。
- 金额、积分、计数和版本字段必须声明整数性、上下界和默认值；不得依赖服务层 `Math.max` 或归一化函数掩盖脏数据。
- 幂等记录不能只依赖 TTL。正确性必须由业务事务内的唯一键或可恢复命令记录保证；TTL 只负责最终物理清理，不能决定请求是否重复执行。
- 业务事实与幂等状态需要同一事务提交，或业务集合自身持有不可变幂等键并以唯一索引保护。

## 时间与状态

- `Date` 表示时间瞬间；必须统一存 UTC，并在业务层明确显示时区。
- 只有“上海自然日”“周起始日”这类民用日期才允许使用字符串；必须固定格式、正则校验、生成函数和时区来源。
- 过期时间字段可以建立 TTL 索引，但 TTL 是异步物理清理机制，不是权限、截止结算或状态转换依据；业务查询必须显式判断时间和状态。
- 状态机必须有明确的状态枚举、合法转换和版本条件；不能通过多个可自由修改的布尔字段拼出隐式状态。

## 索引规范

- 每个索引都必须对应真实查询、排序、唯一性或 TTL 需求；没有消费者的索引必须删除。
- 复合索引按查询形状设计：先放等值过滤，再放排序字段，最后放范围字段；稳定分页通常以时间字段加 `_id` 作为唯一排序。
- partial index 的过滤表达式必须与查询条件一致；不要同时保留覆盖同一查询的重复短索引和长索引。
- 多键索引会随数组元素数量放大写入成本；没有数组查询收益时禁止建立多键索引。
- 索引设计完成后必须用真实规模数据检查 `totalKeysExamined`、`totalDocsExamined`、排序是否落盘和是否命中预期索引，不能只看返回行数。

## 变更与验证

- 原型阶段的破坏性字段重构可以直接重建空开发数据；禁止保留两套事实字段只为兼容旧实现。
- 任何字段、唯一约束或索引变更必须同步 Schema、服务查询、测试和必要的索引 explain 验证。
- 验证至少覆盖：重复写入、并发唯一冲突、状态乱序、事务回滚、过期记录、数组上界、非法联合 payload、删除/恢复和真实分页。
- 交付前检查实际集合索引、Schema 索引声明和文档样本三者一致；发现漂移必须修复，不得在请求路径执行 DDL 或全量回填。

## 官方依据

- MongoDB 数据建模与关系：<https://www.mongodb.com/docs/manual/data-modeling/>
- MongoDB 复合索引：<https://www.mongodb.com/docs/manual/core/indexes/index-types/index-compound/>
- MongoDB 唯一索引：<https://www.mongodb.com/docs/manual/core/index-unique/>
- MongoDB Schema Validation：<https://www.mongodb.com/docs/manual/core/schema-validation/>
- MongoDB TTL 索引：<https://www.mongodb.com/docs/manual/core/index-ttl/>
- Mongoose Schema Indexes：<https://mongoosejs.com/docs/guide.html#indexes>
- Mongoose `unique` 不是校验器：<https://mongoosejs.com/docs/validation.html#the-unique-option-is-not-a-validator>
