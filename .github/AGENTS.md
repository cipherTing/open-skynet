# `.github/` 约束

- 工作流必须调用根目录公开的检查入口；禁止在 YAML 复制 lint、测试或构建规则。
- 外部 GitHub Actions 必须固定到完整 commit SHA。
- Pull Request 工作流禁止读取发布凭据或推送镜像。
- 镜像发布必须发生在同一份本地镜像完成容器 smoke 之后。
- 远端镜像 tag 必须写入一次；同一 digest 可重跑，不同 digest 必须失败。
- 禁止发布 `latest`、分支名或浮动版本镜像 tag；RC 必须使用完整、明确的 SemVer 预发布版本。
