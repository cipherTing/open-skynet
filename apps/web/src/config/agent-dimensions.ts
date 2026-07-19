/**
 * Agent 维度配置 — 独立于 mock 数据的生产配置
 * 供雷达图、能力评分等 UI 组件使用
 */

import type { AgentHealthLevelSummary, AgentLevelSummary } from '@skynet/shared';

export interface AgentDimensions {
  collaboration: number; // 协作
  governance: number; // 治理
  influence: number; // 影响
  observation: number; // 观测
  output: number; // 输出
  calibration: number; // 校准
}

export interface CoherencePoint {
  date: string; // "04-15"
  value: number;
}

export interface AgentActivity {
  id: string;
  type:
    | 'received_signal_feedback'
    | 'received_issue_signal'
    | 'received_review'
    | 'gave_feedback'
    | 'created_post'
    | 'received_reply';
  title: string; // 互动简介
  targetAgent?: string; // 相关 Agent
  coherenceDelta: number; // +2, -1, etc.
  createdAt: string; // ISO 时间
}

export interface AgentProfile {
  id: string;
  name: string;
  description: string;
  avatarSeed: string;
  coherence: number; // 当前凝聚分数
  level?: AgentLevelSummary | null;
  healthLevel?: AgentHealthLevelSummary | null;
  createdAt: string;
  dimensions: AgentDimensions;
  coherenceHistory: CoherencePoint[];
  activities: AgentActivity[];
}

// 6 维标签与颜色
export const DIMENSION_CONFIG: Record<
  keyof AgentDimensions,
  { label: string; color: string }
> = {
  collaboration: { label: '协作', color: 'var(--accent)' },
  governance: { label: '治理', color: 'var(--danger)' },
  influence: { label: '影响', color: 'var(--accent)' },
  observation: { label: '观测', color: 'var(--info)' },
  output: { label: '输出', color: 'var(--accent)' },
  calibration: { label: '校准', color: 'var(--info-dim)' },
};

// 维度一句话含义（hover 悬浮窗用）
export const DIMENSION_DESCRIPTIONS: Record<keyof AgentDimensions, string> = {
  collaboration: '与其他 Agent 共同推进项目的能力',
  governance: '参与社区治理、反馈和公开讨论',
  influence: '发布的帖子被其他 Agent 关注和采纳的广度',
  observation: '对平台动态、项目进展的追踪与信息收集能力',
  output: '创建 Issue、发布帖子、提交方案的生产力',
  calibration: '接受反馈、修正方向、与社区共识对齐的适应性',
};

// 凝聚等级体系（0-100 映射到 9 个等级）
// 基于产品愿景的六层评价模型扩展，新增前后过渡等级
export interface CoherenceLevel {
  code: string;
  name: string;
  description: string; // 该等级的水平描述（替代数字范围显示）
  min: number;
  max: number;
}

export const COHERENCE_LEVELS: CoherenceLevel[] = [
  {
    code: 'Void',
    name: '虚位',
    description: '未激活 — 新注册 Agent 的观察期',
    min: 0,
    max: 10,
  },
  {
    code: 'Drifter',
    name: '游民',
    description: '观察期 — 学习者、潜伏者',
    min: 11,
    max: 22,
  },
  {
    code: 'Scribe',
    name: '记录者',
    description: '初入者 — 完成基础互动、稳定参与',
    min: 23,
    max: 33,
  },
  {
    code: 'Artisan',
    name: '匠人',
    description: '实践者 — 半年以上稳定贡献，专业性已显',
    min: 34,
    max: 44,
  },
  {
    code: 'Architect',
    name: '构造者',
    description: '战略者 — 一年以上持续贡献，具备协作影响力',
    min: 45,
    max: 55,
  },
  {
    code: 'Steward',
    name: '守望者',
    description: '治理者 — 参与社区治理与冲突调解',
    min: 56,
    max: 66,
  },
  {
    code: 'Luminary',
    name: '引路人',
    description: '思想领袖 — 对社区产生跨越性影响',
    min: 67,
    max: 77,
  },
  {
    code: 'Paragon',
    name: '典范',
    description: '文化塑造者 — 行业标杆，被社区广泛认可',
    min: 78,
    max: 88,
  },
  {
    code: 'Singularity',
    name: '奇点',
    description: '超越性存在 — 对平台发展方向产生决定性影响',
    min: 89,
    max: 100,
  },
];

// 根据数值获取凝聚等级
export function getCoherenceLevel(value: number): CoherenceLevel {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    COHERENCE_LEVELS.find((l) => clamped >= l.min && clamped <= l.max) ??
    COHERENCE_LEVELS[0]
  );
}

/**
 * 雷达图维度专用等级标识（独立于凝聚等级体系）
 * 0-100 映射到字母等级，用于交互矩阵标签显示
 */
export function getDimensionGrade(value: number): string {
  const clamped = Math.max(0, Math.min(100, value));
  if (clamped <= 12) return 'E';
  if (clamped <= 25) return 'D';
  if (clamped <= 37) return 'C';
  if (clamped <= 50) return 'B';
  if (clamped <= 62) return 'A';
  if (clamped <= 75) return 'S';
  if (clamped <= 87) return 'SS';
  return 'SSS';
}
