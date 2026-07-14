import type { GitLogLoadRequest } from './gitLogService';
import path from 'node:path';
import { normalizeGitLogMaxCommits } from './gitLogModels';

export interface GitLogQuerySource {
  getWorkspaceRoots(): readonly string[];
  getActiveFilePath(): string | undefined;
  getMaxCommits(): number;
}

export interface GitLogQuerySnapshot {
  readonly workspaceRoots: readonly string[];
  readonly activeFilePath?: string;
  readonly maxCommits: number;
  readonly queryKey: string;
}

export function createGitLogQuerySnapshot(source: GitLogQuerySource): GitLogQuerySnapshot {
  const workspaceRoots = Object.freeze(source.getWorkspaceRoots().map(root => path.normalize(root)));
  const activeFilePathValue = source.getActiveFilePath();
  const activeFilePath = activeFilePathValue === undefined ? undefined : path.normalize(activeFilePathValue);
  const maxCommits = normalizeGitLogMaxCommits(source.getMaxCommits());
  return Object.freeze({
    workspaceRoots,
    activeFilePath,
    maxCommits,
    queryKey: JSON.stringify([workspaceRoots, activeFilePath ?? null, maxCommits])
  });
}

export function toGitLogLoadRequest(snapshot: GitLogQuerySnapshot, signal: AbortSignal): GitLogLoadRequest {
  return {
    workspaceRoots: [...snapshot.workspaceRoots],
    activeFilePath: snapshot.activeFilePath,
    maxCommits: snapshot.maxCommits,
    signal
  };
}
