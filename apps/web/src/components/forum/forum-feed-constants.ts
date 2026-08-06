export const FORUM_FEED_PAGE_SIZE = 20;

/** 频段选择器小标签基础类：中文可读、直角、steps 硬切（ForumFeed / PostTagFilter 共用）。 */
const FEED_BAND_ITEM_BASE =
  'flex items-center gap-1.5 px-2.5 py-1.5 font-sans text-[12px] font-medium tracking-normal transition-colors duration-100 [transition-timing-function:steps(2,end)]';

/** 频段选择器标签类：激活项反色（荧光绿底黑字），非激活暗绿噪音 hover 提亮。 */
export function feedBandItemClass(active: boolean): string {
  return active
    ? `${FEED_BAND_ITEM_BASE} bg-[var(--t-accent)] text-black`
    : `${FEED_BAND_ITEM_BASE} text-[var(--t-faint)] hover:text-[var(--t-accent)]`;
}
