import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface WorktreeInfo {
  readonly path: string
  readonly branch: string
  readonly index: number
}

export interface WorktreeSetup {
  readonly cwd: string
  readonly worktrees: WorktreeInfo[]
  readonly baseCommit: string
}

export interface WorktreeDiff {
  readonly index: number
  readonly agent: string
  readonly branch: string
  readonly filesChanged: number
  readonly insertions: number
  readonly deletions: number
  readonly patchPath: string
  readonly patch: string
}

interface GitResult {
  stdout: string
  stderr: string
  status: number | null
}

function runGit(cwd: string, args: string[]): GitResult {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status,
  }
}

function runGitChecked(cwd: string, args: string[]): string {
  const result = runGit(cwd, args)
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `git ${args.join(' ')} failed`)
  }
  return result.stdout
}

export function createWorktrees(cwd: string, runId: string, count: number, baseDir = tmpdir()): WorktreeSetup {
  const repoCheck = runGit(cwd, ['rev-parse', '--is-inside-work-tree'])
  if (repoCheck.status !== 0 || repoCheck.stdout.trim() !== 'true') {
    throw new Error('worktree isolation requires a git repository')
  }
  const status = runGitChecked(cwd, ['status', '--porcelain'])
  if (status.trim().length > 0) {
    throw new Error('worktree isolation requires a clean git working tree. Commit or stash changes first.')
  }
  const toplevel = runGitChecked(cwd, ['rev-parse', '--show-toplevel']).trim()
  const baseCommit = runGitChecked(toplevel, ['rev-parse', 'HEAD']).trim()
  const worktrees: WorktreeInfo[] = []
  try {
    for (let index = 0; index < count; index++) {
      const branch = `dsh-smart-${runId}-${index}`
      const path = join(baseDir, `dsh-smart-worktree-${runId}-${index}`)
      runGitChecked(toplevel, ['worktree', 'add', path, '-b', branch, 'HEAD'])
      worktrees.push({ path, branch, index })
    }
  } catch (error) {
    cleanupWorktrees({ cwd: toplevel, worktrees, baseCommit })
    throw error
  }
  return { cwd: toplevel, worktrees, baseCommit }
}

function parseNumstat(numstat: string): { filesChanged: number; insertions: number; deletions: number } {
  let filesChanged = 0
  let insertions = 0
  let deletions = 0
  for (const line of numstat.split('\n').map(item => item.trim()).filter(Boolean)) {
    const [rawInsertions, rawDeletions] = line.split('\t')
    if (rawInsertions === undefined || rawDeletions === undefined) continue
    filesChanged++
    if (/^\d+$/.test(rawInsertions)) insertions += Number.parseInt(rawInsertions, 10)
    if (/^\d+$/.test(rawDeletions)) deletions += Number.parseInt(rawDeletions, 10)
  }
  return { filesChanged, insertions, deletions }
}

export function diffWorktrees(setup: WorktreeSetup, agents: string[], diffsDir: string): WorktreeDiff[] {
  mkdirSync(diffsDir, { recursive: true })
  return setup.worktrees.map((worktree, index) => {
    const agent = agents[index] ?? `task-${index + 1}`
    const patchPath = join(diffsDir, `task-${index}-${agent.replace(/[^\w.-]/g, '_')}.patch`)
    runGitChecked(worktree.path, ['add', '-A'])
    const patch = runGitChecked(worktree.path, ['diff', '--cached', setup.baseCommit])
    const numstat = runGitChecked(worktree.path, ['diff', '--cached', '--numstat', setup.baseCommit])
    writeFileSync(patchPath, patch, 'utf8')
    const parsed = parseNumstat(numstat)
    return {
      index,
      agent,
      branch: worktree.branch,
      filesChanged: parsed.filesChanged,
      insertions: parsed.insertions,
      deletions: parsed.deletions,
      patchPath,
      patch,
    }
  })
}

export function cleanupWorktrees(setup: WorktreeSetup): void {
  for (const worktree of [...setup.worktrees].reverse()) {
    try { runGitChecked(setup.cwd, ['worktree', 'remove', '--force', worktree.path]) } catch { /* best-effort */ }
    try { runGitChecked(setup.cwd, ['branch', '-D', worktree.branch]) } catch { /* best-effort */ }
  }
  try { runGitChecked(setup.cwd, ['worktree', 'prune']) } catch { /* best-effort */ }
}

export function formatWorktreeDiffSummary(diffs: WorktreeDiff[]): string {
  const changed = diffs.filter(diff => diff.filesChanged > 0 || diff.patch.trim().length > 0)
  if (changed.length === 0) return ''
  const lines = ['=== Worktree Changes ===', '']
  for (const diff of changed) {
    lines.push(`--- Task ${diff.index + 1} (${diff.agent}): ${diff.filesChanged} files changed, +${diff.insertions} -${diff.deletions} ---`)
    lines.push('')
  }
  lines.push(`Full patches: ${diffsDirOf(changed[0]!.patchPath)}`)
  return lines.join('\n').trimEnd()
}

function diffsDirOf(patchPath: string): string {
  return patchPath.replace(/[\\/][^\\/]+$/, '')
}
