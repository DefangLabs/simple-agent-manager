import type { ProjectDetailResponse, ProjectSummary } from '@simple-agent-manager/shared';
import { useQuery } from '@tanstack/react-query';

import { projectDetailQueryOptions, projectListQueryOptions } from '../lib/query-options';

interface UseProjectListOptions {
  limit?: number;
  pollInterval?: number;
}

interface UseProjectListResult {
  projects: ProjectSummary[];
  loading: boolean;
  isRefreshing: boolean;
  error: string | null;
  refresh: () => void;
}

export function useProjectList(options: UseProjectListOptions = {}): UseProjectListResult {
  const { limit, pollInterval = 30000 } = options;
  const query = useQuery({
    ...projectListQueryOptions(limit),
    refetchInterval: pollInterval > 0 ? pollInterval : false,
  });

  return {
    projects: (query.data ?? []) as ProjectSummary[],
    loading: query.isPending && query.data === undefined,
    isRefreshing: query.isFetching && query.data !== undefined,
    error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load projects' : null,
    refresh: () => {
      void query.refetch();
    },
  };
}

interface UseProjectDetailResult {
  project: (ProjectDetailResponse & { recentSessions?: unknown[]; recentActivity?: unknown[] }) | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useProjectDetail(projectId: string | undefined): UseProjectDetailResult {
  const query = useQuery({
    ...projectDetailQueryOptions(projectId ?? ''),
    enabled: Boolean(projectId),
  });

  return {
    project: (query.data ?? null) as UseProjectDetailResult['project'],
    loading: Boolean(projectId) && query.isPending && query.data === undefined,
    error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load project' : null,
    refresh: () => {
      void query.refetch();
    },
  };
}
