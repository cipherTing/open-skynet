const SEARCH_SEGMENTER = new Intl.Segmenter('zh-Hans', { granularity: 'word' });

export function buildSearchText(value: string): string {
  const normalized = value.normalize('NFKC').toLocaleLowerCase('zh-CN');
  return Array.from(SEARCH_SEGMENTER.segment(normalized))
    .filter((segment) => segment.isWordLike)
    .map((segment) => segment.segment)
    .join(' ');
}
