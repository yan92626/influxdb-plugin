# InfluxDB3 Head 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个 Chrome MV3 扩展（本地加载），用于可视化管理自建 InfluxDB 3.x：多连接管理、库表浏览、SQL/InfluxQL 查询（表格+折线图+导出）、Line Protocol 写入、建库删库。

**Architecture:** 点击扩展图标打开完整标签页 Vue 应用。`host_permissions` 覆盖 http/https 使扩展页可直接 fetch InfluxDB，无需代理。单向数据流：组件 → Pinia action → `InfluxDB3Client`（唯一 HTTP 层）→ store → 渲染。连接配置存 `chrome.storage.local`（测试/dev 环境自动降级 localStorage）。

**Tech Stack:** Vue 3 + TypeScript + Vite + Pinia + CodeMirror 6 + uPlot + Vitest（happy-dom）。

**与 spec 的差异：** spec 提到用 CRXJS 构建。本项目无 content script、background 仅 3 行，故改用更简单可靠的方案：静态 `manifest.json` 与 `background.js` 放 `public/`（Vite 原样拷贝到 `dist/`），`index.html` 走普通 Vite 构建。spec 已同步修订。

**InfluxDB 3 API 事实（已对照官方文档核实）：**
- 认证：`Authorization: Bearer <token>`
- `POST /api/v3/query_sql`、`POST /api/v3/query_influxql`：JSON body `{db, q, format}`；`format: "json"` 时响应为行对象数组
- `POST /api/v3/write_lp?db=<db>&precision=<auto|nanosecond|microsecond|millisecond|second>`：body 为 line protocol 文本，成功返回 204
- `GET /api/v3/configure/database`：列库，响应 `{"databases": ["name", ...]}`（旧版本可能返回 `[{"iox::database":"name"}]`，客户端做兼容解析）
- `POST /api/v3/configure/database` body `{db}`：建库，成功 200；`DELETE /api/v3/configure/database?db=<db>`：删库，成功 200
- `GET /health`：健康检查；`GET /ping`：返回含 `version` 字段的 JSON
- 表/列元数据：SQL 查 `information_schema.tables` / `information_schema.columns`（`table_schema = 'iox'`）；tag 列的 `data_type` 含 `Dictionary`，`time` 列名固定为 `time`

**验收环境：** 本地 Docker 启动 `docker run -d -p 8181:8181 influxdb:3-core influxdb3 serve --node-id n0 --object-store memory`，用 `docker exec <容器> influxdb3 create token --admin` 拿 token（具体命令以实际镜像文档为准；无 Docker 时跳过手动验收步骤，不阻塞后续任务）。

---

## 文件结构总览

```
influxdb-plugin/
├── package.json / tsconfig.json / vite.config.ts / index.html
├── public/
│   ├── manifest.json          # MV3 静态 manifest
│   └── background.js          # 仅 action.onClicked → 开标签页
├── src/
│   ├── main.ts                # createApp + pinia + 全局样式
│   ├── App.vue                # 顶栏（连接切换/健康灯/视图切换）+ 视图容器
│   ├── style.css              # 全局样式（唯一 CSS 文件）
│   ├── api/client.ts          # ApiError + InfluxDB3Client（唯一 HTTP 层）
│   ├── lib/
│   │   ├── storage.ts         # chrome.storage.local 封装，降级 localStorage
│   │   ├── history.ts         # 查询历史纯函数（去重/上限）
│   │   ├── export.ts          # CSV/JSON 导出
│   │   └── chart.ts           # QueryResult → uPlot 数据（纯函数）
│   ├── stores/
│   │   ├── connections.ts     # 连接 CRUD/当前连接/健康
│   │   ├── explorer.ts        # 库/表树、表结构缓存
│   │   └── query.ts           # 查询执行、结果、历史
│   ├── views/
│   │   ├── ExplorerView.vue   # 主工作区：左树 + 编辑器 + 结果
│   │   ├── OverviewView.vue
│   │   ├── WriteView.vue
│   │   └── AdminView.vue
│   └── components/
│       ├── ConnectionManager.vue
│       ├── DbTree.vue
│       ├── QueryEditor.vue
│       ├── ResultsTable.vue
│       └── ResultsChart.vue
└── tests/
    ├── api/client.test.ts
    ├── lib/{history,export,chart}.test.ts
    └── stores/connections.test.ts
```

---

### Task 1: 项目脚手架

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `public/manifest.json`, `public/background.js`, `src/main.ts`, `src/App.vue`, `src/style.css`, `src/vite-env.d.ts`

- [ ] **Step 1: 写 `package.json`**

```json
{
  "name": "influxdb3-head",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@codemirror/lang-sql": "^6.8.0",
    "@codemirror/state": "^6.4.1",
    "@codemirror/view": "^6.34.1",
    "codemirror": "^6.0.1",
    "pinia": "^2.2.6",
    "uplot": "^1.6.31",
    "vue": "^3.5.13"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.280",
    "@vitejs/plugin-vue": "^5.2.0",
    "happy-dom": "^15.11.6",
    "typescript": "~5.6.3",
    "vite": "^5.4.11",
    "vitest": "^2.1.5"
  }
}
```

- [ ] **Step 2: 写 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["chrome", "vite/client"],
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "tests/**/*.ts"]
}
```

- [ ] **Step 3: 写 `vite.config.ts`（含 vitest 配置）**

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
  },
})
```

- [ ] **Step 4: 写 `public/manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "InfluxDB3 Head",
  "version": "0.1.0",
  "description": "InfluxDB 3.x 可视化管理工具：库表浏览、SQL/InfluxQL 查询、写入与管理",
  "action": {},
  "background": { "service_worker": "background.js" },
  "permissions": ["storage"],
  "host_permissions": ["http://*/*", "https://*/*"]
}
```

注意：`action` 必须为空对象（不设 `default_popup`），否则 `onClicked` 不触发。

- [ ] **Step 5: 写 `public/background.js`**

```js
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') })
})
```

- [ ] **Step 6: 写 `index.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>InfluxDB3 Head</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 7: 写 `src/vite-env.d.ts`、`src/main.ts`、`src/App.vue`（临时壳）、`src/style.css`**

`src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
```

`src/main.ts`:

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './style.css'
import 'uplot/dist/uPlot.min.css'

createApp(App).use(createPinia()).mount('#app')
```

`src/App.vue`（临时壳，Task 8 替换）:

```vue
<template>
  <h1>InfluxDB3 Head</h1>
</template>
```

`src/style.css`:

