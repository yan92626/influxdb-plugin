import { describe, it, expect } from 'vitest'
import { toChartData } from '../../src/lib/chart'

const result = (columns: string[], rows: unknown[][]) => ({ columns, rows, durationMs: 0 })

describe('toChartData', () => {
  it('无 time 列返回 null', () => {
    expect(toChartData(result(['a'], [[1]]))).toBeNull()
  })

  it('无数值列返回 null', () => {
    expect(toChartData(result(['time', 's'], [['2026-01-01T00:00:00Z', 'x']]))).toBeNull()
  })

  it('提取数值列为序列，x 轴为秒且按时间升序', () => {
    const d = toChartData(result(
      ['time', 'temp', 'name'],
      [
        ['2026-01-01T00:01:00Z', 22, 'b'],
        ['2026-01-01T00:00:00Z', 21, 'a'],
      ],
    ))!
    expect(d.series.map((s) => s.label)).toEqual(['temp'])
    expect(d.x).toEqual([Date.parse('2026-01-01T00:00:00Z') / 1000, Date.parse('2026-01-01T00:01:00Z') / 1000])
    expect(d.series[0].values).toEqual([21, 22])
  })

  it('数值列中的非数值单元记为 null', () => {
    const d = toChartData(result(['time', 'v'], [['2026-01-01T00:00:00Z', 1], ['2026-01-01T00:01:00Z', 'bad']]))!
    expect(d.series[0].values).toEqual([1, null])
  })
})
