import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TIME_ZONE,
  applyInfluxqlTimeZone,
  applyResultTimeZone,
  formatTimestampInTimeZone,
  getTimeZoneOptions,
  normalizeTimeZone,
} from '../../src/lib/timezone'

describe('时区选项', () => {
  it('始终包含 UTC 和常用亚洲时区', () => {
    expect(getTimeZoneOptions()).toEqual(expect.arrayContaining(['UTC', 'Asia/Shanghai', 'Asia/Tokyo']))
  })

  it('无效时区回退为 UTC', () => {
    expect(normalizeTimeZone('Not/AZone')).toBe(DEFAULT_TIME_ZONE)
  })
})

describe('InfluxQL 时区子句', () => {
  it('在 SELECT 末尾追加 tz 子句并移除分号', () => {
    expect(applyInfluxqlTimeZone('SELECT * FROM cpu;', 'Asia/Shanghai')).toBe(
      "SELECT * FROM cpu tz('Asia/Shanghai')",
    )
  })

  it('保留查询中显式指定的 tz 子句', () => {
    const query = "SELECT * FROM cpu tz('America/New_York');"
    expect(applyInfluxqlTimeZone(query, 'Asia/Shanghai')).toBe(query)
  })

  it('UTC 和非 SELECT 查询不追加 tz 子句', () => {
    expect(applyInfluxqlTimeZone('SELECT * FROM cpu', 'UTC')).toBe('SELECT * FROM cpu')
    expect(applyInfluxqlTimeZone('SHOW DATABASES', 'Asia/Shanghai')).toBe('SHOW DATABASES')
  })
})

describe('查询结果时区转换', () => {
  it('按 IANA 时区转换并保留纳秒精度', () => {
    expect(formatTimestampInTimeZone('2026-01-01T00:00:00.123456789Z', 'Asia/Shanghai')).toBe(
      '2026-01-01T08:00:00.123456789+08:00',
    )
  })

  it('把 InfluxDB SQL 返回的无后缀时间戳按 UTC 转换', () => {
    expect(formatTimestampInTimeZone('2026-01-01T00:00:00.123456789', 'Asia/Shanghai')).toBe(
      '2026-01-01T08:00:00.123456789+08:00',
    )
    expect(formatTimestampInTimeZone('2026-01-01 00:00:00', 'America/New_York')).toBe(
      '2025-12-31T19:00:00-05:00',
    )
  })

  it('正确处理夏令时', () => {
    expect(formatTimestampInTimeZone('2026-07-01T12:00:00Z', 'America/New_York')).toBe(
      '2026-07-01T08:00:00-04:00',
    )
    expect(formatTimestampInTimeZone('2026-01-01T12:00:00Z', 'America/New_York')).toBe(
      '2026-01-01T07:00:00-05:00',
    )
  })

  it('只转换 time 和 *_time 列且不修改原结果', () => {
    const result = {
      columns: ['time', 'created_time', 'note'],
      rows: [['2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z', '2026-01-01T00:00:00Z']],
      durationMs: 1,
    }
    const converted = applyResultTimeZone(result, 'Asia/Tokyo')
    expect(converted.rows[0]).toEqual([
      '2026-01-01T09:00:00+09:00',
      '2026-01-01T10:00:00+09:00',
      '2026-01-01T00:00:00Z',
    ])
    expect(result.rows[0][0]).toBe('2026-01-01T00:00:00Z')
  })
})