```css
* { box-sizing: border-box; }
body { margin: 0; font: 14px/1.5 -apple-system, "Segoe UI", "PingFang SC", sans-serif; color: #24292f; }
button { cursor: pointer; }
.btn { padding: 4px 12px; border: 1px solid #d0d7de; border-radius: 6px; background: #f6f8fa; }
.btn-primary { background: #0969da; color: #fff; border-color: #0969da; }
.btn-danger { background: #cf222e; color: #fff; border-color: #cf222e; }
input, select, textarea { padding: 4px 8px; border: 1px solid #d0d7de; border-radius: 6px; font: inherit; }
table.grid { border-collapse: collapse; width: 100%; }
table.grid th, table.grid td { border: 1px solid #d0d7de; padding: 4px 8px; text-align: left; white-space: nowrap; }
table.grid th { background: #f6f8fa; position: sticky; top: 0; }
.error-box { background: #ffebe9; border: 1px solid #ff818266; border-radius: 6px; padding: 8px 12px; white-space: pre-wrap; color: #cf222e; }
.muted { color: #57606a; font-size: 12px; }
```

- [ ] **Step 8: 安装依赖并构建验证**

Run: `npm install && npm run build`
Expected: 构建成功，`dist/` 下有 `index.html`、`manifest.json`、`background.js`、`assets/`

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "chore: Vite + Vue3 + MV3 项目脚手架"
```

---

### Task 2: ApiError + 请求基础 + health/ping（TDD）

**Files:**
- Create: `src/api/client.ts`
- Test: `tests/api/client.test.ts`

- [ ] **Step 1: 写失败的测试**

`tests/api/client.test.ts`:

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/api/client.test.ts`
Expected: FAIL（`src/api/client.ts` 不存在）

- [ ] **Step 3: 实现 `src/api/client.ts`**

```ts
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
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/api/client.test.ts`
Expected: PASS（6 个用例）

- [ ] **Step 5: Commit**

```bash
git add src/api/client.ts tests/api/client.test.ts
git commit -m "feat(api): ApiError 与请求基础、health/ping"
```

---

### Task 3: 元数据接口 listDatabases / listTables / tableSchema（TDD）

**Files:**
- Modify: `src/api/client.ts`
- Test: `tests/api/client.test.ts`（追加）

- [ ] **Step 1: 追加失败的测试**

在 `tests/api/client.test.ts` 末尾追加：

```ts
describe('元数据', () => {
  it('listDatabases 解析 {databases: []} 形状', async () => {
    stubFetch(200, { databases: ['iot', 'metrics'] })
    expect(await makeClient().listDatabases()).toEqual(['iot', 'metrics'])
  })

  it('listDatabases 兼容旧版行对象数组形状', async () => {
    stubFetch(200, [{ 'iox::database': 'iot' }, { 'iox::database': 'metrics' }])
    expect(await makeClient().listDatabases()).toEqual(['iot', 'metrics'])
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/api/client.test.ts`
Expected: FAIL（方法不存在）

- [ ] **Step 3: 在 `src/api/client.ts` 追加实现**

在文件顶部追加类型：

```ts
export interface ColumnInfo {
  name: string
  dataType: string
  role: 'time' | 'tag' | 'field'
}
```

在 `InfluxDB3Client` 类内追加（`rawSql` 是私有辅助，Task 4 的 `querySql` 也会用到同一端点）：

```ts
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/api/client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/client.ts tests/api/client.test.ts
git commit -m "feat(api): 库/表/列元数据接口"
```

---

### Task 4: 查询接口 querySql / queryInfluxql + 结果规整（TDD）

**Files:**
- Modify: `src/api/client.ts`
- Test: `tests/api/client.test.ts`（追加）

- [ ] **Step 1: 追加失败的测试**

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/api/client.test.ts`
Expected: FAIL

- [ ] **Step 3: 在 `src/api/client.ts` 追加实现**

类型（文件顶部）：

```ts
export interface QueryResult {
  columns: string[]
  rows: unknown[][]
  durationMs: number
}
```

模块级纯函数（类外）：

```ts
export function normalizeRows(data: Record<string, unknown>[]): Pick<QueryResult, 'columns' | 'rows'> {
  const columns: string[] = []
  for (const row of data) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) columns.push(key)
    }
  }
  const rows = data.map((row) => columns.map((c) => (c in row ? row[c] : null)))
  return { columns, rows }
}
```

类内追加：

```ts
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/api/client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/client.ts tests/api/client.test.ts
git commit -m "feat(api): SQL/InfluxQL 查询与结果规整"
```

---

### Task 5: 写入与库管理接口（TDD）

**Files:**
- Modify: `src/api/client.ts`
- Test: `tests/api/client.test.ts`（追加）

- [ ] **Step 1: 追加失败的测试**

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/api/client.test.ts`
Expected: FAIL

- [ ] **Step 3: 在 `InfluxDB3Client` 类内追加实现**

```ts
  async writeLineProtocol(
    db: string,
    body: string,
    precision: 'auto' | 'nanosecond' | 'microsecond' | 'millisecond' | 'second' = 'auto',
  ): Promise<void> {
    await this.request(`/api/v3/write_lp?db=${encodeURIComponent(db)}&precision=${precision}`, {
      method: 'POST',
      body,
    })
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/api/client.test.ts`
Expected: PASS（api client 全部用例）

- [ ] **Step 5: Commit**

```bash
git add src/api/client.ts tests/api/client.test.ts
git commit -m "feat(api): line protocol 写入与建库删库"
```

---

### Task 6: storage 封装 + connections store（TDD）

**Files:**
- Create: `src/lib/storage.ts`, `src/stores/connections.ts`
- Test: `tests/stores/connections.test.ts`

- [ ] **Step 1: 写 `src/lib/storage.ts`（无独立测试，通过 store 测试覆盖）**

```ts
export async function storageGet<T>(key: string, fallback: T): Promise<T> {
  if (globalThis.chrome?.storage?.local) {
    const obj = await chrome.storage.local.get(key)
    return (obj[key] as T) ?? fallback
  }
  const raw = localStorage.getItem(key)
  return raw ? (JSON.parse(raw) as T) : fallback
}

export async function storageSet(key: string, value: unknown): Promise<void> {
  if (globalThis.chrome?.storage?.local) {
    await chrome.storage.local.set({ [key]: value })
    return
  }
  localStorage.setItem(key, JSON.stringify(value))
}
```

- [ ] **Step 2: 写失败的测试**

