import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { parseTemplateDocument, TemplateValidationError } from '../src/loader/frontmatter-parser.ts'
import {
  loadTemplates,
  pickWorkspaceRoot,
  resolveTemplateDirectories,
  sameTemplateDirectory,
  TemplateLoader,
} from '../src/loader/template-loader.ts'

const reviewTemplate = `---
description: Review a file
model: deepseek-reasoner, deepseek-chat
restore: true
---
Review $1
`

const projectOverride = `---
description: Project-level review
model: deepseek-chat
---
Project review $1
`

const invalidTemplate = `---
model: deepseek-chat
---
missing description
`

describe('frontmatter parser', () => {
  it('parses required description and optional chain steps', () => {
    const parsed = parseTemplateDocument(`---
description: Scan then fix
chain:
  - name: scan
    agent: scout
    task: "scan $1"
    as: findings
  - name: fix
    parallel:
      - agent: backend
        task: "fix {outputs.findings}"
    concurrency: 2
---
`)
    expect(parsed.frontmatter.description).toBe('Scan then fix')
    expect(parsed.frontmatter.chain).toHaveLength(2)
    expect(parsed.frontmatter.chain?.[1]).toMatchObject({ name: 'fix', concurrency: 2 })
  })

  it('accepts the shipped example templates', async () => {
    const examplesDir = fileURLToPath(new URL('../examples', import.meta.url))
    for (const name of ['refactor-module.md', 'code-review.md', 'vuln-scan-and-fix.md', 'continuable-chat.md']) {
      const content = await readFile(join(examplesDir, name), 'utf8')
      expect(() => parseTemplateDocument(content)).not.toThrow()
    }
  })

  it('accepts continuable as a dedicated field or as subagent: continuable', () => {
    const viaField = parseTemplateDocument(`---
description: Keep chatting
continuable: true
---
body
`)
    expect(viaField.frontmatter.continuable).toBe(true)
    const viaSubagent = parseTemplateDocument(`---
description: Keep chatting
subagent: continuable
---
body
`)
    expect(viaSubagent.frontmatter.continuable).toBe(true)
    expect(viaSubagent.frontmatter.subagent).toBe('continuable')
  })

  it('rejects unknown frontmatter fields at compile time', () => {
    expect(() => parseTemplateDocument(`---
description: x
unknown: true
---
body
`)).toThrow(TemplateValidationError)
  })
})

