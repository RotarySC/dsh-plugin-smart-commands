import { describe, expect, it } from 'vitest'
import { TYPERT_REMOTE as CLIENT_TYPERT_REMOTE } from '../src/client/remote-contribution.ts'
import { SMART_COMMANDS_ENDPOINTS } from '../src/remote/contract.ts'
import { TYPERT } from '../src/typert.host.ts'
import { TYPERT_REMOTE } from '../src/typert.remote-client.ts'

const CATALOG_SCOPE = '@deepseek-ai/dsh-plugin-smart-commands/types#CatalogScope'

function listParametersOf(parameters: readonly {
  name: string
  wire: string
  source: string
  codec: { mode: string; typeSymbol: string; schema: { parse(value: unknown): unknown } }
}[]) {
  expect(parameters).toHaveLength(1)
  expect(parameters[0]).toMatchObject({
    name: 'request',
    wire: 'request',
    source: 'json',
    codec: { mode: 'strict', typeSymbol: CATALOG_SCOPE },
  })
  return parameters[0].codec.schema
}

describe('typert artifacts', () => {
  it('exports a host manifest typert-loader will accept', () => {
    expect(TYPERT.package).toBe('@deepseek-ai/dsh-plugin-smart-commands')
    expect(TYPERT.face).toBe('host')
    expect(Array.isArray(TYPERT.schemas)).toBe(true)
    // Derived from the contract, not hard-coded: adding an endpoint to
    // SMART_COMMANDS_ENDPOINTS must never require editing this assertion.
    expect(TYPERT.invocations.map(item => item.method)).toEqual(
      SMART_COMMANDS_ENDPOINTS.map(item => item.method),
    )
    for (const invocation of TYPERT.invocations) {
      expect(invocation.result.schema).toMatchObject({ parse: expect.any(Function) })
      expect('_zod' in invocation.result.schema).toBe(true)
      for (const parameter of invocation.parameters) {
        expect('_zod' in parameter.codec.schema).toBe(true)
      }
    }
  })

  it('exports a client remote contribution with the same endpoints', () => {
    expect(TYPERT_REMOTE.package).toBe(TYPERT.package)
    expect(CLIENT_TYPERT_REMOTE.package).toBe(TYPERT.package)
    const wireOf = (item: {
      id: string
      method: string
      parameters: readonly { codec: { typeSymbol: string } }[]
      result: { typeSymbol: string }
    }) => ({
      id: item.id,
      method: item.method,
      request: item.parameters[0]?.codec.typeSymbol,
      result: item.result.typeSymbol,
    })
    expect(TYPERT_REMOTE.descriptors.map(wireOf)).toEqual(TYPERT.invocations.map(wireOf))
    expect(CLIENT_TYPERT_REMOTE.descriptors.map(wireOf)).toEqual(TYPERT.invocations.map(wireOf))
    expect(TYPERT.invocations.find(item => item.method === 'deleteTemplate')?.implementation).toBe('remove')
    expect(TYPERT_REMOTE.descriptors.find(item => item.method === 'deleteTemplate')?.implementation).toBeUndefined()
    expect(CLIENT_TYPERT_REMOTE.descriptors.find(item => item.method === 'deleteTemplate')?.implementation).toBeUndefined()
  })

  it('accepts the settings workspaceRoot on list for host, public remote, and client $mount', () => {
    const host = listParametersOf(TYPERT.invocations.find(item => item.method === 'list')!.parameters)
    const remote = listParametersOf(TYPERT_REMOTE.descriptors.find(item => item.method === 'list')!.parameters)
    const client = listParametersOf(CLIENT_TYPERT_REMOTE.descriptors.find(item => item.method === 'list')!.parameters)
    const request = { workspaceRoot: 'C:/ws/dsh-plugin-smart-commands' }
    expect(host.parse(request)).toEqual(request)
    expect(remote.parse(request)).toEqual(request)
    expect(client.parse(request)).toEqual(request)
    expect(remote.parse({})).toEqual({})
    expect(client.parse({})).toEqual({})
  })
})
