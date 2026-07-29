import { describe, it, expect } from 'vitest'
import { getChartSchema, toChartData } from '../../src/lib/chart'

const result = (columns: string[], rows: unknown[][]) => ({ columns, rows, durationMs: 0 })

describe('getChartSchema', () => {
  it('要求 time 列和数值指标', () => {
    expect(getChartSchema(result(['a'], [[1]]))).toBeNull()
    expect(getChartSchema(result(['time', 's'], [['2026-01-01T00:00:00Z', 'x']]))).toBeNull()
  })

  it('区分数值指标和维度', () => {
    expect(getChartSchema(result(
      ['time', 'temp', 'host', 'online'],
      [['2026-01-01T00:00:00Z', 21, 'a', true]],
    ))).toEqual({ timeColumn: 'time', metrics: ['temp'], dimensions: ['host', 'online'] })
  })
})

describe('toChartData', () => {
  it('默认按维度拆分序列并对齐唯一时间轴', () => {
    const chart = toChartData(result(
      ['time', 'temp', 'host'],
      [
        ['2026-01-01T00:01:00Z', 22, 'a'],
        ['2026-01-01T00:00:00Z', 31, 'b'],
        ['2026-01-01T00:00:00Z', 21, 'a'],
      ],
    ), { bucketSeconds: 0 })!

    expect(chart.x).toEqual([
      Date.parse('2026-01-01T00:00:00Z') / 1000,
      Date.parse('2026-01-01T00:01:00Z') / 1000,
    ])
    expect(chart.series.map((series) => series.label)).toEqual(['host=a', 'host=b'])
    expect(chart.series[0].values).toEqual([21, 22])
    expect(chart.series[1].values).toEqual([31, null])
  })

  it('对同序列同时间点执行所选聚合而不产生竖线', () => {
    const source = result(
      ['time', 'temp', 'host'],
      [
        ['2026-01-01T00:00:00Z', 20, 'a'],
        ['2026-01-01T00:00:00Z', 24, 'a'],
      ],
    )
    const last = toChartData(source, { bucketSeconds: 0, aggregation: 'last' })!
    const average = toChartData(source, { bucketSeconds: 0, aggregation: 'avg' })!

    expect(last.x).toHaveLength(1)
    expect(last.series[0].values).toEqual([24])
    expect(average.series[0].values).toEqual([22])
    expect(last.duplicatePoints).toBe(1)
  })

  it('支持选择指标、拆分维度和固定时间桶', () => {
    const chart = toChartData(result(
      ['time', 'temp', 'humidity', 'host', 'room'],
      [
        ['2026-01-01T00:00:01Z', 20, 40, 'a', 'east'],
        ['2026-01-01T00:00:09Z', 22, 44, 'a', 'west'],
      ],
    ), { metric: 'humidity', groupBy: ['host'], bucketSeconds: 10, aggregation: 'avg' })!

    expect(chart.metric).toBe('humidity')
    expect(chart.series).toHaveLength(1)
    expect(chart.series[0].values).toEqual([42])
    expect(chart.bucketSeconds).toBe(10)
  })

  it('限制高基数序列并提供统计值', () => {
    const chart = toChartData(result(
      ['time', 'temp', 'host'],
      [
        ['2026-01-01T00:00:00Z', 10, 'a'],
        ['2026-01-01T00:00:00Z', 20, 'b'],
        ['2026-01-01T00:01:00Z', 30, 'a'],
      ],
    ), { bucketSeconds: 0, maxSeries: 1 })!

    expect(chart.series).toHaveLength(1)
    expect(chart.omittedSeries).toBe(1)
    expect(chart.series[0]).toMatchObject({ latest: 30, min: 10, max: 30, avg: 20 })
  })

  it('丢弃无效时间和非数值单元', () => {
    const chart = toChartData(result(
      ['time', 'value'],
      [['bad', 1], ['2026-01-01T00:00:00Z', 'bad'], ['2026-01-01T00:01:00Z', 2]],
    ), { bucketSeconds: 0 })!

    expect(chart.validRows).toBe(1)
    expect(chart.series[0].values).toEqual([2])
  })

  it('兼容纳秒精度和无时区后缀的 InfluxDB 时间字符串', () => {
    const chart = toChartData(result(
      ['time', 'value'],
      [
        ['2026-01-01T00:00:00.123456789Z', 1],
        ['2026-01-01T00:00:01.123456789', 2],
      ],
    ), { bucketSeconds: 0 })!

    expect(chart.x).toEqual([
      Date.parse('2026-01-01T00:00:00.123Z') / 1000,
      Date.parse('2026-01-01T00:00:01.123Z') / 1000,
    ])
  })
})
