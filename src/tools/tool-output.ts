import type { HostToolContentBlock, HostToolOutput } from '../types/host.js'

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function textBlocks(...lines: Array<string | undefined>): HostToolContentBlock[] {
  return [{ type: 'text', text: lines.filter(Boolean).join('\n') }]
}

export function jsonObjectSchema(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    ...required.length > 0 ? { required } : {},
    properties,
  }
}

export function stringField(description?: string): Record<string, unknown> {
  return {
    type: 'string',
    ...description ? { description } : {},
  }
}

export function integerField(description?: string): Record<string, unknown> {
  return {
    type: 'integer',
    ...description ? { description } : {},
  }
}

export function booleanField(description?: string): Record<string, unknown> {
  return {
    type: 'boolean',
    ...description ? { description } : {},
  }
}

export function renderOkOrError(value: unknown, okText: (record: Record<string, unknown>) => string): HostToolContentBlock[] {
  const record = asRecord(value)
  if (!record) return textBlocks(String(value))
  if (record.ok === false) {
    const error = typeof record.error === 'string' ? record.error : 'unknown error'
    const hint = typeof record.hint === 'string' ? `hint: ${record.hint}` : undefined
    return textBlocks(error, hint)
  }
  return textBlocks(okText(record))
}

export function objectOutput(
  schema: Record<string, unknown>,
  render: HostToolOutput['render'],
): HostToolOutput {
  return { schema, render }
}
