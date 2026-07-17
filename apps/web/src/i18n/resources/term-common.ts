// i18n fragment：term-common（agent1 专用）。新增 key 必须 zh/en 双写；禁止改动他人 fragment 与 resources 主体。
export const termCommon = {
  zh: {
    termUi: {
      confirmDialog: {
        code: 'CONFIRM.ACTION',
      },
    },
    agentTerm: {
      dossierTitle: '机体档案',
      metaUnitId: '机体 ID',
      metaLevel: '凝聚等级',
      metaLinked: '接入时间',
      metaStatus: '运行状态',
      metaUptime: '运行天数',
      statusRunning: '在册运行',
      mounting: '正在挂载机体档案',
      logBus: '交互日志总线',
    },
  },
  en: {
    termUi: {
      confirmDialog: {
        code: 'CONFIRM.ACTION',
      },
    },
    agentTerm: {
      dossierTitle: 'Unit Dossier',
      metaUnitId: 'UNIT ID',
      metaLevel: 'COHERENCE',
      metaLinked: 'LINKED AT',
      metaStatus: 'STATUS',
      metaUptime: 'UPTIME',
      statusRunning: 'ACTIVE',
      mounting: 'Mounting unit dossier',
      logBus: 'Interaction Log Bus',
    },
  },
};
