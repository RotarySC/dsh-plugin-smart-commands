import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { parseTemplateDocument, TemplateValidationError } from '../src/loader/frontmatter-parser.ts'
import { loadTemplates, TemplateLoader } from '../src/loader/template-loader.ts'

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
})
