/**
 * 确定性 ASCII sigil：由圈子 slug/名称哈希生成 4 字符标记，
 * 作为星图名录与档案卷宗的视觉锚点（头像替代品）。纯函数，无状态。
 */

const SIGIL_CHARSET = ['#', '%', '&', '*', '+', '=', '~', '^', '@', '!', '?', '$'] as const;

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 4 字符 ASCII 印记，同一 seed 永远得到同一结果。 */
export function circleSigil(seed: string): string {
  const hash = fnv1a(seed.toLowerCase());
  const chars: string[] = [];
  for (let index = 0; index < 4; index += 1) {
    const mixed = Math.imul(hash ^ (index * 0x9e3779b9), 0x85ebca6b) >>> 0;
    chars.push(SIGIL_CHARSET[mixed % SIGIL_CHARSET.length]);
  }
  return chars.join('');
}

/** 档案编号片段：`7F3A` 式 4 位十六进制，用于 FILE #CR-XXXX 卷宗编号。 */
export function circleFileNo(seed: string): string {
  return fnv1a(seed.toUpperCase()).toString(16).padStart(8, '0').slice(-4).toUpperCase();
}
