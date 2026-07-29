export interface HistoryEntry {
  q: string
  db: string
  language: 'sql' | 'influxql'
  timezone?: string
  at: number
}

export function pushHistory(list: HistoryEntry[], entry: HistoryEntry, max = 50): HistoryEntry[] {
  const rest = list.filter(
    (h) => !(
      h.q === entry.q &&
      h.db === entry.db &&
      h.language === entry.language &&
      (h.timezone ?? 'UTC') === (entry.timezone ?? 'UTC')
    ),
  )
  return [entry, ...rest].slice(0, max)
}
