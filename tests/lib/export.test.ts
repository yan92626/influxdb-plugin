import { describe, it, expect } from 'vitest'
import { toCsv } from '../../src/lib/export'

describe('toCsv', () => {
  it('普通值直接拼接', () => {
    expect(toCsv({ columns: ['a', 'b'], rows: [[1, 'x']], durationMs: 0 })).toBe('a,b\n1,x')
  })

  it('含逗号/引号/换行的值加引号并转义内部引号', () => {
    const csv = toCsv({ columns: ['v'], rows: [['a,b'], ['say "hi"'], ['line1\nline2']], durationMs: 0 })
    expect(csv.split('\n').slice(0, 3).join('\n')).toBe('v\n"a,b"\n"say ""hi"""')
    expect(csv).toContain('"line1\nline2"')
  })

  it('null/undefined 输出为空', () => {
    expect(toCsv({ columns: ['a', 'b'], rows: [[null, undefined]], durationMs: 0 })).toBe('a,b\n,')
  })
})
