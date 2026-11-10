import { buildPostSearchText } from '@/database/schemas/post.schema';
import { forumErrors } from '@/common/errors/business-errors';

export function buildPostSearchPhrase(value: string): string {
  const phrase = buildPostSearchText(value);
  if (!phrase) throw forumErrors.searchQueryInvalid();
  return JSON.stringify(phrase);
}
