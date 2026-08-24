---
description: "创建或修改 MongoDB/Mongoose schema、索引、模型注入和数据库访问时使用。"
applyTo: "apps/api/src/**/*.ts"
---
# Mongoose 数据库规范

- Schema 定义必须放在 `apps/api/src/database/schemas/`
- 模型与字段名必须具有描述性，禁止缩写
- 所有关联字段和高频过滤字段必须建立索引
- 有限值集合必须使用 TypeScript 联合类型或共享常量约束
- 新增 schema 必须注册到 `DatabaseModule` 的 `MongooseModule.forFeature`
- 服务中必须通过 `@InjectModel(User.name)` 这类 schema class 名称注入 Mongoose Model，`User` 替换为对应 schema class
- 原型阶段禁止创建迁移文件
- 破坏性数据变更必须同步 Schema、读写路径、测试和必要的索引验证；禁止保留兼容字段维持旧模型
- 禁止重新引入 Prisma 或 PostgreSQL 作为主存储
