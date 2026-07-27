import type { QueryResult } from '../api/client'

function esc(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

export function toCsv(result: QueryResult): string {
  const head = result.columns.map(esc).join(',')
  const body = result.rows.map((r) => r.map(esc).join(','))
  return [head, ...body].join('\n')
}

export function toJson(result: QueryResult): string {
  const objs = result.rows.map((r) =>
    Object.fromEntries(result.columns.map((c, i) => [c, r[i]])),
  )
  return JSON.stringify(objs, null, 2)
}

export function download(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
