export type ApiErrorKind = 'network' | 'auth' | 'http'

export class ApiError extends Error {
  constructor(
    public kind: ApiErrorKind,
    message: string,
    public status?: number,
    public detail?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface ClientOptions {
  url: string
  token: string
  timeoutMs?: number
}

export interface ColumnInfo {
  name: string
  dataType: string
  role: 'time' | 'tag' | 'field'
}

export interface QueryResult {
  columns: string[]
  rows: unknown[][]
  durationMs: number
}

export function normalizeRows(
  data: Record<string, unknown>[],
): Pick<QueryResult, 'columns' | 'rows'> {
  const columns: string[] = []
  for (const row of data) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) columns.push(key)
    }
  }
  const rows = data.map((row) => columns.map((c) => (c in row ? row[c] : null)))
  return { columns, rows }
}

export class InfluxDB3Client {
  constructor(private opts: ClientOptions) {}

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const url = this.opts.url.replace(/\/+$/, '') + path
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 30000)
    let res: Response
    try {
      res = await fetch(url, {
        ...init,
        headers: { Authorization: `Bearer ${this.opts.token}`, ...(init.headers ?? {}) },
        signal: controller.signal,
      })
    } catch (e) {
      throw new ApiError('network', `无法连接 ${url}：${(e as Error).message}`)
    } finally {
      clearTimeout(timer)
    }
    if (res.status === 401 || res.status === 403) {
      throw new ApiError('auth', 'Token 无效或权限不足', res.status)
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new ApiError('http', `HTTP ${res.status}`, res.status, detail)
    }
    return res
  }

  async health(): Promise<boolean> {
    await this.request('/health')
    return true
  }

  async ping(): Promise<{ version: string }> {
    const res = await this.request('/ping')
    const data = (await res.json().catch(() => ({}))) as { version?: string }
    return { version: data.version ?? 'unknown' }
  }

  private async rawSql(db: string, q: string): Promise<Record<string, unknown>[]> {
    const res = await this.request('/api/v3/query_sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ db, q, format: 'json' }),
    })
    return (await res.json()) as Record<string, unknown>[]
  }

  async listDatabases(): Promise<string[]> {
    const res = await this.request('/api/v3/configure/database?format=json')
    const data = (await res.json()) as { databases?: string[] } | Record<string, unknown>[]
    if (Array.isArray(data)) {
      return data.map((row) => (typeof row === 'string' ? row : String(Object.values(row)[0])))
    }
    return data.databases ?? []
  }

  async listTables(db: string): Promise<string[]> {
    const rows = await this.rawSql(
      db,
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'iox' ORDER BY table_name",
    )
    return rows.map((r) => String(r.table_name))
  }

  async tableSchema(db: string, table: string): Promise<ColumnInfo[]> {
    const safe = table.replaceAll("'", "''")
    const rows = await this.rawSql(
      db,
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'iox' AND table_name = '${safe}' ORDER BY ordinal_position`,
    )
    return rows.map((r) => {
      const name = String(r.column_name)
      const dataType = String(r.data_type)
      const role: ColumnInfo['role'] =
        name === 'time' ? 'time' : dataType.includes('Dictionary') ? 'tag' : 'field'
      return { name, dataType, role }
    })
  }

  private async query(endpoint: string, db: string, q: string): Promise<QueryResult> {
    const start = performance.now()
    const res = await this.request(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ db, q, format: 'json' }),
    })
    const data = (await res.json()) as Record<string, unknown>[]
    return { ...normalizeRows(data), durationMs: performance.now() - start }
  }

  async querySql(db: string, q: string): Promise<QueryResult> {
    return this.query('/api/v3/query_sql', db, q)
  }

  async queryInfluxql(db: string, q: string): Promise<QueryResult> {
    return this.query('/api/v3/query_influxql', db, q)
  }

  async writeLineProtocol(
    db: string,
    body: string,
    precision: 'auto' | 'nanosecond' | 'microsecond' | 'millisecond' | 'second' = 'auto',
  ): Promise<void> {
    await this.request(
      `/api/v3/write_lp?db=${encodeURIComponent(db)}&precision=${precision}`,
      { method: 'POST', body },
    )
  }

  async createDatabase(db: string): Promise<void> {
    await this.request('/api/v3/configure/database', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ db }),
    })
  }

  async deleteDatabase(db: string): Promise<void> {
    await this.request(`/api/v3/configure/database?db=${encodeURIComponent(db)}`, {
      method: 'DELETE',
    })
  }
}
