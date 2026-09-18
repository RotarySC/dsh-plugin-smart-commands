import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SmartCommandsCatalogApi } from '../src/remote/catalog-api.ts'
import { SmartCommandsGateway } from '../src/remote/gateway.ts'
import { ChainRunRegistry } from '../src/engine/run-registry.ts'
import { TemplateLoader } from '../src/loader/template-loader.ts'

const review = `---
description: Review a file
model: deepseek-chat
---
Review $1
`

const chat = `---
description: Keep chatting
subagent: continuable
---
Talk about $@
`

describe('catalog api', () => {
  const loaders: TemplateLoader[] = []
  afterEach(() => {
    for (const loader of loaders) loader.stopWatching()
    loaders.length = 0
  })

  async function workspace(): Promise<{ api: SmartCommandsCatalogApi; root: string }> {
    const root = await mkdtemp(join(tmpdir(), 'smart-catalog-api-'))
    const userDir = join(root, 'user')
    const projectDir = join(root, 'project')
    await mkdir(userDir, { recursive: true })
    await mkdir(projectDir, { recursive: true })
    await writeFile(join(userDir, 'review.md'), review)
    const loader = new TemplateLoader({ userDir, projectDir })
    loaders.push(loader)
    await loader.reload()
    return { api: new SmartCommandsCatalogApi(loader), root }
  }

  it('lists a shared user/project directory only once as user', async () => {
    const root = await mkdtemp(join(tmpdir(), 'smart-catalog-overlap-'))
    const sharedDir = join(root, 'commands')
    await mkdir(sharedDir, { recursive: true })
    await writeFile(join(sharedDir, 'review.md'), review)
    const loader = new TemplateLoader({ userDir: sharedDir, projectDir: sharedDir })
    loaders.push(loader)
    await loader.reload()
    const listed = await new SmartCommandsCatalogApi(loader).list()
    expect(listed.templates.map(item => `${item.origin}:${item.name}`)).toEqual(['user:review'])
  })

  it('lists both origins and writes to the requested layer', async () => {
    const { api } = await workspace()
    const listed = await api.list()
    expect(listed.templates.map(item => `${item.origin}:${item.name}`)).toEqual(['user:review'])

    const created = await api.write({
      name: 'review',
      origin: 'project',
      content: review.replace('Review a file', 'Project review'),
      mode: 'create',
    })
    expect(created.ok).toBe(true)
    const after = await api.list()
    expect(after.templates).toHaveLength(2)
    expect(after.templates.filter(item => item.name === 'review').map(item => item.origin).sort()).toEqual(['project', 'user'])
  })

  it('writes a project template into the workspace sent by the settings UI', async () => {
    const home = await mkdtemp(join(tmpdir(), 'smart-catalog-home-'))
    const selected = await mkdtemp(join(tmpdir(), 'smart-catalog-selected-'))
    const userDir = join(home, '.dsh', 'commands')
    await mkdir(userDir, { recursive: true })
    const loader = new TemplateLoader({
      userDir,
      projectDir: join(home, '.dsh', 'commands'),
    })
    loaders.push(loader)
    await loader.reload()
    const api = new SmartCommandsCatalogApi(loader)
    const created = await api.write({
      name: 'review',
      origin: 'project',
      content: review,
      mode: 'create',
      workspaceRoot: selected,
    })
    expect(created.ok).toBe(true)
    expect(await loader.templateExists('review', 'project')).toBe(true)
    const listed = await api.list({ workspaceRoot: selected })
    expect(listed.templates.map(item => `${item.origin}:${item.name}`)).toEqual(['project:review'])
  })

  it('copies across layers and refuses a colliding destination', async () => {
    const { api } = await workspace()
    const copied = await api.copy({
      fromName: 'review',
      fromOrigin: 'user',
      toName: 'chat',
      toOrigin: 'project',
    })
    expect(copied.ok).toBe(true)
    const again = await api.copy({
      fromName: 'review',
      fromOrigin: 'user',
      toName: 'chat',
      toOrigin: 'project',
    })
    expect(again).toMatchObject({ ok: false, error: expect.stringContaining('already exists') })
  })

  it('reads and copies numbered templates that the loader already listed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'smart-catalog-numbered-'))
    const userDir = join(root, 'user')
    const projectDir = join(root, 'project')
    await mkdir(userDir, { recursive: true })
    await mkdir(projectDir, { recursive: true })
    await writeFile(join(userDir, '001-research.md'), review)
    const loader = new TemplateLoader({ userDir, projectDir })
    loaders.push(loader)
    await loader.reload()
    expect(loader.inventory.templates.map(item => item.name)).toEqual(['001-research'])
    const api = new SmartCommandsCatalogApi(loader)
    const document = await api.read({ name: '001-research', origin: 'user' })
    expect(document.content).toContain('Review $1')
    const copied = await api.copy({
      fromName: '001-research',
      fromOrigin: 'user',
      toName: '001-research-copy',
      toOrigin: 'user',
    })
    expect(copied).toEqual({ ok: true, name: '001-research-copy', origin: 'user' })
    const listed = await api.list()
    expect(listed.templates.map(item => item.name).sort()).toEqual(['001-research', '001-research-copy'])
  })

  it('rejects an invalid name and oversize content', async () => {
    const { api } = await workspace()
    const invalid = await api.write({ name: '../escape', origin: 'user', content: review, mode: 'create' })
    expect(invalid.ok).toBe(false)
    const huge = await api.write({
      name: 'huge',
      origin: 'user',
      content: `${review}${'x'.repeat(300_000)}`,
      mode: 'create',
    })
    expect(huge.ok).toBe(false)
  })

  it('reads and deletes only the requested origin', async () => {
    const { api } = await workspace()
    await api.write({ name: 'chat', origin: 'project', content: chat, mode: 'create' })
    const document = await api.read({ name: 'chat', origin: 'project' })
    expect(document.isSubagent).toBe(true)
    expect(document.content).toContain('Talk about')
    const removed = await api.remove({ name: 'chat', origin: 'project' })
    expect(removed.ok).toBe(true)
    const listed = await api.list()
    expect(listed.templates.some(item => item.name === 'chat')).toBe(false)
  })

  it('serves catalog methods after Cordis Service construction', async () => {
    const { root } = await workspace()
    const loader = new TemplateLoader({
      userDir: join(root, 'user'),
      projectDir: join(root, 'project'),
    })
    await loader.reload()
    const ctx = {
      reflect: {
        provide() {
          return () => undefined
        },
      },
    }
    const gateway = new SmartCommandsGateway(ctx as never, loader, new ChainRunRegistry())
    const listed = await gateway.list()
    expect(listed.templates.some(item => item.name === 'review')).toBe(true)
  })
})
