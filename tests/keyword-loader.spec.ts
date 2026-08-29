import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { KeywordLoader, parseKeywordDocument, resolveKeywordPaths } from '../src/loader/keyword-loader.ts'

describe('keyword loader and parser', () => {
  const cleanups: string[] = []

  afterEach(async () => {
    while (cleanups.length > 0) {
      const dir = cleanups.pop()
      if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  })

  async function createFixture() {
    const root = await mkdtemp(join(tmpdir(), 'dsh-keywords-test-'))
    cleanups.push(root)
    const homeDir = join(root, 'user-home')
    const workspaceDir = join(root, 'project-ws')
    await mkdir(homeDir, { recursive: true })
    await mkdir(workspaceDir, { recursive: true })
    return { root, homeDir, workspaceDir }
  }

  it('parses valid keywords document format', () => {
    const raw = JSON.stringify({
      version: 1,
      categories: [
        {
          id: 'modules',
          name: 'Modules',
          description: 'Source modules',
          keywords: ['src/engine', 'src/loader'],
        },
      ],
    })
    const doc = parseKeywordDocument(raw)
    expect(doc.version).toBe(1)
    expect(doc.categories).toHaveLength(1)
    expect(doc.categories[0]?.id).toBe('modules')
    expect(doc.categories[0]?.keywords).toEqual(['src/engine', 'src/loader'])
  })

  it('returns default categories when both user and project files are absent', async () => {
    const { homeDir, workspaceDir } = await createFixture()
    const loader = new KeywordLoader(workspaceDir, homeDir)
    const inventory = await loader.loadInventory(workspaceDir)
    expect(inventory.categories.length).toBeGreaterThan(0)
    expect(inventory.categories[0]?.origin).toBe('user')
    expect(inventory.errors).toEqual([])
  })

  it('loads and merges user and project categories correctly', async () => {
    const { homeDir, workspaceDir } = await createFixture()
    const paths = resolveKeywordPaths(workspaceDir, homeDir)
    await mkdir(paths.userDir, { recursive: true })
    await mkdir(paths.projectDir, { recursive: true })

    await writeFile(paths.userFile, JSON.stringify({
      version: 1,
      categories: [{ id: 'user-cat', name: 'User Cat', keywords: ['--user-flag'] }],
    }))

    await writeFile(paths.projectFile, JSON.stringify({
      version: 1,
      categories: [{ id: 'proj-cat', name: 'Project Cat', keywords: ['--proj-flag'] }],
    }))

    const loader = new KeywordLoader(workspaceDir, homeDir)
    const inventory = await loader.loadInventory(workspaceDir)

    expect(inventory.categories).toHaveLength(2)
    const userItem = inventory.categories.find(c => c.id === 'user-cat')
    const projItem = inventory.categories.find(c => c.id === 'proj-cat')

    expect(userItem?.origin).toBe('user')
    expect(userItem?.keywords).toEqual(['--user-flag'])
    expect(projItem?.origin).toBe('project')
    expect(projItem?.keywords).toEqual(['--proj-flag'])
  })

  it('writes categories to user or project layer correctly', async () => {
    const { homeDir, workspaceDir } = await createFixture()
    const loader = new KeywordLoader(workspaceDir, homeDir)

    const writeRes = await loader.writeCategories('project', [
      { id: 'custom-proj', name: 'Custom Proj', keywords: ['--test-1', '--test-2'] },
    ], workspaceDir)

    expect(writeRes.ok).toBe(true)
    expect(writeRes.origin).toBe('project')

    const inventory = await loader.loadInventory(workspaceDir)
    const found = inventory.categories.find(c => c.id === 'custom-proj')
    expect(found).toBeDefined()
    expect(found?.origin).toBe('project')
    expect(found?.keywords).toEqual(['--test-1', '--test-2'])
  })
})
