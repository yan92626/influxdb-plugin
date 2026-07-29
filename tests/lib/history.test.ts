import { describe, it, expect } from 'vitest'
import { pushHistory, type HistoryEntry } from '../../src/lib/history'

const e = (q: string, at = 0): HistoryEntry => ({ q, db: 'iot', language: 'sql', at })

describe('pushHistory', () => {
  it('新条目排最前', () => {
    const list = pushHistory([e('a')], e('b'))
    expect(list.map((h) => h.q)).toEqual(['b', 'a'])
  })

  it('相同 q+db+language 去重（保留新的）', () => {
    const list = pushHistory([e('a', 1), e('b', 2)], e('a', 3))
    expect(list.map((h) => h.q)).toEqual(['a', 'b'])
    expect(list[0].at).toBe(3)
  })

  it('相同查询的不同查询时区分别保留', () => {
    const utc = { ...e('a', 1), timezone: 'UTC' }
    const shanghai = { ...e('a', 2), timezone: 'Asia/Shanghai' }
    expect(pushHistory([utc], shanghai)).toEqual([shanghai, utc])
  })

  it('超过上限截断到 50 条', () => {
    const list = Array.from({ length: 50 }, (_, i) => e(`q${i}`))
    expect(pushHistory(list, e('new'))).toHaveLength(50)
  })
})
