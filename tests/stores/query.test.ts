import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useConnectionsStore } from '../../src/stores/connections'
import { useQueryStore } from '../../src/stores/query'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

afterEach(() => vi.unstubAllGlobals())

describe('query store 时区查询', () => {
  it('InfluxQL 请求追加 tz 子句，结果与历史使用所选时区', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [{ time: '2026-01-01T00:00:00Z', value: 1 }],
      text: async () => '',
    }) as Response)
    vi.stubGlobal('fetch', fetchMock)

    const connections = useConnectionsStore()
    connections.connections = [{ id: 'local', name: 'local', url: 'http://db:8181', token: 'T' }]
    connections.activeId = 'local'

    const query = useQueryStore()
    query.db = 'iot'
    query.language = 'influxql'
    query.text = 'SELECT * FROM cpu WHERE time > now() - 1h'
    await query.setTimezone('Asia/Shanghai')
    await query.run()

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string).q).toBe(
      "SELECT * FROM cpu WHERE time > now() - 1h LIMIT 1000 tz('Asia/Shanghai')",
    )
    expect(query.result?.rows[0][0]).toBe('2026-01-01T08:00:00+08:00')
    expect(query.history[0].timezone).toBe('Asia/Shanghai')
    expect(JSON.parse(localStorage.getItem('queryTimezone') ?? 'null')).toBe('Asia/Shanghai')
  })

  it('切换时区会基于原始结果立即刷新，且不会累计偏移', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [{ time: '2026-01-01T00:00:00', value: 1 }],
      text: async () => '',
    }) as Response)
    vi.stubGlobal('fetch', fetchMock)

    const connections = useConnectionsStore()
    connections.connections = [{ id: 'local', name: 'local', url: 'http://db:8181', token: 'T' }]
    connections.activeId = 'local'

    const query = useQueryStore()
    query.db = 'iot'
    query.text = 'SELECT * FROM cpu WHERE time > now() - INTERVAL \'1 hour\''
    await query.run()
    expect(query.result?.rows[0][0]).toBe('2026-01-01T00:00:00Z')

    await query.setTimezone('Asia/Shanghai')
    expect(query.result?.rows[0][0]).toBe('2026-01-01T08:00:00+08:00')

    await query.setTimezone('America/New_York')
    expect(query.result?.rows[0][0]).toBe('2025-12-31T19:00:00-05:00')
  })
})
