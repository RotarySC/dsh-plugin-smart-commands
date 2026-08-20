import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))

describe('profile bundle manifest', () => {
  it('declares dsh.bundle.patch and inserts the plugin by package name', async () => {
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
      name: string
      files: string[]
      exports: Record<string, unknown>
      dsh?: { bundle?: { patch?: string }; client?: { platform?: string } }
    }
    expect(pkg.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(pkg.dsh?.client?.platform).toBe('web')
    expect(pkg.files).toEqual(expect.arrayContaining(['dist', 'cordis.patch.yml']))
    expect(pkg.exports['./cordis.patch.yml']).toBe('./cordis.patch.yml')
    expect(pkg.exports['./client']).toBe('./dist/client.js')
    expect(pkg.exports['./typert']).toMatchObject({
      import: './dist/typert.host.js',
      default: './dist/typert.host.js',
    })
    expect(pkg.exports['./remote']).toMatchObject({
      import: './dist/typert.remote-client.js',
      default: './dist/typert.remote-client.js',
    })

    const patch = parseYaml(await readFile(join(root, 'cordis.patch.yml'), 'utf8'))
    expect(Array.isArray(patch)).toBe(true)
    const insert = (patch as Array<{ insert?: Array<{ id?: string; name?: string; inject?: unknown; config?: unknown }> }>)[0]?.insert
    expect(insert).toEqual([
      {
        id: 'smart-commands',
        name: pkg.name,
      },
    ])
    expect(insert?.[0]?.inject).toBeUndefined()
    expect(insert?.[0]?.config).toBeUndefined()
  })

  it('uses a plain insert that dshmarket hot-mount can parse', async () => {
    const text = await readFile(join(root, 'cordis.patch.yml'), 'utf8')
    const rows: Array<{ id: string; name: string }> = []
    let pending: string | null = null
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/#.*$/, '').trimEnd()
      if (line.trim() === '') continue
      if (/^-\s+insert:\s*$/.test(line)) continue
      const id = /^\s+-\s+id:\s*(\S+)\s*$/.exec(line)
      if (id !== null) {
        expect(pending).toBeNull()
        pending = id[1]!
        continue
      }
      const name = /^\s+name:\s*['"]?([^'"\s]+)['"]?\s*$/.exec(line)
      expect(name).not.toBeNull()
      expect(pending).not.toBeNull()
      rows.push({ id: pending!, name: name![1]! })
      pending = null
    }
    expect(pending).toBeNull()
    expect(rows).toEqual([
      { id: 'smart-commands', name: '@deepseek-ai/dsh-plugin-smart-commands' },
    ])
  })
})
