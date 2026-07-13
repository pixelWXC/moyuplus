import { execFile } from 'node:child_process';
import path from 'node:path';
import { normalizeGitLogCommit, type GitLogCommit } from './gitLogModels';

export type GitLogErrorCode = 'noWorkspace' | 'notGitRepository' | 'gitUnavailable' | 'noCommits' | 'queryTimedOut' | 'queryFailed';

export class GitLogError extends Error {
  constructor(readonly code: GitLogErrorCode, message: string) {
    super(message);
    this.name = 'GitLogError';
  }
}

export interface GitCommandResult { stdout: string; stderr: string }
export interface GitCommandOptions { signal?: AbortSignal }
export interface GitCommandRunner {
  run(args: string[], options?: GitCommandOptions): Promise<GitCommandResult>;
}

export interface GitLogLoadRequest {
  workspaceRoots: string[];
  activeFilePath?: string;
  maxCommits: number;
  signal?: AbortSignal;
}

export interface GitLogResult {
  repositoryRoot: string;
  repositoryName: string;
  branchName: string;
  detached: boolean;
  commits: GitLogCommit[];
}

export class GitLogService {
  constructor(private readonly runner: GitCommandRunner = new ExecFileGitCommandRunner()) {}

  async load(request: GitLogLoadRequest): Promise<GitLogResult> {
    const candidates = candidateDirectories(request.activeFilePath, request.workspaceRoots);
    if (candidates.length === 0) throw new GitLogError('noWorkspace', 'No workspace is open.');
    const repositoryRoot = await this.findRepository(candidates, request.signal);
    if (!repositoryRoot) throw new GitLogError('notGitRepository', 'No Git repository is available in this workspace.');

    let branchName: string;
    let detached = false;
    try {
      branchName = (await this.runner.run(['-C', repositoryRoot, 'symbolic-ref', '--quiet', '--short', 'HEAD'], { signal: request.signal })).stdout.trim();
      if (!branchName) throw new Error('empty branch');
    } catch {
      detached = true;
      try {
        branchName = (await this.runner.run(['-C', repositoryRoot, 'rev-parse', '--short', 'HEAD'], { signal: request.signal })).stdout.trim();
      } catch (error) {
        throw mapRunnerError(error);
      }
    }

    const maxCommits = Math.round(Math.min(1000, Math.max(20, request.maxCommits)));
    let output: string;
    try {
      output = (await this.runner.run([
        '-C', repositoryRoot, '--no-pager', 'log', '--no-color', '-z',
        '--format=%H%x00%s%x00%an%x00%at', '-n', String(maxCommits), 'HEAD'
      ], { signal: request.signal })).stdout;
    } catch (error) {
      throw mapRunnerError(error);
    }
    if (output.length === 0) throw new GitLogError('noCommits', 'The current branch has no commits.');
    const commits = parseGitLogOutput(output);
    if (commits.length === 0) throw new GitLogError('noCommits', 'The current branch has no commits.');
    return { repositoryRoot, repositoryName: path.basename(repositoryRoot), branchName, detached, commits };
  }

  private async findRepository(candidates: string[], signal?: AbortSignal): Promise<string | undefined> {
    let unavailable = false;
    for (const candidate of candidates) {
      try {
        const root = (await this.runner.run(['-C', candidate, 'rev-parse', '--show-toplevel'], { signal })).stdout.trim();
        if (root) return path.normalize(root);
      } catch (error) {
        unavailable ||= isMissingExecutable(error);
      }
    }
    if (unavailable) throw new GitLogError('gitUnavailable', 'Git is not available.');
    return undefined;
  }
}

export function parseGitLogOutput(output: string): GitLogCommit[] {
  const fields = output.split('\0');
  while (fields.at(-1) === '') fields.pop();
  if (fields.length % 4 !== 0) throw new GitLogError('queryFailed', 'Git returned an invalid log record.');
  const commits: GitLogCommit[] = [];
  for (let index = 0; index < fields.length; index += 4) {
    const commit = normalizeGitLogCommit({
      hash: fields[index],
      subject: fields[index + 1] || '(无提交标题)',
      author: fields[index + 2] || '(未知作者)',
      authoredAt: Number(fields[index + 3])
    });
    if (!commit) throw new GitLogError('queryFailed', 'Git returned an invalid log record.');
    commits.push(commit);
  }
  return commits;
}

class ExecFileGitCommandRunner implements GitCommandRunner {
  run(args: string[], options: GitCommandOptions = {}): Promise<GitCommandResult> {
    return new Promise((resolve, reject) => {
      execFile('git', args, {
        encoding: 'utf8', windowsHide: true, timeout: 10_000, maxBuffer: 4 * 1024 * 1024,
        signal: options.signal
      }, (error, stdout, stderr) => {
        if (error) { reject(error); return; }
        resolve({ stdout, stderr });
      });
    });
  }
}

function candidateDirectories(activeFilePath: string | undefined, workspaceRoots: string[]): string[] {
  const values = [
    ...(activeFilePath ? [path.dirname(activeFilePath)] : []),
    ...workspaceRoots
  ].map(value => path.normalize(value));
  return [...new Set(values)];
}

function isMissingExecutable(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT';
}

function mapRunnerError(error: unknown): GitLogError {
  if (error instanceof GitLogError) return error;
  if (isMissingExecutable(error)) return new GitLogError('gitUnavailable', 'Git is not available.');
  if (typeof error === 'object' && error !== null && ((error as { killed?: unknown }).killed === true || (error as { code?: unknown }).code === 'ETIMEDOUT')) {
    return new GitLogError('queryTimedOut', 'Git log query timed out.');
  }
  return new GitLogError('queryFailed', 'Unable to read Git history.');
}
