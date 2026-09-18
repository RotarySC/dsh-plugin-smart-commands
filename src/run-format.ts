/**
 * Layer-neutral run formatting shared by host and client.
 *
 * Lives at the root next to `catalog-query.ts` because both sides of the plugin
 * render the same number for the same run: the host writes a duration into the
 * settled-run report it posts into the session, and the run panel writes one
 * into the dock row. Two formatters would drift.
 *
 * The notice bound lives here for the same reason: the settled-run report and
 * the plugin's own notification both have to stay inside the length DSH accepts
 * for a `notice` source summary, so the constant and the truncation that honours
 * it cannot be declared twice.
 */

/**
 * Bound DSH applies to a `notice` source summary (`CONTEXT_SUMMARY_MAX_CHARS`).
 * The transcript row renders this line without expanding, so an over-long one is
 * ellipsized by the host anyway — staying inside it keeps the stored source honest.
 */
export const NOTICE_SUMMARY_MAX_CHARS = 120

/** Compact human duration: `840ms`, `12.3s`, `3m 05s`. */
export function formatDuration(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1_000)
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

/** First line of a possibly multi-line message, for one-line rows and suffixes. */
export function firstLine(text: string): string {
  const [line = ''] = text.split('\n')
  return line.trim()
}

/** Truncate to `max` characters, ending on an ellipsis when anything was cut. */
export function bound(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}