`tests/stores/connections.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useConnectionsStore, type SavedConnection } from '../../src/stores/connections'

const conn = (over: Partial<SavedConnection> = {}): SavedConnection => ({
  id: 'id-1',
  name: 'local',
  url: 'http://db:8181',
  token: 'T',
  ...over,
})

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe('connections store', () => {
  it('save 后 load 能恢复，且首个连接自动激活', async () => {
    const s = useConnectionsStore()
    await s.save(conn())
    expect(s.activeId).toBe('id-1')

    setActivePinia(createPinia())
    const s2 = useConnectionsStore()
    await s2.load()
    expect(s2.connections).toHaveLength(1)
    expect(s2.active?.name).toBe('local')
  })

  it('save 相同 id 是更新而非新增', async () => {
    const s = useConnectionsStore()
    await s.save(conn())
    await s.save(conn({ name: 'renamed' }))
    expect(s.connections).toHaveLength(1)
    expect(s.active?.name).toBe('renamed')
  })

  it('remove 当前连接后回退到剩余首个', async () => {
    const s = useConnectionsStore()
    await s.save(conn())
    await s.save(conn({ id: 'id-2', name: 'other' }))
    await s.setActive('id-2')
    await s.remove('id-2')
    expect(s.activeId).toBe('id-1')
  })

  it('checkHealth 成功置 ok 并记录版本', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ version: '3.2.0' }),
      text: async () => '',
    }) as Response))
    const s = useConnectionsStore()
    await s.save(conn())
    await s.checkHealth()
    expect(s.health).toBe('ok')
    expect(s.version).toBe('3.2.0')
  })

  it('checkHealth 失败置 down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('refused') }))
    const s = useConnectionsStore()
    await s.save(conn())
    await s.checkHealth()
    expect(s.health).toBe('down')
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run tests/stores/connections.test.ts`
Expected: FAIL

- [ ] **Step 4: 实现 `src/stores/connections.ts`**

```ts
import { defineStore } from 'pinia'
import { InfluxDB3Client } from '../api/client'
import { storageGet, storageSet } from '../lib/storage'

export interface SavedConnection {
  id: string
  name: string
  url: string
  token: string
  defaultDb?: string
}

const CONNS_KEY = 'connections'
const ACTIVE_KEY = 'activeConnectionId'

export const useConnectionsStore = defineStore('connections', {
  state: () => ({
    connections: [] as SavedConnection[],
    activeId: '',
    health: 'unknown' as 'unknown' | 'ok' | 'down',
    version: '',
  }),
  getters: {
    active(state): SavedConnection | null {
      return state.connections.find((c) => c.id === state.activeId) ?? null
    },
  },
  actions: {
    client(): InfluxDB3Client {
      const c = this.active
      if (!c) throw new Error('未选择连接')
      return new InfluxDB3Client({ url: c.url, token: c.token })
    },
    async persist() {
      await storageSet(CONNS_KEY, this.connections)
      await storageSet(ACTIVE_KEY, this.activeId)
    },
    async load() {
      this.connections = await storageGet<SavedConnection[]>(CONNS_KEY, [])
      this.activeId = await storageGet(ACTIVE_KEY, '')
      if (!this.active && this.connections.length) this.activeId = this.connections[0].id
    },
    async save(conn: SavedConnection) {
      const i = this.connections.findIndex((c) => c.id === conn.id)
      if (i >= 0) this.connections[i] = conn
      else this.connections.push(conn)
      if (!this.active) this.activeId = conn.id
      await this.persist()
    },
    async remove(id: string) {
      this.connections = this.connections.filter((c) => c.id !== id)
      if (this.activeId === id) this.activeId = this.connections[0]?.id ?? ''
      await this.persist()
    },
    async setActive(id: string) {
      this.activeId = id
      this.health = 'unknown'
      this.version = ''
      await this.persist()
    },
    async checkHealth() {
      try {
        const client = this.client()
        await client.health()
        this.version = (await client.ping()).version
        this.health = 'ok'
      } catch {
        this.health = 'down'
      }
    },
  },
})
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/stores/connections.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage.ts src/stores/connections.ts tests/stores/connections.test.ts
git commit -m "feat(store): 连接管理 store 与 storage 封装"
```

---

### Task 7: 顶栏 App 壳 + ConnectionManager（UI，手动验证）

**Files:**
- Modify: `src/App.vue`（替换临时壳）
- Create: `src/components/ConnectionManager.vue`
- Create: `src/views/ExplorerView.vue`、`src/views/OverviewView.vue`、`src/views/WriteView.vue`、`src/views/AdminView.vue`（先占位，后续任务填充）

- [ ] **Step 1: 四个视图先写占位**

`src/views/ExplorerView.vue`、`OverviewView.vue`、`WriteView.vue`、`AdminView.vue` 均先写：

```vue
<template>
  <div style="padding: 16px" class="muted">开发中…</div>
</template>
```

- [ ] **Step 2: 实现 `src/components/ConnectionManager.vue`**

```vue
<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useConnectionsStore, type SavedConnection } from '../stores/connections'
import { InfluxDB3Client, ApiError } from '../api/client'

defineEmits<{ close: [] }>()
const store = useConnectionsStore()

const blank = (): SavedConnection => ({
  id: crypto.randomUUID(),
  name: '',
  url: 'http://localhost:8181',
  token: '',
  defaultDb: '',
})
const form = reactive(blank())
const testMsg = ref('')

function edit(c: SavedConnection) {
  Object.assign(form, c)
  testMsg.value = ''
}
async function save() {
  if (!form.name || !form.url) return
  await store.save({ ...form })
  Object.assign(form, blank())
}
async function test() {
  testMsg.value = '测试中…'
  try {
    const client = new InfluxDB3Client({ url: form.url, token: form.token, timeoutMs: 5000 })
    await client.health()
    const { version } = await client.ping()
    testMsg.value = `✅ 连接成功（版本 ${version}）`
  } catch (e) {
    testMsg.value = `❌ ${e instanceof ApiError ? e.message : String(e)}`
  }
}
</script>

<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="dialog">
      <h3>连接管理</h3>
      <table class="grid" v-if="store.connections.length">
        <thead><tr><th>名称</th><th>地址</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="c in store.connections" :key="c.id">
            <td>{{ c.name }}</td>
            <td>{{ c.url }}</td>
            <td>
              <button class="btn" @click="edit(c)">编辑</button>
              <button class="btn btn-danger" @click="store.remove(c.id)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="form">
        <input v-model="form.name" placeholder="名称，如 prod-influx3" />
        <input v-model="form.url" placeholder="http://localhost:8181" />
        <input v-model="form.token" type="password" placeholder="Token" />
        <input v-model="form.defaultDb" placeholder="默认数据库（可选）" />
        <div>
          <button class="btn" @click="test">测试连接</button>
          <button class="btn btn-primary" @click="save">保存</button>
          <button class="btn" @click="$emit('close')">关闭</button>
        </div>
        <span class="muted">{{ testMsg }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; background: rgb(0 0 0 / 40%); display: flex; align-items: center; justify-content: center; z-index: 10; }
.dialog { background: #fff; border-radius: 8px; padding: 20px; width: 560px; max-height: 80vh; overflow: auto; }
.form { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
</style>
```

- [ ] **Step 3: 替换 `src/App.vue`**

