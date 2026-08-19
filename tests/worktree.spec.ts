import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanupWorktrees, createWorktrees, diffWorktrees, formatWorktreeDiffSummary } from '../src/utils/worktree.ts'

function git(cwd: string, args: string[]): string {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`)
  }
  return result.stdout
}

describe('git worktree isolation', () => {
  const setups: Array<ReturnType<typeof createWorktrees>> = []
  afterEach(() => {
    for (const setup of setups) cleanupWorktrees(setup)
    setups.length = 0
  })

  it('extracts a patch from an isolated worktree and then removes it', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'smart-worktree-repo-'))
    git(repo, ['init'])
    git(repo, ['config', 'user.email', 'test@example.com'])
    git(repo, ['config', 'user.name', 'test'])
    await writeFile(join(repo, 'README.md'), 'base\n')
    git(repo, ['add', '.'])
    git(repo, ['commit', '-m', 'init'])

    const baseDir = await mkdtemp(join(tmpdir(), 'smart-worktree-base-'))
    const setup = createWorktrees(repo, 'run1', 1, baseDir)
    setups.push(setup)
    expect(setup.worktrees).toHaveLength(1)

    await writeFile(join(setup.worktrees[0]!.path, 'fix.txt'), 'isolated change\n')
    const diffsDir = join(baseDir, 'diffs')
    await mkdir(diffsDir, { recursive: true })
    const diffs = diffWorktrees(setup, ['fixer'], diffsDir)
    expect(diffs[0]?.filesChanged).toBeGreaterThan(0)
    expect(diffs[0]?.patch).toContain('isolated change')
    expect(formatWorktreeDiffSummary(diffs)).toContain('Worktree Changes')

    cleanupWorktrees(setup)
    setups.length = 0
    const remaining = git(repo, ['worktree', 'list'])
    expect(remaining).not.toContain('dsh-smart-worktree-run1-0')
  })
})
