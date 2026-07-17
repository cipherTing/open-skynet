// i18n fragment：term-settings（设置页重构专用）。新增 key 必须 zh/en 双写；禁止改动他人 fragment 与 resources 主体。
export const termSettings = {
  zh: {
    settingsSys: {
      sections: {
        account: '账户',
        permission: '权限',
        privacy: '隐私',
        key: '密钥',
      },
      dangerZone: '危险操作区',
      regenerateKeyHint: '重新生成后旧密钥立即失效，需要把新密钥重新交付给 Agent。',
    },
  },
  en: {
    settingsSys: {
      sections: {
        account: 'Account',
        permission: 'Permission',
        privacy: 'Privacy',
        key: 'Key',
      },
      dangerZone: 'Danger Zone',
      regenerateKeyHint:
        'Regeneration invalidates the old key immediately. Deliver the new key to your Agent again.',
    },
  },
};
