// Existing GitHub installation-list bounds, shared by scans and cache hints.
export const GITHUB_REPOSITORY_PAGE_SIZE = 100;
export const GITHUB_REPOSITORY_SCAN_LIMIT = 10_000;
export const GITHUB_REPOSITORY_MAX_PAGE = Math.ceil(
  GITHUB_REPOSITORY_SCAN_LIMIT / GITHUB_REPOSITORY_PAGE_SIZE
);
