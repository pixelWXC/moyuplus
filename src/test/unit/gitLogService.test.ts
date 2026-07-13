import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { GitLogError, GitLogService, parseGitLogOutput, type GitCommandRunner } from '../../git/gitLogService';

function runner(outputs: Array<string | Error>): GitCommandRunner & { run: ReturnType<typeof vi.fn> } {
  return {
    run: vi.fn(async () => {
      const output = outputs.shift();
      if (output instanceof Error) throw output;
      return { stdout: output ?? '', stderr: '' };
    })
  };
}

describe('GitLogService', () => {
  it('parses stable NUL-delimited commit fields without interpreting punctuation', () => {
    expect(parseGitLogOutput([
      'abc1234', 'Subject · with punctuation', '作者 Name', '50',
      'def5678', 'Second subject', 'Other', '75', ''
    ].join('\0'))).toEqual([
      { hash: 'abc1234', subject: 'Subject · with punctuation', author: '作者 Name', authoredAt: 50 },
      { hash: 'def5678', subject: 'Second subject', author: 'Other', authoredAt: 75 }
    ]);
    expect(() => parseGitLogOutput('abc\0incomplete')).toThrowError(GitLogError);
  });

  it('queries only HEAD with bounded arguments and reports the selected branch', async () => {
    const target = runner([
      'D:/repo\n',
      'feature/git-log\n',
      ['abc1234', 'Ship it', 'Purvar', '50', ''].join('\0')
    ]);
    const service = new GitLogService(target);

    await expect(service.load({ workspaceRoots: ['D:/repo'], maxCommits: 200 })).resolves.toEqual({
      repositoryRoot: path.normalize('D:/repo'),
      repositoryName: 'repo',
      branchName: 'feature/git-log',
      detached: false,
      commits: [{ hash: 'abc1234', subject: 'Ship it', author: 'Purvar', authoredAt: 50 }]
    });

    expect(target.run.mock.calls[2][0]).toEqual(expect.arrayContaining([
      '-C', path.normalize('D:/repo'), '--no-pager', 'log', '--no-color', '-z', '-n', '200', 'HEAD'
    ]));
    expect(target.run.mock.calls[2][0]).not.toContain('--all');
  });

  it('tries the active editor folder before workspace roots and supports detached HEAD', async () => {
    const target = runner([
      'D:/workspace/nested\n',
      new Error('detached'),
      'abc1234\n',
      ['abc1234', 'Ship it', 'Purvar', '50', ''].join('\0')
    ]);
    const service = new GitLogService(target);
    const result = await service.load({
      workspaceRoots: ['D:/workspace'],
      activeFilePath: 'D:/workspace/nested/src/index.ts',
      maxCommits: 20
    });

    expect(target.run.mock.calls[0][0]).toEqual(['-C', path.normalize('D:/workspace/nested/src'), 'rev-parse', '--show-toplevel']);
    expect(result).toMatchObject({ branchName: 'abc1234', detached: true });
  });

  it('returns stable errors for missing repositories and empty history', async () => {
    const missing = new GitLogService(runner([new Error('not a repository')]));
    await expect(missing.load({ workspaceRoots: ['D:/plain'], maxCommits: 20 })).rejects.toMatchObject({ code: 'notGitRepository' });

    const empty = new GitLogService(runner(['D:/repo\n', 'main\n', '']));
    await expect(empty.load({ workspaceRoots: ['D:/repo'], maxCommits: 20 })).rejects.toMatchObject({ code: 'noCommits' });
  });
});
