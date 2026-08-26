export function isPostSearchDisabled(isAuthenticated: boolean): boolean {
  return !isAuthenticated;
}