```vue
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useConnectionsStore } from './stores/connections'
import ConnectionManager from './components/ConnectionManager.vue'
import ExplorerView from './views/ExplorerView.vue'
import OverviewView from './views/OverviewView.vue'
import WriteView from './views/WriteView.vue'
import AdminView from './views/AdminView.vue'

const views = {
  explorer: { label: '工作区', comp: ExplorerView },
  overview: { label: '概览', comp: OverviewView },
  write: { label: '写入', comp: WriteView },
  admin: { label: '管理', comp: AdminView },
} as const
type ViewKey = keyof typeof views

const store = useConnectionsStore()
const current = ref<ViewKey>('explorer')
const showManager = ref(false)

onMounted(async () => {
  await store.load()
  if (store.active) await store.checkHealth()
  else showManager.value = true
})
watch(() => store.activeId, () => { if (store.active) store.checkHealth() })
</script>

<template>
  <header class="topbar">
    <strong>InfluxDB3 Head</strong>
    <select :value="store.activeId" @change="store.setActive(($event.target as HTMLSelectElement).value)">
      <option v-for="c in store.connections" :key="c.id" :value="c.id">{{ c.name }}</option>
    </select>
    <button class="btn" @click="showManager = true">管理连接</button>
    <span class="dot" :class="store.health" :title="store.health === 'ok' ? `健康 v${store.version}` : store.health === 'down' ? '连接失败' : '未知'"></span>
    <span class="muted" v-if="store.version">v{{ store.version }}</span>
    <nav>
      <button v-for="(v, key) in views" :key="key" class="btn" :class="{ 'btn-primary': current === key }" @click="current = key">
        {{ v.label }}
      </button>
    </nav>
  </header>
  <main>
    <component :is="views[current].comp" />
  </main>
  <ConnectionManager v-if="showManager" @close="showManager = false" />
</template>

<style scoped>
.topbar { display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: #24292f; color: #fff; }
.topbar nav { margin-left: auto; display: flex; gap: 4px; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: #8b949e; }
.dot.ok { background: #2da44e; }
.dot.down { background: #cf222e; }
main { height: calc(100vh - 46px); overflow: auto; }
</style>
```

- [ ] **Step 4: 构建 + 全量测试**

Run: `npm run build && npm test`
Expected: 构建成功，测试全部 PASS

- [ ] **Step 5: 手动验证（里程碑 1）**

1. Chrome 打开 `chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选 `dist/`
2. 点击扩展图标，应打开新标签页
3. 首次打开自动弹出连接管理；添加本地 influxdb3 实例（`http://localhost:8181` + token），点「测试连接」应显示 ✅ 和版本号
4. 保存后顶栏出现连接下拉，健康灯为绿色

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(ui): 顶栏应用壳与连接管理（里程碑1：可连上真实实例）"
```

---

### Task 8: explorer store + DbTree + 主工作区布局

**Files:**
- Create: `src/stores/explorer.ts`, `src/components/DbTree.vue`
- Modify: `src/views/ExplorerView.vue`

- [ ] **Step 1: 实现 `src/stores/explorer.ts`（逻辑薄，不写单测：全部动作只是转发 client 并缓存）**

```ts
import { defineStore } from 'pinia'
import type { ColumnInfo } from '../api/client'
import { useConnectionsStore } from './connections'

export const useExplorerStore = defineStore('explorer', {
  state: () => ({
    databases: [] as string[],
    tablesByDb: {} as Record<string, string[]>,
    schemas: {} as Record<string, ColumnInfo[]>, // key: `${db}.${table}`
    loading: false,
    error: '',
  }),
  actions: {
    reset() {
      this.databases = []
      this.tablesByDb = {}
      this.schemas = {}
      this.error = ''
    },
    async loadDatabases() {
      this.loading = true
      this.error = ''
      try {
        this.databases = await useConnectionsStore().client().listDatabases()
      } catch (e) {
        this.error = String((e as Error).message)
      } finally {
        this.loading = false
      }
    },
    async loadTables(db: string) {
      if (this.tablesByDb[db]) return
      try {
        this.tablesByDb[db] = await useConnectionsStore().client().listTables(db)
      } catch (e) {
        this.error = String((e as Error).message)
      }
    },
    async loadSchema(db: string, table: string) {
      const key = `${db}.${table}`
      if (this.schemas[key]) return
      try {
        this.schemas[key] = await useConnectionsStore().client().tableSchema(db, table)
      } catch (e) {
        this.error = String((e as Error).message)
      }
    },
  },
})
```

- [ ] **Step 2: 实现 `src/components/DbTree.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useExplorerStore } from '../stores/explorer'

const emit = defineEmits<{ preview: [db: string, table: string] }>()
const store = useExplorerStore()
const openDbs = ref(new Set<string>())
const openTables = ref(new Set<string>())

async function toggleDb(db: string) {
  if (openDbs.value.has(db)) openDbs.value.delete(db)
  else {
    openDbs.value.add(db)
    await store.loadTables(db)
  }
}
async function toggleSchema(db: string, table: string) {
  const key = `${db}.${table}`
  if (openTables.value.has(key)) openTables.value.delete(key)
  else {
    openTables.value.add(key)
    await store.loadSchema(db, table)
  }
}
const roleIcon = { time: '🕐', tag: '🏷', field: '📈' } as const
</script>

<template>
  <div class="tree">
    <div class="tree-head">
      <span>数据库 / 表</span>
      <button class="btn" title="刷新" @click="store.reset(); store.loadDatabases()">⟳</button>
    </div>
    <p v-if="store.error" class="error-box">{{ store.error }}</p>
    <p v-else-if="store.loading" class="muted">加载中…</p>
    <ul>
      <li v-for="db in store.databases" :key="db">
        <div class="node" @click="toggleDb(db)">{{ openDbs.has(db) ? '▾' : '▸' }} 📁 {{ db }}</div>
        <ul v-if="openDbs.has(db)">
          <li v-for="t in store.tablesByDb[db] ?? []" :key="t">
            <div class="node">
              <span @click="toggleSchema(db, t)">{{ openTables.has(`${db}.${t}`) ? '▾' : '▸' }}</span>
              <span class="tname" @click="emit('preview', db, t)" :title="`预览 ${t}`">📊 {{ t }}</span>
            </div>
            <ul v-if="openTables.has(`${db}.${t}`)" class="cols">
              <li v-for="col in store.schemas[`${db}.${t}`] ?? []" :key="col.name" class="muted">
                {{ roleIcon[col.role] }} {{ col.name }} <em>{{ col.dataType }}</em>
              </li>
            </ul>
          </li>
        </ul>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.tree { padding: 8px; font-size: 13px; }
