import { vi, describe, it, expect, afterEach } from 'vitest'
import { InfluxDB3Client, ApiError } from '../../src/api/client'

export function makeClient() {
  return new InfluxDB3Client({ url: 'http://db:8181/', token: 'T', timeoutMs: 1000 })
}

export function stubFetch(status: number, body: unknown) {
  const res = {
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as Response
  const mock = vi.fn(async () => res)
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => vi.unstubAllGlobals())

describe('request 基础', () => {
  it('拼接 URL（去掉尾部斜杠）并携带 Bearer token', async () => {
    const mock = stubFetch(200, {})
    await makeClient().health()
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://db:8181/health')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer T')
  })

  it('网络失败抛 ApiError(kind=network)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    const err = await makeClient().health().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).kind).toBe('network')
  })

  it('401 抛 ApiError(kind=auth)', async () => {
    stubFetch(401, 'unauthorized')
    const err = await makeClient().health().catch((e: unknown) => e)
    expect((err as ApiError).kind).toBe('auth')
    expect((err as ApiError).status).toBe(401)
  })

  it('500 抛 ApiError(kind=http) 并带响应详情', async () => {
    stubFetch(500, { error: 'boom' })
    const err = await makeClient().health().catch((e: unknown) => e)
    expect((err as ApiError).kind).toBe('http')
    expect((err as ApiError).detail).toContain('boom')
  })
})

describe('health/ping', () => {
  it('health 200 返回 true', async () => {
    stubFetch(200, {})
    expect(await makeClient().health()).toBe(true)
  })

  it('ping 解析 version 字段', async () => {
    stubFetch(200, { version: '3.2.0', revision: 'abc' })
    expect((await makeClient().ping()).version).toBe('3.2.0')
  })
})

describe('元数据', () => {
  it('listDatabases 解析 {databases: []} 形状', async () => {
    stubFetch(200, { databases: ['iot', 'metrics'] })
    expect(await makeClient().listDatabases()).toEqual(['iot', 'metrics'])
  })

  it('listDatabases 兼容旧版行对象数组形状', async () => {
    stubFetch(200, [{ 'iox::database': 'iot' }, { 'iox::database': 'metrics' }])
    expect(await makeClient().listDatabases()).toEqual(['iot', 'metrics'])
  })

  it('listDatabasesViaShow 走 influxql 并兼容 name/iox::database 列', async () => {
    const mock = stubFetch(200, [
      { 'iox::measurement': 'databases', name: 'iot' },
      { 'iox::database': 'metrics' },
    ])
    expect(await makeClient().listDatabasesViaShow('iot')).toEqual(['iot', 'metrics'])
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://db:8181/api/v3/query_influxql')
    const body = JSON.parse(init.body as string)
    expect(body.q).toBe('SHOW DATABASES')
    expect(body.db).toBe('iot')
  })

  it('listDatabasesViaShow 不传 db 时 body 中无 db 字段', async () => {
    const mock = stubFetch(200, [])
    await makeClient().listDatabasesViaShow()
    const body = JSON.parse((mock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect('db' in body).toBe(false)
  })

  it('listTables 通过 information_schema 查表名', async () => {
    const mock = stubFetch(200, [{ table_name: 'cpu' }, { table_name: 'mem' }])
    expect(await makeClient().listTables('iot')).toEqual(['cpu', 'mem'])
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://db:8181/api/v3/query_sql')
    const body = JSON.parse(init.body as string)
    expect(body.db).toBe('iot')
    expect(body.q).toContain('information_schema.tables')
  })

  it('tableSchema 区分 time/tag/field 且转义表名中的单引号', async () => {
    const mock = stubFetch(200, [
      { column_name: 'time', data_type: 'Timestamp(Nanosecond, None)' },
      { column_name: 'room', data_type: 'Dictionary(Int32, Utf8)' },
      { column_name: 'temp', data_type: 'Float64' },
    ])
    const cols = await makeClient().tableSchema('iot', "we'ird")
    expect(cols).toEqual([
      { name: 'time', dataType: 'Timestamp(Nanosecond, None)', role: 'time' },
      { name: 'room', dataType: 'Dictionary(Int32, Utf8)', role: 'tag' },
      { name: 'temp', dataType: 'Float64', role: 'field' },
    ])
    const body = JSON.parse((mock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body.q).toContain("we''ird")
  })
})

describe('查询', () => {
  it('querySql 把行对象数组规整为 columns/rows（列序=首次出现序，缺失补 null）', async () => {
    stubFetch(200, [
      { time: '2026-01-01T00:00:00Z', temp: 21.5 },
      { time: '2026-01-01T00:01:00Z', temp: 22.0, hum: 40 },
    ])
    const r = await makeClient().querySql('iot', 'SELECT * FROM cpu')
    expect(r.columns).toEqual(['time', 'temp', 'hum'])
    expect(r.rows).toEqual([
      ['2026-01-01T00:00:00Z', 21.5, null],
      ['2026-01-01T00:01:00Z', 22.0, 40],
    ])
    expect(r.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('空结果返回空 columns/rows', async () => {
    stubFetch(200, [])
    const r = await makeClient().querySql('iot', 'SELECT 1')
    expect(r.columns).toEqual([])
    expect(r.rows).toEqual([])
  })

  it('queryInfluxql 走 /api/v3/query_influxql', async () => {
    const mock = stubFetch(200, [{ 'iox::measurement': 'cpu', value: 1 }])
    const r = await makeClient().queryInfluxql('iot', 'SELECT * FROM cpu')
    expect((mock.mock.calls[0] as unknown as [string])[0]).toBe('http://db:8181/api/v3/query_influxql')
    expect(r.columns).toEqual(['iox::measurement', 'value'])
  })
})

describe('写入与管理', () => {
  it('writeLineProtocol 拼 query 参数并透传 body', async () => {
    const mock = stubFetch(204, '')
    await makeClient().writeLineProtocol('iot', 'cpu val=1', 'second')
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://db:8181/api/v3/write_lp?db=iot&precision=second')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('cpu val=1')
  })

  it('writeLineProtocol 默认 precision=auto', async () => {
    const mock = stubFetch(204, '')
    await makeClient().writeLineProtocol('iot', 'cpu val=1')
    expect((mock.mock.calls[0] as unknown as [string])[0]).toContain('precision=auto')
  })

  it('createDatabase 发送 {db}', async () => {
    const mock = stubFetch(200, '')
    await makeClient().createDatabase('newdb')
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://db:8181/api/v3/configure/database')
    expect(JSON.parse(init.body as string)).toEqual({ db: 'newdb' })
  })

  it('deleteDatabase 走 DELETE + query 参数', async () => {
    const mock = stubFetch(200, '')
    await makeClient().deleteDatabase('olddb')
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://db:8181/api/v3/configure/database?db=olddb')
    expect(init.method).toBe('DELETE')
  })
})
