import { describe, it, expect } from 'vitest'
import { analyzeQuery, ensureLimit } from '../../src/lib/guard'

describe('analyzeQuery', () => {
  it('识别缺少时间过滤的 SELECT', () => {
    const a = analyzeQuery('SELECT * FROM cpu')
    expect(a.isSelect).toBe(true)
    expect(a.hasTimeFilter).toBe(false)
  })

  it('WHERE 含 time 条件视为有时间过滤', () => {
    expect(analyzeQuery("SELECT * FROM cpu WHERE time >= now() - INTERVAL '1 hour'").hasTimeFilter).toBe(true)
    expect(analyzeQuery('SELECT * FROM cpu WHERE time > now() - 1h').hasTimeFilter).toBe(true)
  })

  it('字符串字面量里的 time 不算时间过滤', () => {
    expect(analyzeQuery("SELECT * FROM cpu WHERE tag = 'time to go'").hasTimeFilter).toBe(false)
  })

  it('识别 LIMIT', () => {
    expect(analyzeQuery('SELECT * FROM cpu LIMIT 10').hasLimit).toBe(true)
    expect(analyzeQuery('SELECT * FROM cpu').hasLimit).toBe(false)
  })

  it('SHOW/EXPLAIN 不算 SELECT（不强制防护）', () => {
    expect(analyzeQuery('SHOW DATABASES').isSelect).toBe(false)
    expect(analyzeQuery('EXPLAIN SELECT * FROM cpu').isSelect).toBe(false)
  })

  it('识别危险语句', () => {
    expect(analyzeQuery('DROP TABLE cpu').isDangerous).toBe(true)
    expect(analyzeQuery('DELETE FROM cpu').isDangerous).toBe(true)
    expect(analyzeQuery('SELECT * FROM deleted_items').isDangerous).toBe(false)
  })
})

describe('ensureLimit', () => {
  it('无 LIMIT 的 SELECT 追加 LIMIT', () => {
    expect(ensureLimit('SELECT * FROM cpu', 500)).toBe('SELECT * FROM cpu LIMIT 500')
  })

  it('已有 LIMIT 不改动', () => {
    expect(ensureLimit('SELECT * FROM cpu LIMIT 10', 500)).toBe('SELECT * FROM cpu LIMIT 10')
  })

  it('末尾分号与空白正确处理', () => {
    expect(ensureLimit('SELECT * FROM cpu ; ', 500)).toBe('SELECT * FROM cpu LIMIT 500')
  })

  it('InfluxQL 的 LIMIT 插入到 tz 子句之前', () => {
    expect(ensureLimit("SELECT * FROM cpu tz('Asia/Shanghai');", 500)).toBe(
      "SELECT * FROM cpu LIMIT 500 tz('Asia/Shanghai')",
    )
  })

  it('非 SELECT 语句不追加', () => {
    expect(ensureLimit('SHOW DATABASES', 500)).toBe('SHOW DATABASES')
  })
})