.tree-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; color: #57606a; }
ul { list-style: none; margin: 0; padding-left: 14px; }
.tree > ul { padding-left: 0; }
.node { cursor: pointer; padding: 2px 4px; border-radius: 4px; white-space: nowrap; }
.node:hover { background: #f6f8fa; }
.tname:hover { color: #0969da; text-decoration: underline; }
.cols em { font-style: normal; opacity: 0.7; font-size: 11px; }
</style>
```

- [ ] **Step 3: 更新 `src/views/ExplorerView.vue` 为左右布局（结果区暂用占位，Task 9 接入）**

```vue
<script setup lang="ts">
import { onMounted, watch } from 'vue'
import DbTree from '../components/DbTree.vue'
import { useConnectionsStore } from '../stores/connections'
import { useExplorerStore } from '../stores/explorer'

const conns = useConnectionsStore()
const explorer = useExplorerStore()

function onPreview(db: string, table: string) {
  console.log('preview', db, table) // Task 9 接入查询
}

onMounted(() => { if (conns.active) explorer.loadDatabases() })
watch(() => conns.activeId, () => { explorer.reset(); if (conns.active) explorer.loadDatabases() })
</script>

<template>
  <div class="explorer">
    <aside><DbTree @preview="onPreview" /></aside>
    <section class="work">
      <div class="muted" style="padding: 16px">查询区开发中…</div>
    </section>
  </div>
</template>

<style scoped>
.explorer { display: flex; height: 100%; }
aside { width: 280px; min-width: 280px; border-right: 1px solid #d0d7de; overflow: auto; }
.work { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
</style>
```

- [ ] **Step 4: 构建 + 手动验证**

Run: `npm run build && npm test`
Expected: 构建成功、测试 PASS。Chrome 里刷新扩展（`chrome://extensions` → 重新加载 → 重开标签页）：左树列出数据库；展开显示表；再展开表显示列（🕐/🏷/📈 区分角色）；点表名控制台打印 preview。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(ui): 数据库/表树与主工作区布局（里程碑2：结构浏览）"
```

---

### Task 9: 查询历史纯函数（TDD）+ query store + QueryEditor + ResultsTable

**Files:**
- Create: `src/lib/history.ts`, `src/stores/query.ts`, `src/components/QueryEditor.vue`, `src/components/ResultsTable.vue`
- Modify: `src/views/ExplorerView.vue`
- Test: `tests/lib/history.test.ts`

- [ ] **Step 1: 写失败的测试**

`tests/lib/history.test.ts`:

```ts
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

  it('超过上限截断到 50 条', () => {
    const list = Array.from({ length: 50 }, (_, i) => e(`q${i}`))
    expect(pushHistory(list, e('new'))).toHaveLength(50)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/lib/history.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 `src/lib/history.ts`**

```ts
export interface HistoryEntry {
  q: string
  db: string
  language: 'sql' | 'influxql'
  at: number
}

export function pushHistory(list: HistoryEntry[], entry: HistoryEntry, max = 50): HistoryEntry[] {
  const rest = list.filter(
    (h) => !(h.q === entry.q && h.db === entry.db && h.language === entry.language),
  )
  return [entry, ...rest].slice(0, max)
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/lib/history.test.ts`
Expected: PASS

- [ ] **Step 5: 实现 `src/stores/query.ts`**

```ts
import { defineStore } from 'pinia'
import { ApiError, type QueryResult } from '../api/client'
import { pushHistory, type HistoryEntry } from '../lib/history'
import { storageGet, storageSet } from '../lib/storage'
import { useConnectionsStore } from './connections'

const HISTORY_KEY = 'queryHistory'

export const useQueryStore = defineStore('query', {
  state: () => ({
    db: '',
    language: 'sql' as 'sql' | 'influxql',
    text: '',
    running: false,
    result: null as QueryResult | null,
    error: '',
    history: [] as HistoryEntry[],
  }),
  actions: {
    async loadHistory() {
      this.history = await storageGet<HistoryEntry[]>(HISTORY_KEY, [])
    },
    async run() {
      if (!this.db || !this.text.trim() || this.running) return
      this.running = true
      this.error = ''
      try {
        const client = useConnectionsStore().client()
        this.result =
          this.language === 'sql'
            ? await client.querySql(this.db, this.text)
            : await client.queryInfluxql(this.db, this.text)
        this.history = pushHistory(this.history, {
          q: this.text, db: this.db, language: this.language, at: Date.now(),
        })
        await storageSet(HISTORY_KEY, this.history)
      } catch (e) {
        this.result = null
        this.error = e instanceof ApiError ? `${e.message}${e.detail ? `\n${e.detail}` : ''}` : String(e)
      } finally {
        this.running = false
      }
    },
    async preview(db: string, table: string) {
      this.db = db
      this.language = 'sql'
      this.text = `SELECT * FROM "${table}" ORDER BY time DESC LIMIT 100`
      await this.run()
    },
  },
})
```

- [ ] **Step 6: 实现 `src/components/QueryEditor.vue`（CodeMirror 6）**

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { keymap } from '@codemirror/view'
import { Prec, Compartment } from '@codemirror/state'
import { sql } from '@codemirror/lang-sql'

const model = defineModel<string>({ required: true })
const emit = defineEmits<{ run: [] }>()

const host = ref<HTMLElement>()
let view: EditorView | undefined
const langConf = new Compartment()

onMounted(() => {
  view = new EditorView({
    parent: host.value!,
    doc: model.value,
    extensions: [
      basicSetup,
      langConf.of(sql()),
      Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => { emit('run'); return true } }])),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) model.value = u.state.doc.toString()
      }),
    ],
  })
})
onUnmounted(() => view?.destroy())

watch(model, (v) => {
  if (view && v !== view.state.doc.toString()) {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } })
  }
})
</script>

<template>
  <div ref="host" class="editor"></div>
</template>

