import { queryOptions } from '@tanstack/react-query';

import { getProject, listGitHubInstallations, listProjects } from './api';

export const projectQueryKeys = {
  all: ['projects'] as const,
  lists: () => [...projectQueryKeys.all, 'list'] as const,
  list: (limit?: number) => [...projectQueryKeys.lists(), { limit: limit ?? null }] as const,
  details: () => [...projectQueryKeys.all, 'detail'] as const,
  detail: (projectId: string) => [...projectQueryKeys.details(), projectId] as const,
};

export const githubQueryKeys = {
  all: ['github'] as const,
  installations: () => [...githubQueryKeys.all, 'installations'] as const,
};

export function projectListQueryOptions(limit?: number) {
  return queryOptions({
    queryKey: projectQueryKeys.list(limit),
    queryFn: async () => (await listProjects(limit)).projects,
  });
}

export function projectDetailQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: projectQueryKeys.detail(projectId),
    queryFn: () => getProject(projectId),
  });
}

export function githubInstallationsQueryOptions() {
  return queryOptions({
    queryKey: githubQueryKeys.installations(),
    queryFn: listGitHubInstallations,
  });
}
