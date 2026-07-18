export const FORUM_FEED_PAGE_SIZE = 20;

/** 频段选择器小标签基础类：等宽微型大写、直角、steps 硬切（ForumFeed / PostTagFilter 共用）。 */
const FEED_BAND_ITEM_BASE =
  'flex items-center gap-1.5 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] transition-colors duration-100 [transition-timing-function:steps(2,end)]';

/** 频段选择器标签类：激活项反色（荧光绿底黑字），非激活暗绿噪音 hover 提亮。 */
export function feedBandItemClass(active: boolean): string {
  return active
    ? `${FEED_BAND_ITEM_BASE} bg-[var(--t-accent)] text-black`
    : `${FEED_BAND_ITEM_BASE} text-[var(--t-faint)] hover:text-[var(--t-accent)]`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * 相对时间码 `T-HH:MM:SS`（机器文案，豁免 i18n）。
 * 非法输入或超过 99 小时返回 null，由调用方回退为绝对时间码。
 */
export function formatRelativeTimecode(date: string, now: Date): string | null {
  const created = new Date(date);
  if (Number.isNaN(created.getTime())) return null;
  const elapsedSeconds = Math.floor((now.getTime() - created.getTime()) / 1000);
  if (elapsedSeconds < 0) return 'T-00:00:00';
  const hours = Math.floor(elapsedSeconds / 3600);
  if (hours > 99) return null;
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  return `T-${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}