<style scoped>
.editor { border: 1px solid #d0d7de; border-radius: 6px; overflow: auto; max-height: 220px; min-height: 90px; }
.editor :deep(.cm-editor) { min-height: 90px; }
</style>
```

- [ ] **Step 7: 实现 `src/components/ResultsTable.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { QueryResult } from '../api/client'

const props = defineProps<{ result: QueryResult }>()
const MAX_RENDER = 1000
const shown = computed(() => props.result.rows.slice(0, MAX_RENDER))
</script>

<template>
  <div class="wrap">
    <table class="grid">
      <thead>
        <tr><th v-for="c in result.columns" :key="c">{{ c }}</th></tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in shown" :key="i">
          <td v-for="(cell, j) in row" :key="j">{{ cell ?? '' }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="result.rows.length > MAX_RENDER" class="muted">
      仅渲染前 {{ MAX_RENDER }} 行（共 {{ result.rows.length }} 行），完整数据请导出
    </p>
  </div>
</template>

<style scoped>
.wrap { overflow: auto; height: 100%; }
</style>
```

- [ ] **Step 8: 更新 `src/views/ExplorerView.vue` 接入查询**

```vue
<script setup lang="ts">
import { onMounted, watch } from 'vue'
import DbTree from '../components/DbTree.vue'
import QueryEditor from '../components/QueryEditor.vue'
import ResultsTable from '../components/ResultsTable.vue'
import { useConnectionsStore } from '../stores/connections'
import { useExplorerStore } from '../stores/explorer'
import { useQueryStore } from '../stores/query'

const conns = useConnectionsStore()
const explorer = useExplorerStore()
const query = useQueryStore()

function pickHistory(ev: Event) {
  const i = Number((ev.target as HTMLSelectElement).value)
  const h = query.history[i]
  if (!h) return
  query.db = h.db
  query.language = h.language
  query.text = h.q
  ;(ev.target as HTMLSelectElement).value = ''
}

onMounted(async () => {
  await query.loadHistory()
  if (conns.active) {
    await explorer.loadDatabases()
    if (!query.db) query.db = conns.active.defaultDb || explorer.databases[0] || ''
  }
})
watch(() => conns.activeId, async () => {
  explorer.reset()
  if (conns.active) {
    await explorer.loadDatabases()
    query.db = conns.active.defaultDb || explorer.databases[0] || ''
  }
})
</script>

<template>
  <div class="explorer">
    <aside><DbTree @preview="(db, t) => query.preview(db, t)" /></aside>
    <section class="work">
      <div class="toolbar">
        <select v-model="query.db">
          <option v-for="db in explorer.databases" :key="db" :value="db">{{ db }}</option>
        </select>
        <select v-model="query.language">
          <option value="sql">SQL</option>
          <option value="influxql">InfluxQL</option>
        </select>
        <button class="btn btn-primary" :disabled="query.running" @click="query.run()">
          {{ query.running ? '运行中…' : '运行 (⌘⏎)' }}
        </button>
        <select @change="pickHistory" value="">
          <option value="" disabled>历史查询…</option>
          <option v-for="(h, i) in query.history" :key="h.at" :value="i">
            [{{ h.language }}/{{ h.db }}] {{ h.q.slice(0, 60) }}
          </option>
        </select>
      </div>
      <QueryEditor v-model="query.text" @run="query.run()" class="qe" />
      <div class="results">
        <p v-if="query.error" class="error-box">{{ query.error }}</p>
        <template v-else-if="query.result">
          <p class="muted">{{ query.result.rows.length }} 行 · {{ query.result.durationMs.toFixed(0) }} ms</p>
          <ResultsTable :result="query.result" />
        </template>
        <p v-else class="muted">点击左侧表名预览数据，或输入查询后运行</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.explorer { display: flex; height: 100%; }
aside { width: 280px; min-width: 280px; border-right: 1px solid #d0d7de; overflow: auto; }
.work { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 8px; gap: 8px; }
.toolbar { display: flex; gap: 8px; align-items: center; }
.results { flex: 1; overflow: auto; }
</style>
```

- [ ] **Step 9: 构建 + 全量测试 + 手动验证**

Run: `npm run build && npm test`
Expected: PASS。Chrome 重载扩展验证：点表名自动预览 100 行；手写 SQL 后 ⌘⏎ 执行；切 InfluxQL 执行 `SELECT * FROM <表> LIMIT 5`；错误 SQL 内联显示 InfluxDB 错误详情；历史下拉可回填。

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat(query): 查询编辑器、结果表格与历史"
```

---

### Task 10: 导出（TDD）+ 折线图（TDD）

**Files:**
- Create: `src/lib/export.ts`, `src/lib/chart.ts`, `src/components/ResultsChart.vue`
- Modify: `src/views/ExplorerView.vue`
- Test: `tests/lib/export.test.ts`, `tests/lib/chart.test.ts`

- [ ] **Step 1: 写失败的导出测试**

`tests/lib/export.test.ts`:

```ts
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
```

- [ ] **Step 2: 写失败的图表测试**

`tests/lib/chart.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toChartData } from '../../src/lib/chart'

const result = (columns: string[], rows: unknown[][]) => ({ columns, rows, durationMs: 0 })

describe('toChartData', () => {
  it('无 time 列返回 null', () => {
    expect(toChartData(result(['a'], [[1]]))).toBeNull()
  })

  it('无数值列返回 null', () => {
    expect(toChartData(result(['time', 's'], [['2026-01-01T00:00:00Z', 'x']]))).toBeNull()
  })

  it('提取数值列为序列，x 轴为秒且按时间升序', () => {
    const d = toChartData(result(
      ['time', 'temp', 'name'],
      [
        ['2026-01-01T00:01:00Z', 22, 'b'],
        ['2026-01-01T00:00:00Z', 21, 'a'],
      ],
    ))!
    expect(d.series.map((s) => s.label)).toEqual(['temp'])
    expect(d.x).toEqual([Date.parse('2026-01-01T00:00:00Z') / 1000, Date.parse('2026-01-01T00:01:00Z') / 1000])
    expect(d.series[0].values).toEqual([21, 22])
  })

  it('数值列中的非数值单元记为 null', () => {
    const d = toChartData(result(['time', 'v'], [['2026-01-01T00:00:00Z', 1], ['2026-01-01T00:01:00Z', 'bad']]))!
    expect(d.series[0].values).toEqual([1, null])
  })
})
```

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run tests/lib`
Expected: FAIL（两个文件都缺实现）

- [ ] **Step 4: 实现 `src/lib/export.ts`**

```ts
import type { QueryResult } from '../api/client'

function esc(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

export function toCsv(result: QueryResult): string {
  const head = result.columns.map(esc).join(',')
  const body = result.rows.map((r) => r.map(esc).join(','))
  return [head, ...body].join('\n')
}

export function toJson(result: QueryResult): string {
  const objs = result.rows.map((r) =>
    Object.fromEntries(result.columns.map((c, i) => [c, r[i]])),
  )
  return JSON.stringify(objs, null, 2)
}

export function download(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 5: 实现 `src/lib/chart.ts`**

```ts
import type { QueryResult } from '../api/client'

export interface ChartData {
  x: number[] // epoch 秒
  series: { label: string; values: (number | null)[] }[]
}

function parseTime(v: unknown): number | null {
  if (typeof v === 'number') {
    // 纳秒时间戳 → 毫秒；其余按毫秒处理
    return v > 5e15 ? v / 1e6 : v
  }
  if (typeof v === 'string') {
    const ms = Date.parse(v)
    return Number.isNaN(ms) ? null : ms
  }
  return null
}

export function toChartData(result: QueryResult): ChartData | null {
  const ti = result.columns.indexOf('time')
  if (ti < 0) return null

  const numericIdx = result.columns
    .map((_, i) => i)
    .filter((i) => i !== ti && result.rows.some((r) => typeof r[i] === 'number'))
  if (!numericIdx.length) return null

  const points = result.rows
    .map((r) => ({ t: parseTime(r[ti]), r }))
    .filter((p): p is { t: number; r: unknown[] } => p.t != null)
    .sort((a, b) => a.t - b.t)
  if (!points.length) return null

  return {
    x: points.map((p) => p.t / 1000),
    series: numericIdx.map((i) => ({
      label: result.columns[i],
      values: points.map((p) => (typeof p.r[i] === 'number' ? (p.r[i] as number) : null)),
    })),
  }
}
```

- [ ] **Step 6: 运行确认通过**

Run: `npx vitest run tests/lib`
Expected: PASS

- [ ] **Step 7: 实现 `src/components/ResultsChart.vue`**

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import uPlot from 'uplot'
import type { ChartData } from '../lib/chart'

const props = defineProps<{ data: ChartData }>()
const host = ref<HTMLElement>()
let plot: uPlot | undefined

const COLORS = ['#0969da', '#cf222e', '#2da44e', '#bf8700', '#8250df', '#bc4c00']

function render() {
  plot?.destroy()
  if (!host.value) return
  plot = new uPlot(
    {
      width: host.value.offsetWidth || 800,
      height: 320,
      series: [
        {},
        ...props.data.series.map((s, i) => ({
          label: s.label,
          stroke: COLORS[i % COLORS.length],
          width: 1.5,
        })),
      ],
    },
    [props.data.x, ...props.data.series.map((s) => s.values)] as uPlot.AlignedData,
    host.value,
  )
}

onMounted(render)
watch(() => props.data, render)
onUnmounted(() => plot?.destroy())
</script>

<template>
  <div ref="host"></div>
</template>
```

- [ ] **Step 8: 在 `src/views/ExplorerView.vue` 接入图表与导出**

script 部分追加 import 与状态：

```ts
import { computed, ref } from 'vue'
import ResultsChart from '../components/ResultsChart.vue'
import { toChartData } from '../lib/chart'
import { toCsv, toJson, download } from '../lib/export'

const viewMode = ref<'table' | 'chart'>('table')
const chartData = computed(() => (query.result ? toChartData(query.result) : null))
```

（注意与已有 `import { onMounted, watch } from 'vue'` 合并为一条 vue import。）

template 中把结果区替换为：

```html
      <div class="results">
        <p v-if="query.error" class="error-box">{{ query.error }}</p>
        <template v-else-if="query.result">
          <div class="toolbar">
            <span class="muted">{{ query.result.rows.length }} 行 · {{ query.result.durationMs.toFixed(0) }} ms</span>
            <button class="btn" :class="{ 'btn-primary': viewMode === 'table' }" @click="viewMode = 'table'">表格</button>
            <button class="btn" :class="{ 'btn-primary': viewMode === 'chart' }" :disabled="!chartData" @click="viewMode = 'chart'"
              :title="chartData ? '' : '结果需包含 time 列和数值列'">折线图</button>
            <button class="btn" @click="download('result.csv', toCsv(query.result!), 'text/csv')">导出 CSV</button>
            <button class="btn" @click="download('result.json', toJson(query.result!), 'application/json')">导出 JSON</button>
          </div>
          <ResultsChart v-if="viewMode === 'chart' && chartData" :data="chartData" />
          <ResultsTable v-else :result="query.result" />
        </template>
        <p v-else class="muted">点击左侧表名预览数据，或输入查询后运行</p>
      </div>
```

- [ ] **Step 9: 构建 + 全量测试 + 手动验证（里程碑 3）**

Run: `npm run build && npm test`
Expected: PASS。Chrome 重载扩展：查询含 time 的表后可切换折线图；导出 CSV/JSON 能下载且内容正确。

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat(results): 折线图与 CSV/JSON 导出（里程碑3：查询完整）"
```

---

### Task 11: WriteView + AdminView

**Files:**
- Modify: `src/views/WriteView.vue`, `src/views/AdminView.vue`

- [ ] **Step 1: 实现 `src/views/WriteView.vue`**

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ApiError } from '../api/client'
import { useConnectionsStore } from '../stores/connections'
import { useExplorerStore } from '../stores/explorer'

const conns = useConnectionsStore()
const explorer = useExplorerStore()
const db = ref('')
const precision = ref<'auto' | 'nanosecond' | 'microsecond' | 'millisecond' | 'second'>('auto')
const body = ref('')
const msg = ref('')

onMounted(async () => {
  if (!explorer.databases.length && conns.active) await explorer.loadDatabases()
  db.value = conns.active?.defaultDb || explorer.databases[0] || ''
})

async function submit() {
  if (!db.value || !body.value.trim()) return
  msg.value = '写入中…'
  try {
    await conns.client().writeLineProtocol(db.value, body.value, precision.value)
    msg.value = '✅ 写入成功'
  } catch (e) {
    msg.value = `❌ ${e instanceof ApiError ? `${e.message}${e.detail ? `：${e.detail}` : ''}` : String(e)}`
  }
}
</script>

<template>
  <div class="page">
    <h3>写入数据（Line Protocol）</h3>
    <div class="row">
      <label>数据库
        <select v-model="db">
          <option v-for="d in explorer.databases" :key="d" :value="d">{{ d }}</option>
        </select>
      </label>
      <label>时间精度
        <select v-model="precision">
          <option v-for="p in ['auto', 'nanosecond', 'microsecond', 'millisecond', 'second']" :key="p" :value="p">{{ p }}</option>
        </select>
      </label>
    </div>
    <textarea v-model="body" rows="10" spellcheck="false"
      placeholder="measurement,tag1=a field1=1.0,field2=2i 1735545600000000000&#10;每行一条，格式：表名,标签集 字段集 [时间戳]"></textarea>
    <div class="row">
      <button class="btn btn-primary" @click="submit">写入</button>
      <span class="muted" style="white-space: pre-wrap">{{ msg }}</span>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 16px; display: flex; flex-direction: column; gap: 12px; max-width: 800px; }
.row { display: flex; gap: 16px; align-items: center; }
textarea { font-family: ui-monospace, monospace; }
</style>
```

- [ ] **Step 2: 实现 `src/views/AdminView.vue`**

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ApiError } from '../api/client'
import { useConnectionsStore } from '../stores/connections'
import { useExplorerStore } from '../stores/explorer'

const conns = useConnectionsStore()
const explorer = useExplorerStore()
const newDb = ref('')
const confirmName = ref('')
const deleting = ref('') // 正在确认删除的库名
const msg = ref('')

onMounted(() => { if (conns.active) { explorer.reset(); explorer.loadDatabases() } })

async function create() {
  if (!newDb.value) return
  try {
    await conns.client().createDatabase(newDb.value)
    msg.value = `✅ 已创建 ${newDb.value}`
    newDb.value = ''
    explorer.reset()
    await explorer.loadDatabases()
  } catch (e) {
    msg.value = `❌ ${e instanceof ApiError ? `${e.message}${e.detail ? `：${e.detail}` : ''}` : String(e)}`
  }
}

async function doDelete(db: string) {
  if (confirmName.value !== db) return
  try {
    await conns.client().deleteDatabase(db)
    msg.value = `✅ 已删除 ${db}`
    deleting.value = ''
    confirmName.value = ''
    explorer.reset()
    await explorer.loadDatabases()
  } catch (e) {
    msg.value = `❌ ${e instanceof ApiError ? `${e.message}${e.detail ? `：${e.detail}` : ''}` : String(e)}`
  }
}
</script>

<template>
  <div class="page">
    <h3>数据库管理</h3>
    <div class="row">
      <input v-model="newDb" placeholder="新数据库名" />
      <button class="btn btn-primary" @click="create">创建</button>
      <span class="muted">{{ msg }}</span>
    </div>
    <table class="grid">
      <thead><tr><th>数据库</th><th style="width: 380px">操作</th></tr></thead>
      <tbody>
        <tr v-for="db in explorer.databases" :key="db">
          <td>{{ db }}</td>
          <td>
            <template v-if="deleting === db">
              <input v-model="confirmName" :placeholder="`输入 ${db} 确认删除`" />
              <button class="btn btn-danger" :disabled="confirmName !== db" @click="doDelete(db)">确认删除</button>
              <button class="btn" @click="deleting = ''; confirmName = ''">取消</button>
            </template>
            <button v-else class="btn btn-danger" @click="deleting = db; confirmName = ''">删除…</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.page { padding: 16px; display: flex; flex-direction: column; gap: 12px; max-width: 800px; }
.row { display: flex; gap: 8px; align-items: center; }
</style>
```

- [ ] **Step 3: 构建 + 手动验证**

Run: `npm run build && npm test`
Expected: PASS。Chrome 重载扩展：写入页写一条 `demo,src=test val=1`，成功后在工作区能查到；管理页创建库、删除库（必须输入库名才能确认）。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(ui): line protocol 写入与数据库管理"
```

---

### Task 12: OverviewView + README + 最终验收

**Files:**
- Modify: `src/views/OverviewView.vue`
- Create: `README.md`

- [ ] **Step 1: 实现 `src/views/OverviewView.vue`**

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useConnectionsStore } from '../stores/connections'

const conns = useConnectionsStore()
const dbStats = ref<{ db: string; tables: number }[]>([])
const error = ref('')

onMounted(async () => {
  if (!conns.active) return
  try {
    const client = conns.client()
    const dbs = await client.listDatabases()
    dbStats.value = await Promise.all(
      dbs.map(async (db) => ({ db, tables: (await client.listTables(db)).length })),
    )
  } catch (e) {
    error.value = String((e as Error).message)
  }
})
</script>

<template>
  <div class="page">
    <h3>概览</h3>
    <div class="stats">
      <div class="stat"><span class="muted">连接</span><b>{{ conns.active?.name ?? '—' }}</b></div>
      <div class="stat"><span class="muted">状态</span><b>{{ conns.health === 'ok' ? '健康' : conns.health === 'down' ? '不可用' : '未知' }}</b></div>
      <div class="stat"><span class="muted">版本</span><b>{{ conns.version || '—' }}</b></div>
      <div class="stat"><span class="muted">数据库</span><b>{{ dbStats.length }}</b></div>
    </div>
    <p v-if="error" class="error-box">{{ error }}</p>
    <table class="grid" v-else>
      <thead><tr><th>数据库</th><th>表数量</th></tr></thead>
      <tbody>
        <tr v-for="s in dbStats" :key="s.db"><td>{{ s.db }}</td><td>{{ s.tables }}</td></tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.page { padding: 16px; display: flex; flex-direction: column; gap: 12px; max-width: 800px; }
.stats { display: flex; gap: 12px; }
.stat { border: 1px solid #d0d7de; border-radius: 6px; padding: 12px 20px; display: flex; flex-direction: column; gap: 4px; min-width: 120px; }
</style>
```

- [ ] **Step 2: 写 `README.md`**

```markdown
# InfluxDB3 Head

类似 elasticsearch-head 的 Chrome 扩展，用于可视化管理自建 InfluxDB 3.x（Core / Enterprise）。

## 功能

- 多连接管理（地址 + Token，支持测试连接）
- 数据库 / 表树形浏览，表结构（time / tag / field）
- SQL 与 InfluxQL 查询：结果表格、时序折线图、CSV / JSON 导出、查询历史
- Line Protocol 写入
- 创建 / 删除数据库（删除需输入库名二次确认）

## 安装

```bash
npm install
npm run build
```

Chrome 打开 `chrome://extensions` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选择 `dist/` 目录。点击工具栏扩展图标即可打开。

## 开发

```bash
npm run dev    # 浏览器直接访问 dev server 页面调试（存储降级到 localStorage）
npm test       # 单元测试
```

## 安全说明

连接 Token 以明文保存在 `chrome.storage.local`（仅本机、仅本扩展可读）。请勿在共享电脑上保存生产环境 Token。

## 兼容性

仅支持 InfluxDB 3.x 的 `/api/v3` 接口（Core / Enterprise），不支持 1.x / 2.x / InfluxDB Cloud。
```

- [ ] **Step 3: 最终验收**

Run: `npm run build && npm test`
Expected: 全部 PASS。按 README 全新加载 `dist/`，走查验收清单：

1. 新装无连接 → 自动弹连接管理；测试连接 ✅；保存后健康灯绿
2. 左树：库 → 表 → 列（角色图标正确）；刷新按钮工作
3. 点表名 → 自动预览最新 100 行
4. SQL / InfluxQL 各执行一次；语法错误内联显示详情；⌘⏎ 快捷键；历史回填
5. 含 time 的结果可切折线图；CSV / JSON 导出内容正确
6. 写入一条数据后能查到；错误的 line protocol 显示错误详情
7. 建库 → 出现在树中；删库需输入库名确认
8. 概览页显示版本、库数、每库表数
9. 断开数据库（停容器）→ 健康灯红、操作报网络错误而非白屏

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: 概览页与 README（里程碑4：功能完整）"
```

---

## 自查记录

- **Spec 覆盖**：多连接管理(T6/T7)、健康概览(T2/T7/T12)、结构浏览(T3/T8)、SQL+InfluxQL 查询(T4/T9)、表格+折线图(T9/T10)、导出(T10)、历史(T9)、写入(T5/T11)、建删库(T5/T11)、错误处理(T2 统一 ApiError + 各视图内联展示)、删除二次确认(T11)、超时(T2)——全部有对应任务。
- **构建方式与 spec 的差异**（CRXJS → 静态 manifest）已在头部声明并同步修订 spec。
- **类型一致性**：`QueryResult{columns,rows,durationMs}`、`ColumnInfo{name,dataType,role}`、`SavedConnection`、`HistoryEntry`、`ChartData` 在各任务间引用一致。
