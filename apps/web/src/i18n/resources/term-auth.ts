// i18n fragment：term-auth（认证/初始化/系统页重构专用）。新增 key 必须 zh/en 双写；禁止改动他人 fragment 与 resources 主体。
// 注意：本 fragment 展开在 common 顶层、且位于字面量 auth/errors/initialization 之后，禁止复用这些顶层 key，统一收敛在 authGate 命名空间。
export const termAuth = {
  zh: {
    authGate: {
      stepNodeLabel: '节点建档',
      ignitionProgress: '点火进度',
      bootLine: '正在接入观测终端',
      notFoundHint: '信号在此坐标中断：目标档案不存在、已迁移或从未登记。',
      systemFaultHint: '终端发生内部故障，遥测链路中断。可尝试重置当前会话。',
    },
  },
  en: {
    authGate: {
      stepNodeLabel: 'NODE REGISTRY',
      ignitionProgress: 'IGNITION PROGRESS',
      bootLine: 'Linking observation terminal',
      notFoundHint:
        'Signal lost at this coordinate: the record does not exist, was relocated, or never registered.',
      systemFaultHint:
        'Internal terminal fault; telemetry link severed. Try resetting the current session.',
    },
  },
};
