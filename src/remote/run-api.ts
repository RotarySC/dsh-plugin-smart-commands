import type { ChainRunRegistry } from '../engine/run-registry.js'
import type {
  ChainRunCancelRequest,
  ChainRunCancelResult,
  ChainRunDismissRequest,
  ChainRunDismissResult,
  ChainRunInventory,
  ChainRunScope,
} from '../types/runs.js'

/**
 * Remote face of the detached chain runs.
 *
 * Kept separate from {@link SmartCommandsCatalogApi} so a run concern never
 * widens the template/keyword surface: the dock panel lists, cancels, and
 * dismisses here, while the settings UI keeps talking to the catalog alone.
 */
export class SmartCommandsRunApi {
  constructor(private readonly runs: ChainRunRegistry) {}

  async listRuns(request: ChainRunScope = {}): Promise<ChainRunInventory> {
    return {
      runs: this.runs.list({
        ...request.sessionId ? { sessionId: request.sessionId } : {},
        ...request.workspaceRoot ? { workspaceRoot: request.workspaceRoot } : {},
      }),
    }
  }

  async cancelRun(request: ChainRunCancelRequest): Promise<ChainRunCancelResult> {
    return this.runs.cancel(request.runId, request.sessionId)
  }

  /** Remove a settled run's row from the table so no client can list it again. */
  async dismissRun(request: ChainRunDismissRequest): Promise<ChainRunDismissResult> {
    return this.runs.dismiss(request.runId, request.sessionId)
  }
}
