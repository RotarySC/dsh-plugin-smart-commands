import { firstLine, formatDuration } from '../run-format.js'
import type { ChainRunRecord, ChainRunStatus, ChainRunStep } from '../types/runs.js'

/**
 * One settled detached run, rendered as the message the plugin posts back into
 * its own session.
 *
 * Two jobs, one artefact. The chain's aggregate text no longer travels as the
 * command result, so without this it would live only in the run panel's retention
 * window; and a session whose first input was a slash command never produces a
 * `turn/start` on its own, which is exactly what the sidebar reads to keep it
 * visible. The message is durable in the session log and its turn flips the
 * session out of "blank".
 *
 * Everything here is a pure function of a {@link ChainRunRecord} so the wording
 * is testable without a host, an agent, or a clock.
 */

/** Aggregate output carried into the session; the run panel is not the archive. */
export const RUN_SUMMARY_OUTPUT_MAX_CHARS = 4_000
/** Files listed inline before the rest collapse into a count. */
export const RUN_SUMMARY_FILE_LIMIT = 20
/** Bound DSH applies to a `notice` source summary; stay inside it deliberately. */
export const RUN_SUMMARY_HEADLINE_MAX_CHARS = 120

const STATUS_LABEL: Record<ChainRunStatus, string> = {
  running: 'running',
  succeeded: 'succeeded',
  failed: 'failed',
  cancelled: 'cancelled',
}

/** Closing line: this is a report, not a request, and it must not cost a wall of text. */
const REPORT_FOOTER = 'Generated automatically by the smart-commands plugin for a background chain run. '
  + 'Only act on it if a step failed or follow-up work is needed.'

function bound(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

function elapsedMs(run: ChainRunRecord): number {
  return Math.max(0, (run.endedAt ?? run.startedAt) - run.startedAt)
}

/**
 * The one-line account: also the notice summary the transcript shows collapsed,
 * so it stays plain text (no markdown) and inside {@link RUN_SUMMARY_HEADLINE_MAX_CHARS}.
 */
export function runSummaryHeadline(run: ChainRunRecord): string {
  const total = run.steps.length
  const done = run.steps.filter(step => step.status === 'done').length
  const progress = total > 0 ? ` (${done}/${total} steps)` : ''
  const rounds = run.rounds > 1 ? `, round ${run.round} of ${run.rounds}` : ''
  return bound(
    `smart command ${run.command}: ${STATUS_LABEL[run.status]} in ${formatDuration(elapsedMs(run))}${progress}${rounds}`,
    RUN_SUMMARY_HEADLINE_MAX_CHARS,
  )
}

function stepLine(step: ChainRunStep, position: number): string {
  const duration = step.startedAt !== undefined && step.endedAt !== undefined
    ? ` (${formatDuration(Math.max(0, step.endedAt - step.startedAt))})`
    : ''
  const failure = step.error ? ` — ${firstLine(step.error)}` : ''
  return `- ${position + 1}. ${step.name}: ${step.status}${duration}${failure}`
}

function capOutput(text: string): string {
  if (text.length <= RUN_SUMMARY_OUTPUT_MAX_CHARS) return text
  return `${text.slice(0, RUN_SUMMARY_OUTPUT_MAX_CHARS)}\n`
    + `[output truncated at ${RUN_SUMMARY_OUTPUT_MAX_CHARS} of ${text.length} characters]`
}

/**
 * The full report: headline, step ledger, changed files, aggregate output.
 * Empty sections are omitted rather than printed as headings with nothing under
 * them, which is what keeps a cancelled one-step run to three lines.
 */
export function formatRunSummary(run: ChainRunRecord): string {
  const lines: string[] = [runSummaryHeadline(run)]

  if (run.steps.length > 0) {
    lines.push('', 'Steps:')
    run.steps.forEach((step, position) => lines.push(stepLine(step, position)))
  }

  if (run.error) {
    lines.push('', 'Error:', firstLine(run.error))
  }

  if (run.files.length > 0) {
    lines.push('', 'Changed files:')
    for (const file of run.files.slice(0, RUN_SUMMARY_FILE_LIMIT)) lines.push(`- ${file}`)
    const rest = run.files.length - RUN_SUMMARY_FILE_LIMIT
    if (rest > 0) lines.push(`- … and ${rest} more`)
  }

  if (run.text) {
    lines.push('', 'Final output:', capOutput(run.text))
  }

  lines.push('', REPORT_FOOTER)
  return lines.join('\n')
}
