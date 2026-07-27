import type { QueryResult } from '../api/client'

export interface ChartData {
  x: number[] // epoch 秒
  series: { label: string; values: (number | null)[] }[]
}

function parseTime(v: unknown): number | null {
  if (typeof v === 'number') {
    // 纳秒时间戳 → 毫秒；其余按毫秒处理
    return v > 5e15 ? v / 1e6 : v
  }
  if (typeof v === 'string') {
    const ms = Date.parse(v)
    return Number.isNaN(ms) ? null : ms
  }
  return null
}

export function toChartData(result: QueryResult): ChartData | null {
  const ti = result.columns.indexOf('time')
  if (ti < 0) return null

  const numericIdx = result.columns
    .map((_, i) => i)
    .filter((i) => i !== ti && result.rows.some((r) => typeof r[i] === 'number'))
  if (!numericIdx.length) return null

  const points = result.rows
    .map((r) => ({ t: parseTime(r[ti]), r }))
    .filter((p): p is { t: number; r: unknown[] } => p.t != null)
    .sort((a, b) => a.t - b.t)
  if (!points.length) return null

  return {
    x: points.map((p) => p.t / 1000),
    series: numericIdx.map((i) => ({
      label: result.columns[i],
      values: points.map((p) => (typeof p.r[i] === 'number' ? (p.r[i] as number) : null)),
    })),
  }
}
