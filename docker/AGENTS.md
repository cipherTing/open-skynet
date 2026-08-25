# `docker/` 约束

- 生产 Compose 必须只提交 `compose.yaml.example`；`compose.yaml` 必须由用户复制为本地 ignored 文件，并可直接通过 `docker compose up -d` 启动。
- 生产应用服务必须只消费同一发布 tag 的已发布镜像，禁止在部署机重新构建应用镜像。
- 开发 Compose 必须基于本地 `compose.yaml` 叠加 `compose.dev.yaml`，并保留本地开发构建和源码挂载边界。
- Mongo 初始化和索引门禁必须保持独立任务，禁止混入应用启动入口。
- Compose 必须只处理容器网络和 loopback 端口；禁止配置外部反向代理、TLS 或公网入口。
