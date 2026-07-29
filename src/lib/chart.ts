import type { QueryResult } from '../api/client'

export type ChartAggregation = 'last' | 'avg' | 'min' | 'max'

export interface ChartSchema {
  timeColumn: string
  metrics: string[]
  dimensions: string[]
}

export interface ChartOptions {
  metric?: string
  groupBy?: string[]
  aggregation?: ChartAggregation
  bucketSeconds?: 'auto' | number
  maxSeries?: number
}

export interface ChartSeries {
  label: string
  values: (number | null)[]
  samples: number
  latest: number
  min: number
  max: number
  avg: number
}

export interface ChartData {
  x: number[]
  series: ChartSeries[]
  metric: string
  unit: string
  bucketSeconds: number
  sourceRows: number
  validRows: number
  duplicatePoints: number
  omittedSeries: number
}

const AUTO_BUCKETS = [1, 5, 10, 30, 60, 5 * 60, 15 * 60, 30 * 60, 60 * 60, 6 * 60 * 60, 24 * 60 * 60]

function parseTime(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    if (value > 5e15) return value / 1e6
    if (value > 5e12) return value / 1e3
    if (value < 5e10) return value * 1e3
    return value
  }
  if (typeof value === 'string') {
    let parseable = value.replace(/\.(\d{3})\d+/, '.$1')
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(parseable)) parseable += 'Z'
    const milliseconds = Date.parse(parseable)
    return Number.isNaN(milliseconds) ? null : milliseconds
  }
  return null
}

export function getChartSchema(result: QueryResult): ChartSchema | null {
  const timeIndex = result.columns.findIndex((column) => column.toLowerCase() === 'time')
  if (timeIndex < 0) return null

  const metrics = result.columns.filter((_, columnIndex) =>
    columnIndex !== timeIndex && result.rows.some((row) => typeof row[columnIndex] === 'number' && Number.isFinite(row[columnIndex])),
  )
  if (!metrics.length) return null

  const dimensions = result.columns.filter((_, columnIndex) =>
    columnIndex !== timeIndex &&
    !metrics.includes(result.columns[columnIndex]) &&
    result.rows.some((row) => row[columnIndex] != null),
  )
  return { timeColumn: result.columns[timeIndex], metrics, dimensions }
}

function autoBucketSeconds(times: number[]): number {
  if (times.length < 2) return 0
  const rangeSeconds = (Math.max(...times) - Math.min(...times)) / 1000
  const minimum = rangeSeconds / 400
  if (minimum <= 0) return 0
  return AUTO_BUCKETS.find((seconds) => seconds >= minimum) ?? AUTO_BUCKETS[AUTO_BUCKETS.length - 1]
}

function dimensionValue(value: unknown): string {
  if (value == null || value === '') return '∅'
  return String(value)
}

function inferUnit(metric: string): string {
  const normalized = metric.toLowerCase()
  if (/(^|_)(temp|temperature)(_|$)/.test(normalized)) return '°C'
  if (/(percent|percentage|_pct|pct_|usage|utilization)/.test(normalized)) return '%'
  if (/(latency|duration|elapsed)(_ms)?$/.test(normalized)) return 'ms'
  if (/(^|_)(bytes|byte)(_|$)/.test(normalized)) return 'B'
  return ''
}

function aggregate(values: { time: number; value: number; order: number }[], method: ChartAggregation): number {
  if (method === 'last') {
    return values.reduce((latest, item) =>
      item.time > latest.time || (item.time === latest.time && item.order > latest.order) ? item : latest,
    ).value
  }
  if (method === 'min') return Math.min(...values.map((item) => item.value))
  if (method === 'max') return Math.max(...values.map((item) => item.value))
  return values.reduce((sum, item) => sum + item.value, 0) / values.length
}

export function toChartData(result: QueryResult, options: ChartOptions = {}): ChartData | null {
  const schema = getChartSchema(result)
  if (!schema) return null

  const timeIndex = result.columns.indexOf(schema.timeColumn)
  const metric = schema.metrics.includes(options.metric ?? '') ? options.metric! : schema.metrics[0]
  const metricIndex = result.columns.indexOf(metric)
  const groupBy = (options.groupBy ?? schema.dimensions).filter((column) => schema.dimensions.includes(column))
  const dimensionIndexes = groupBy.map((column) => result.columns.indexOf(column))
  const aggregation = options.aggregation ?? 'last'

  const rows = result.rows.flatMap((row, order) => {
    const time = parseTime(row[timeIndex])
    const value = row[metricIndex]
    if (time == null || typeof value !== 'number' || !Number.isFinite(value)) return []
    const label = groupBy.length
      ? groupBy.map((column, index) => `${column}=${dimensionValue(row[dimensionIndexes[index]])}`).join(' · ')
      : metric
    return [{ time, value, label, order }]
  })
  if (!rows.length) return null

  const requestedBucket = options.bucketSeconds ?? 'auto'
  const bucketSeconds = requestedBucket === 'auto'
    ? autoBucketSeconds(rows.map((row) => row.time))
    : Math.max(0, requestedBucket)
  const bucketMilliseconds = bucketSeconds * 1000
  const grouped = new Map<string, Map<number, { time: number; value: number; order: number }[]>>()
  for (const row of rows) {
    const bucket = bucketMilliseconds ? Math.floor(row.time / bucketMilliseconds) * bucketMilliseconds : row.time
    const byTime = grouped.get(row.label) ?? new Map()
    const values = byTime.get(bucket) ?? []
    values.push(row)
    byTime.set(bucket, values)
    grouped.set(row.label, byTime)
  }

  const maxSeries = Math.max(1, options.maxSeries ?? 20)
  const selectedGroups = [...grouped.entries()]
    .sort((left, right) => {
      const sampleDifference = [...right[1].values()].reduce((sum, values) => sum + values.length, 0) -
        [...left[1].values()].reduce((sum, values) => sum + values.length, 0)
      return sampleDifference || left[0].localeCompare(right[0])
    })
    .slice(0, maxSeries)
  const timestamps = [...new Set(selectedGroups.flatMap(([, byTime]) => [...byTime.keys()]))].sort((a, b) => a - b)

  let duplicatePoints = 0
  const series = selectedGroups.map(([label, byTime]) => {
    const aggregated = new Map<number, number>()
    let samples = 0
    for (const [timestamp, values] of byTime) {
      samples += values.length
      duplicatePoints += Math.max(0, values.length - 1)
      aggregated.set(timestamp, aggregate(values, aggregation))
    }
    const numericValues = [...aggregated.values()]
    return {
      label,
      values: timestamps.map((timestamp) => aggregated.get(timestamp) ?? null),
      samples,
      latest: [...aggregated.entries()].sort((left, right) => right[0] - left[0])[0][1],
      min: Math.min(...numericValues),
      max: Math.max(...numericValues),
      avg: numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length,
    }
  })

  return {
    x: timestamps.map((timestamp) => timestamp / 1000),
    series,
    metric,
    unit: inferUnit(metric),
    bucketSeconds,
    sourceRows: result.rows.length,
    validRows: rows.length,
    duplicatePoints,
    omittedSeries: Math.max(0, grouped.size - selectedGroups.length),
  }
}
