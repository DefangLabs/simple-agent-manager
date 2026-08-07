import type { ProjectSummary } from '@simple-agent-manager/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectSummaryCard } from '../../src/components/ProjectSummaryCard';
import { SidebarProjectList } from '../../src/components/SidebarProjectList';
import { queryClient } from '../../src/lib/query-client';
import { projectDetailQueryOptions, projectQueryKeys } from '../../src/lib/query-options';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
}));

vi.mock('../../src/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/api')>()),
  getProject: mocks.getProject,
}));

const PROJECT: ProjectSummary = {
  id: 'project-1',
  userId: 'user-1',
  name: 'Prefetched project',
  description: null,
  installationId: 'installation-1',
  repository: 'acme/prefetched-project',
  defaultBranch: 'main',
  status: 'active',
  activeWorkspaceCount: 0,
  activeSessionCount: 0,
  lastActivityAt: '2026-08-07T20:00:00.000Z',
  taskCountsByStatus: {},
  linkedWorkspaces: [],
  createdAt: '2026-08-07T19:00:00.000Z',
  updatedAt: '2026-08-07T20:00:00.000Z',
};

describe('project detail intent prefetch', () => {
  beforeEach(() => {
    queryClient.clear();
    mocks.getProject.mockReset();
    mocks.getProject.mockResolvedValue(PROJECT);
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('prefetches the exact destination query from a project-card hover', async () => {
    render(
      <MemoryRouter>
        <ProjectSummaryCard project={PROJECT} />
      </MemoryRouter>,
    );

    const projectCard = screen.getByText('Prefetched project').closest('[role="button"]');
    if (!projectCard) throw new Error('Project card was not rendered');
    fireEvent.mouseEnter(projectCard);

    await waitFor(() => expect(mocks.getProject).toHaveBeenCalledWith('project-1'));
    expect(queryClient.getQueryData(projectQueryKeys.detail('project-1'))).toEqual(PROJECT);

    await queryClient.fetchQuery(projectDetailQueryOptions('project-1'));
    expect(mocks.getProject).toHaveBeenCalledTimes(1);
  });

  it('prefetches on keyboard focus from the sidebar destination', async () => {
    render(
      <SidebarProjectList
        projects={[PROJECT]}
        loading={false}
        onNavigate={vi.fn()}
      />,
    );

    fireEvent.focus(screen.getByRole('button', { name: /Prefetched project/ }));

    await waitFor(() => expect(mocks.getProject).toHaveBeenCalledWith('project-1'));
  });

  it('prefetches on touch intent from a project card', async () => {
    render(
      <MemoryRouter>
        <ProjectSummaryCard project={PROJECT} />
      </MemoryRouter>,
    );

    const projectCard = screen.getByText('Prefetched project').closest('[role="button"]');
    if (!projectCard) throw new Error('Project card was not rendered');
    fireEvent.touchStart(projectCard);

    await waitFor(() => expect(mocks.getProject).toHaveBeenCalledWith('project-1'));
  });
});
