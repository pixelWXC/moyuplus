import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createGitLogQuerySnapshot, toGitLogLoadRequest } from '../../git/gitLogQuery';

describe('Git Log query snapshots', () => {
  it('captures and normalizes each mutable query input exactly once', () => {
    const getWorkspaceRoots = vi.fn(() => ['D:/workspace/../repo', 'D:/other']);
    const getActiveFilePath = vi.fn(() => 'D:/repo/src/../index.ts');
    const getMaxCommits = vi.fn(() => 20.6);

    const snapshot = createGitLogQuerySnapshot({ getWorkspaceRoots, getActiveFilePath, getMaxCommits });

    expect(snapshot).toMatchObject({
      workspaceRoots: [path.normalize('D:/workspace/../repo'), path.normalize('D:/other')],
      activeFilePath: path.normalize('D:/repo/src/../index.ts'),
      maxCommits: 21
    });
    expect(getWorkspaceRoots).toHaveBeenCalledTimes(1);
    expect(getActiveFilePath).toHaveBeenCalledTimes(1);
    expect(getMaxCommits).toHaveBeenCalledTimes(1);
  });

  it('uses an unambiguous stable key that preserves root ordering and optional active-file semantics', () => {
    const create = (workspaceRoots: string[], activeFilePath?: string, maxCommits = 200) =>
      createGitLogQuerySnapshot({
        getWorkspaceRoots: () => workspaceRoots,
        getActiveFilePath: () => activeFilePath,
        getMaxCommits: () => maxCommits
      });

    const base = create(['D:/a|b', `D:/nul${String.fromCharCode(0)}root`], 'D:/a\\b/file.ts');
    expect(create(['D:/a|b', `D:/nul${String.fromCharCode(0)}root`], 'D:/a\\b/file.ts').queryKey).toBe(base.queryKey);
    expect(create([`D:/a|b${String.fromCharCode(0)}D:/nul`, 'root'], 'D:/a\\b/file.ts').queryKey).not.toBe(base.queryKey);
    expect(create([`D:/nul${String.fromCharCode(0)}root`, 'D:/a|b'], 'D:/a\\b/file.ts').queryKey).not.toBe(base.queryKey);
    expect(create(['D:/a|b', `D:/nul${String.fromCharCode(0)}root`]).queryKey).not.toBe(base.queryKey);
    expect(create(['D:/a|b', `D:/nul${String.fromCharCode(0)}root`], 'D:/a\\b/file.ts', 201).queryKey).not.toBe(base.queryKey);
  });

  it('adds only the AbortSignal when converting the immutable snapshot to a load request', () => {
    const snapshot = createGitLogQuerySnapshot({
      getWorkspaceRoots: () => ['D:/repo'],
      getActiveFilePath: () => undefined,
      getMaxCommits: () => 200
    });
    const controller = new AbortController();

    expect(toGitLogLoadRequest(snapshot, controller.signal)).toEqual({
      workspaceRoots: [path.normalize('D:/repo')],
      activeFilePath: undefined,
      maxCommits: 200,
      signal: controller.signal
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.workspaceRoots)).toBe(true);
  });
});
