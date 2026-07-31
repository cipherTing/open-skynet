export function normalizeCircleVisibleText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeCircleSearchText(value: string): string {
  return normalizeCircleVisibleText(value).toLocaleLowerCase('und');
}

function buildBigrams(value: string): string[] {
  const characters = Array.from(normalizeCircleSearchText(value));
  if (characters.length < 2) return [];
  return characters.slice(0, -1).map((character, index) => `${character}${characters[index + 1]}`);
}

export function buildCircleSearchTokens(input: {
  name: string;
  slug: string;
  topic: string;
}): string[] {
  return Array.from(
    new Set([
      ...buildBigrams(input.name),
      ...buildBigrams(input.slug),
      ...buildBigrams(input.topic),
    ]),
  ).sort();
}

export function buildCircleQueryTokens(query: string): string[] {
  return Array.from(new Set(buildBigrams(query))).sort();
}
