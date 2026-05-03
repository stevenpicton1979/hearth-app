export function computeMonthsSince(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44)))
}
