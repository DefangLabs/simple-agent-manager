import type { ProjectSummary } from '@simple-agent-manager/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useProjectList } from '../../../src/hooks/useProjectData';

const mocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
}));

vi.mock('../../../src/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/lib/api')>()),
  listProjects: mocks.listProjects,
}));

const PROJECT: ProjectSummary = {
  id: 'project-1',
  userId: 'user-1',
  name: 'Cached project',
  description: null,
  installationId: 'installation-1',
  repository: 'acme/cached-project',
  defaultBranch: 'main',
  status: 'active',
  activeWorkspaceCount: 1,
  activeSessionCount: 0,
  lastActivityAt: '2026-08-07T20:00:00.000Z',
  taskCountsByStatus: {},
  linkedWorkspaces: [],
  createdAt: '2026-08-07T19:00:00.000Z',
  updatedAt: '2026-08-07T20:00:00.000Z',
};

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 60_000,
      },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  return { client, Wrapper };
}

describe('useProjectList query cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listProjects.mockResolvedValue({ projects: [PROJECT] });
  });

  it('deduplicates concurrent consumers of the same project list', async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(
      () => ({
        sidebar: useProjectList({ limit: 50, pollInterval: 0 }),
        page: useProjectList({ limit: 50, pollInterval: 0 }),
      }),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(result.current.sidebar.projects).toEqual([PROJECT]);
      expect(result.current.page.projects).toEqual([PROJECT]);
    });
    expect(mocks.listProjects).toHaveBeenCalledTimes(1);
  });

  it('reuses fresh cached data when a consumer remounts', async () => {
    const { Wrapper } = createWrapper();
    const first = renderHook(
      () => useProjectList({ limit: 50, pollInterval: 0 }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(first.result.current.projects).toEqual([PROJECT]));
    first.unmount();

    const second = renderHook(
      () => useProjectList({ limit: 50, pollInterval: 0 }),
      { wrapper: Wrapper },
    );

    expect(second.result.current.projects).toEqual([PROJECT]);
    expect(second.result.current.loading).toBe(false);
    expect(mocks.listProjects).toHaveBeenCalledTimes(1);
  });

  it('keeps cached projects visible during a background refresh', async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(
      () => useProjectList({ limit: 50, pollInterval: 0 }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.projects).toEqual([PROJECT]));

    let resolveRefresh: ((value: { projects: ProjectSummary[] }) => void) | undefined;
    mocks.listProjects.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => expect(result.current.isRefreshing).toBe(true));
    expect(result.current.projects).toEqual([PROJECT]);
    expect(result.current.loading).toBe(false);

    await act(async () => {
      resolveRefresh?.({ projects: [{ ...PROJECT, name: 'Updated project' }] });
    });

    await waitFor(() => expect(result.current.projects[0]?.name).toBe('Updated project'));
  });
});
