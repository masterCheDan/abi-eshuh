let depth = 0
let queued: (() => void) | undefined
export function scheduleSimulation(action: () => void): void {
  if (depth) queued = action
  else action()
}
export function simulationTransaction(action: () => void): void {
  depth++
  try { action() } finally {
    depth--
    if (!depth) { const pending = queued; queued = undefined; pending?.() }
  }
}
