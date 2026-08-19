import { isParallelStep, type ChainStep } from '../types/chain.js'

const OUTPUT_REF_PATTERN = /\{outputs\.([^}]*)\}/g
const SAFE_OUTPUT_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

export class ChainValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChainValidationError'
  }
}

function outputNamesForStep(step: ChainStep): string[] {
  if (isParallelStep(step)) {
    return step.parallel.map(task => task.as).filter((name): name is string => Boolean(name))
  }
  return step.as ? [step.as] : []
}

function taskTemplatesForStep(step: ChainStep): string[] {
  if (isParallelStep(step)) return step.parallel.map(task => task.task)
  return [step.task]
}

export function validateChainOutputBindings(steps: ChainStep[]): void {
  const available = new Set<string>()
  const seen = new Set<string>()
  for (let index = 0; index < steps.length; index++) {
    const display = index + 1
    const step = steps[index]!
    for (const name of outputNamesForStep(step)) {
      if (!SAFE_OUTPUT_NAME_PATTERN.test(name)) {
        throw new ChainValidationError(`Invalid chain output name '${name}' at step ${display}. Use /^[A-Za-z_][A-Za-z0-9_]*$/.`)
      }
      if (seen.has(name)) {
        throw new ChainValidationError(`Duplicate chain output name '${name}'. Each as name must be unique.`)
      }
      seen.add(name)
    }
    for (const template of taskTemplatesForStep(step)) {
      for (const match of template.matchAll(OUTPUT_REF_PATTERN)) {
        const raw = match[0]
        const name = match[1]!
        if (!SAFE_OUTPUT_NAME_PATTERN.test(name)) {
          throw new ChainValidationError(`Invalid chain output reference '${raw}' at step ${display}. Use {outputs.name} with /^[A-Za-z_][A-Za-z0-9_]*$/ names.`)
        }
        if (!available.has(name)) {
          throw new ChainValidationError(`Unknown chain output reference '${raw}' at step ${display}. Named outputs are only available after producing step/group completes.`)
        }
      }
    }
    for (const name of outputNamesForStep(step)) available.add(name)
  }
}

export function resolveOutputReferences(template: string, outputs: Record<string, string>): string {
  return template.replace(OUTPUT_REF_PATTERN, (raw, name: string) => {
    if (!SAFE_OUTPUT_NAME_PATTERN.test(name)) {
      throw new ChainValidationError(`Invalid chain output reference '${raw}'. Use {outputs.name} with /^[A-Za-z_][A-Za-z0-9_]*$/ names.`)
    }
    const value = outputs[name]
    if (value === undefined) {
      throw new ChainValidationError(`Unknown chain output reference '${raw}'.`)
    }
    return value
  })
}

export function interpolateChainTask(
  template: string,
  task: string,
  previous: string,
  outputs: Record<string, string>,
): string {
  const withOutputs = resolveOutputReferences(template, outputs)
  return withOutputs
    .replaceAll('{task}', task)
    .replaceAll('{previous}', previous)
}

export function aggregateParallelOutputs(
  results: Array<{ name: string; agent?: string; text: string; error?: string }>,
): string {
  return results.map((result, index) => {
    const header = `=== Parallel Task ${index + 1} (${result.agent ?? result.name}) ===`
    const body = result.error ? `FAILED: ${result.error}\n${result.text}` : result.text
    return `${header}\n${body}`
  }).join('\n\n')
}

export async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const safeLimit = Math.max(1, Math.floor(limit) || 1)
  const results: R[] = new Array(items.length)
  let next = 0

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index]!, index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(safeLimit, items.length) }, () => worker()))
  return results
}
