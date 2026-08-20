import type { ModelRef, ModelRegistry, ModelSession } from '../types/host.js'

export interface SelectedModel {
  readonly spec: string
  readonly model: ModelRef
  readonly alreadyActive: boolean
}

function sameModel(a: ModelRef | undefined, b: ModelRef | undefined): boolean {
  if (!a || !b) return a === b
  return a.id === b.id && (a.provider ?? undefined) === (b.provider ?? undefined)
}

function modelId(model: ModelRef): string {
  return model.provider ? `${model.provider}/${model.id}` : model.id
}

export function parseModelRef(raw: string): ModelRef {
  const slash = raw.indexOf('/')
  if (slash > 0 && slash < raw.length - 1) {
    return { provider: raw.slice(0, slash), id: raw.slice(slash + 1) }
  }
  return { id: raw }
}

function candidatesForSpec(spec: string, available: readonly ModelRef[]): ModelRef[] {
  const slash = spec.indexOf('/')
  if (slash !== -1 && !spec.endsWith('/*')) {
    const provider = spec.slice(0, slash)
    const id = spec.slice(slash + 1)
    return available.filter(model =>
      (model.provider === provider && model.id === id)
      || modelId(model) === spec
      || model.id === spec
      || model.id === id)
  }
  if (spec.endsWith('/*')) {
    const provider = spec.slice(0, -2)
    return available.filter(model =>
      model.provider === provider
      || model.id.startsWith(`${provider}/`)
      || modelId(model).startsWith(`${provider}/`))
  }
  return available.filter(model =>
    model.id === spec
    || modelId(model) === spec
    || model.id.endsWith(`/${spec}`))
}

export function selectModel(
  specs: string[],
  registry: ModelRegistry | undefined,
): SelectedModel | undefined {
  const current = registry?.current
  const available = registry?.available ?? []
  if (specs.length === 0) {
    if (!current) return undefined
    return { spec: current.id, model: current, alreadyActive: true }
  }
  const pool = current && !available.some(model => sameModel(model, current))
    ? [current, ...available]
    : available
  for (const spec of specs) {
    const match = candidatesForSpec(spec, pool)[0]
    if (match) return { spec, model: match, alreadyActive: sameModel(match, current) }
  }
  if (current) {
    return { spec: specs[0] ?? current.id, model: current, alreadyActive: true }
  }
  return undefined
}

export function formatModel(model: ModelRef): string {
  return model.provider ? `${model.provider}/${model.id}` : model.id
}

export async function withModelOverride<T>(
  session: ModelSession | undefined,
  target: SelectedModel | undefined,
  shouldRestore: boolean,
  action: () => Promise<T>,
): Promise<T> {
  if (!session || !target || target.alreadyActive) return await action()
  const original = session.getModel()
  await session.setModel(formatModel(target.model))
  try {
    return await action()
  } finally {
    if (shouldRestore && original) await session.setModel(original)
  }
}
