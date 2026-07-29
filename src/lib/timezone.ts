import type { QueryResult } from '../api/client'

export const DEFAULT_TIME_ZONE = 'UTC'

const COMMON_TIME_ZONES = [
  DEFAULT_TIME_ZONE,
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Australia/Sydney',
]

type IntlWithSupportedValues = typeof Intl & {
  supportedValuesOf?: (key: 'timeZone') => string[]
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format()
    return true
  } catch {
    return false
  }
}

export function normalizeTimeZone(timeZone: unknown): string {
  return typeof timeZone === 'string' && isValidTimeZone(timeZone)
    ? timeZone
    : DEFAULT_TIME_ZONE
}

export function getTimeZoneOptions(): string[] {
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone
  const supported = (Intl as IntlWithSupportedValues).supportedValuesOf?.('timeZone') ?? []
  return [...new Set([...COMMON_TIME_ZONES, local, ...supported].filter(isValidTimeZone))]
}

/** InfluxQL 通过查询末尾的 tz() 子句指定结果时区；显式写出的 tz() 优先。 */
export function applyInfluxqlTimeZone(query: string, timeZone: string): string {
  const normalized = normalizeTimeZone(timeZone)
  if (normalized === DEFAULT_TIME_ZONE || !/^\s*SELECT\b/i.test(query)) return query

  const trimmed = query.replace(/\s*;\s*$/, '').trimEnd()
  if (/\btz\s*\(\s*'[^']+'\s*\)\s*$/i.test(trimmed)) return query
  return `${trimmed} tz('${normalized}')`
}

const RFC3339 =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function dateTimeParts(date: Date, timeZone: string): Record<string, string> {
  let formatter = formatterCache.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    formatterCache.set(timeZone, formatter)
  }
  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
}

function offsetSuffix(date: Date, parts: Record<string, string>): string {
  const wallClockUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  const instantAtSecond = Math.floor(date.getTime() / 1000) * 1000
  const totalMinutes = Math.round((wallClockUtc - instantAtSecond) / 60000)
  if (totalMinutes === 0) return 'Z'

  const sign = totalMinutes < 0 ? '-' : '+'
  const absolute = Math.abs(totalMinutes)
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`
}

export function formatTimestampInTimeZone(value: unknown, timeZone: string): unknown {
  if (typeof value !== 'string') return value
  const match = RFC3339.exec(value)
  if (!match) return value

  // Date.parse implementations commonly reject fractions longer than milliseconds.
  let parseable = value.replace(/\.(\d{3})\d+/, '.$1')
  if (!match[4]) parseable += 'Z'
  const date = new Date(parseable)
  if (Number.isNaN(date.getTime())) return value

  const parts = dateTimeParts(date, normalizeTimeZone(timeZone))
  const fraction = match[3] ?? ''
  return (
    `${parts.year}-${parts.month}-${parts.day}T` +
    `${parts.hour}:${parts.minute}:${parts.second}${fraction}${offsetSuffix(date, parts)}`
  )
}

export function applyResultTimeZone(result: QueryResult, timeZone: string): QueryResult {
  const timeColumns = result.columns
    .map((column, index) => ({ column: column.toLowerCase(), index }))
    .filter(({ column }) => column === 'time' || column.endsWith('_time'))
    .map(({ index }) => index)

  if (!timeColumns.length) return result
  const rows = result.rows.map((row) => {
    const converted = [...row]
    for (const index of timeColumns) {
      converted[index] = formatTimestampInTimeZone(converted[index], timeZone)
    }
    return converted
  })
  return { ...result, rows }
}
