import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildExportBundle,
  downloadBytes,
  downloadText,
  packTemplatesZip,
  parseImportPayload,
  unpackTemplatesZip,
} from '../src/client/bundle.ts'

describe('import/export payload', () => {
  it('uses the markdown filename stem as the template name', () => {
    expect(parseImportPayload('review.md', '---\ndescription: x\n---\nbody\n')).toEqual([
      { name: 'review', content: '---\ndescription: x\n---\nbody\n' },
    ])
  })

  it('round-trips a versioned JSON bundle', () => {
    const json = buildExportBundle([
      { name: 'review', origin: 'project', content: 'body' },
    ])
    expect(parseImportPayload('smart-commands.json', json)).toEqual([
      { name: 'review', origin: 'project', content: 'body' },
    ])
  })

  it('rejects an unsupported JSON document', () => {
    expect(() => parseImportPayload('x.json', '{"templates":[]}')).toThrow(/unsupported/)
  })

  it('packs selected templates as markdown files in a zip and unpacks them', () => {
    const zip = packTemplatesZip([
      { name: '001-research', origin: 'user', content: '---\ndescription: research\n---\nAsk $1\n' },
      { name: 'review/code', origin: 'project', content: '---\ndescription: review\n---\nReview $1\n' },
    ])
    expect(zip[0]).toBe(0x50)
    expect(zip[1]).toBe(0x4b)
    const unpacked = unpackTemplatesZip(zip)
    expect(unpacked).toEqual([
      { name: '001-research', origin: 'user', content: '---\ndescription: research\n---\nAsk $1\n' },
      { name: 'review/code', origin: 'project', content: '---\ndescription: review\n---\nReview $1\n' },
    ])
    expect(parseImportPayload('smart-commands.zip', zip)).toEqual(unpacked)
  })

  it('rejects an empty zip', () => {
    expect(() => packTemplatesZip([])).toThrow(/no templates/)
  })
})

describe('import file picker', () => {
  it('prefers the workspace that owns the current session', async () => {
    const { currentWorkspacePath } = await import('../src/client/workspace.ts')
    expect(currentWorkspacePath({
      workspaces: {
        list: {
          getSnapshot: () => ({
            items: [
              { workspaceId: 'a', path: 'C:/ws/homeish', sessionIds: ['s1'] },
              { workspaceId: 'b', path: 'C:/ws/dsh-plugin-smart-commands', sessionIds: ['s2'] },
            ],
            recentWorkspaceId: 'a',
          }),
        },
      },
      sessions: {
        list: {
          getSnapshot: () => ({ current: 's2' }),
        },
      },
    })).toBe('C:/ws/dsh-plugin-smart-commands')
  })

  it('keeps md, json, and zip files and replaces a same-named file', async () => {
    const { collectImportFiles, mergeImportSources } = await import('../src/client/import-files.ts')
    const review = { name: 'review.md', size: 12, lastModified: 1 }
    const zip = { name: 'pack.zip', size: 40, lastModified: 2 }
    const skip = { name: 'notes.txt', size: 8, lastModified: 3 }
    expect(collectImportFiles([review, zip, skip])).toEqual([review, zip])
    expect(mergeImportSources([review], [review, zip, { ...review, lastModified: 9 }])).toEqual([
      { ...review, lastModified: 9 },
      zip,
    ])
  })
})

describe('downloadText', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('clicks an attached anchor so the browser download is not a no-op', () => {
    const clicks: string[] = []
    const removed: string[] = []
    class FakeURL {
      static createObjectURL(): string {
        return 'blob:smart-commands'
      }
      static revokeObjectURL(): void {}
    }
    vi.stubGlobal('URL', FakeURL)
    vi.stubGlobal('Blob', class {
      constructor(_parts: unknown[], _options?: unknown) {}
    })
    const anchor = {
      href: '',
      download: '',
      rel: '',
      click() {
        clicks.push(this.download)
      },
      remove() {
        removed.push(this.download)
      },
    }
    const created: unknown[] = []
    vi.stubGlobal('document', {
      createElement(tag: string) {
        expect(tag).toBe('a')
        created.push(anchor)
        return anchor
      },
      body: {
        appendChild(node: unknown) {
          expect(node).toBe(anchor)
        },
      },
    })
    downloadText('smart-commands.json', '{"version":1}', 'application/json')
    expect(created).toHaveLength(1)
    expect(anchor.href).toBe('blob:smart-commands')
    expect(clicks).toEqual(['smart-commands.json'])
    expect(removed).toEqual(['smart-commands.json'])
  })
})