describe('template loader', () => {
  const loaders: TemplateLoader[] = []
  afterEach(() => {
    for (const loader of loaders) loader.stopWatching()
    loaders.length = 0
  })

  it('lets a project template override a user template of the same name', async () => {
    const root = await mkdtemp(join(tmpdir(), 'smart-commands-'))
    const userDir = join(root, 'user')
    const projectDir = join(root, 'project')
    await mkdir(userDir, { recursive: true })
    await mkdir(projectDir, { recursive: true })
    await writeFile(join(userDir, 'review.md'), reviewTemplate)
    await writeFile(join(projectDir, 'review.md'), projectOverride)
    await writeFile(join(userDir, 'broken.md'), invalidTemplate)

    const catalog = await loadTemplates({ userDir, projectDir })
    const review = catalog.templates.find(item => item.name === 'review')
    expect(review?.origin).toBe('project')
    expect(review?.description).toBe('Project-level review')
    expect(review?.models).toEqual(['deepseek-chat'])
    expect(catalog.errors.some(error => error.path.endsWith('broken.md'))).toBe(true)
  })

  it('keeps both origins in the inventory when a project template overrides a user one', async () => {
    const root = await mkdtemp(join(tmpdir(), 'smart-commands-inventory-'))
    const userDir = join(root, 'user')
    const projectDir = join(root, 'project')
    await mkdir(userDir, { recursive: true })
    await mkdir(projectDir, { recursive: true })
    await writeFile(join(userDir, 'review.md'), reviewTemplate)
    await writeFile(join(projectDir, 'review.md'), projectOverride)
    const loader = new TemplateLoader({ userDir, projectDir })
    loaders.push(loader)
    await loader.reload()
    expect(loader.inventory.templates.map(item => `${item.origin}:${item.name}`).sort()).toEqual([
      'project:review',
      'user:review',
    ])
    expect(loader.get('review')?.origin).toBe('project')
    expect(loader.inventory.templates.find(item => item.origin === 'project')?.sourceLabel).toBe(basename(root))
    expect(loader.inventory.templates.find(item => item.origin === 'user')?.sourceLabel).toBe('user')
  })

  it('does not list the same file as both user and project when the directories collapse', async () => {
    const root = await mkdtemp(join(tmpdir(), 'smart-commands-overlap-'))
    const sharedDir = join(root, 'commands')
    await mkdir(sharedDir, { recursive: true })
    await writeFile(join(sharedDir, 'tel.md'), reviewTemplate)
    const loader = new TemplateLoader({ userDir: sharedDir, projectDir: sharedDir })
    loaders.push(loader)
    await loader.reload()
    expect(loader.inventory.templates.map(item => `${item.origin}:${item.name}`)).toEqual(['user:tel'])
    expect(loader.get('tel')?.origin).toBe('user')
  })

  it('collapses default user and project dirs when workspaceRoot is the home directory', () => {
    const home = homedir()
    const dirs = resolveTemplateDirectories(home, '~/.dsh/commands', '.dsh/commands', home)
    expect(sameTemplateDirectory(dirs.userDir, dirs.projectDir)).toBe(true)
  })

  it('keeps default user and project dirs distinct for a project workspace', () => {
    const home = homedir()
    const dirs = resolveTemplateDirectories(join(home, 'projects', 'app'), '~/.dsh/commands', '.dsh/commands', home)
    expect(sameTemplateDirectory(dirs.userDir, dirs.projectDir)).toBe(false)
  })

  it('picks a workspace whose project catalog is distinct from the user catalog', () => {
    const home = homedir()
    const selected = pickWorkspaceRoot([home, join(home, 'projects', 'dsh-plugin-smart-commands')], home)
    expect(selected).toBe(join(home, 'projects', 'dsh-plugin-smart-commands'))
  })

  it('writes a project template after retargeting to a selected workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'smart-commands-retarget-'))
    const userDir = join(root, 'user')
    const firstProject = join(root, 'first', '.dsh', 'commands')
    const secondWorkspace = join(root, 'second')
    await mkdir(userDir, { recursive: true })
    const loader = new TemplateLoader({ userDir, projectDir: firstProject })
    loaders.push(loader)
    await loader.reload()
    loader.retargetProject(secondWorkspace)
    await loader.writeTemplate('review', reviewTemplate, 'project')
    expect(await loader.templateExists('review', 'project')).toBe(true)
    expect(await readFile(join(secondWorkspace, '.dsh', 'commands', 'review.md'), 'utf8')).toContain('Review a file')
    expect(await loader.templateExists('review', 'user')).toBe(false)
    expect(loader.inventory.templates.find(item => item.origin === 'project')?.sourceLabel).toBe('second')
  })

  it('refuses a project write when user and project directories collapse', async () => {
    const root = await mkdtemp(join(tmpdir(), 'smart-commands-collapse-write-'))
    const sharedDir = join(root, 'commands')
    await mkdir(sharedDir, { recursive: true })
    const loader = new TemplateLoader({ userDir: sharedDir, projectDir: sharedDir })
    loaders.push(loader)
    await expect(loader.writeTemplate('review', reviewTemplate, 'project')).rejects.toThrow(/not distinct/)
  })

  it('rejects a chain that references an output before it is produced', () => {
    expect(() => parseTemplateDocument(`---
description: bad chain
chain:
  - name: fix
    task: "use {outputs.findings}"
  - name: scan
    task: scan
    as: findings
---
`)).toThrow(/Unknown chain output reference/)
  })

  it('writes a project template through manage and reloads the catalog', async () => {
    const root = await mkdtemp(join(tmpdir(), 'smart-commands-manage-'))
    const loader = new TemplateLoader({ userDir: join(root, 'user'), projectDir: join(root, 'project') })
    loaders.push(loader)
    await loader.reload()
    await loader.writeProjectTemplate('refactor', reviewTemplate)
    expect(loader.get('refactor')?.description).toBe('Review a file')
  })

  it('writes and deletes a user-origin template without touching the project layer', async () => {
    const root = await mkdtemp(join(tmpdir(), 'smart-commands-user-write-'))
    const loader = new TemplateLoader({ userDir: join(root, 'user'), projectDir: join(root, 'project') })
    loaders.push(loader)
    await loader.reload()
    await loader.writeTemplate('review', reviewTemplate, 'user')
    expect(await loader.templateExists('review', 'user')).toBe(true)
    expect(await loader.templateExists('review', 'project')).toBe(false)
    await loader.deleteTemplate('review', 'user')
    expect(await loader.templateExists('review', 'user')).toBe(false)
  })
})
