import type { SmartCommandsRemote } from './SmartCommandsSection.js'

let activeConnect: (() => Promise<SmartCommandsRemote>) | undefined

export function setActiveSmartCommandsConnect(
  connect: (() => Promise<SmartCommandsRemote>) | undefined,
): () => void {
  activeConnect = connect
  return () => {
    if (activeConnect === connect) activeConnect = undefined
  }
}

export function getActiveSmartCommandsConnect(): (() => Promise<SmartCommandsRemote>) | undefined {
  return activeConnect
}
