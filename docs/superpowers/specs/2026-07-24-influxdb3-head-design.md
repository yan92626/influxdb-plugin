# InfluxDB3 Head — Chrome 扩展设计文档

日期：2026-07-24
状态：已与用户确认

## 1. 目标与范围

一个类似 elasticsearch-head 的 Chrome 浏览器扩展，用于可视化管理自建 InfluxDB 3.x（Core / Enterprise）实例。

**支持范围**

- 仅 InfluxDB 3.x（`/api/v3` 接口族），不支持 1.x、2.x、InfluxDB Cloud
- 仅 Chrome（Manifest V3），通过开发者模式本地加载分发，不上架商店

**功能清单**

1. 多连接管理：保存多个实例的名称、HTTP 地址、token、默认数据库，快速切换，支持测试连接
2. 健康/概览页：实例健康状态（`/health`）、版本（`/ping`）、数据库数、表数
3. 结构浏览：数据库 → 表 树形导航；表结构（列名、类型，区分 tag / field / time）
4. 查询：SQL 与 InfluxQL 双语言编辑器；结果表格 + 时序折线图；CSV / JSON 导出；查询历史（最近 50 条）
5. 写入：Line Protocol 文本写入
6. 管理：创建 / 删除数据库（删除需二次确认）

## 2. 整体架构

- **形态**：MV3 扩展。点击扩展图标（`chrome.action.onClicked`）打开完整标签页应用 `index.html`。Service worker 仅负责打开标签页，无其他后台逻辑，无 content script。
- **技术栈**：Vue 3 + TypeScript + Vite、Pinia 状态管理、CodeMirror 6（查询编辑器）、uPlot（折线图，轻量且时序渲染性能好）。构建方式：静态 `manifest.json` 与 `background.js` 放 `public/` 目录由 Vite 原样拷贝，页面走普通 Vite 构建（本项目无 content script、background 仅数行，无需 CRXJS 类扩展构建插件）。
- **CORS 方案**：`host_permissions: ["http://*/*", "https://*/*"]`。扩展页面在此权限下可直接 `fetch` 任意 InfluxDB 地址，无需后台代理。
- **存储**：连接配置与查询历史存 `chrome.storage.local`。token 明文存储——本地自用场景可接受，README 中注明风险。

## 3. 模块划分

```
src/
├── (public/manifest.json)  # MV3 静态 manifest
├── (public/background.js)  # 仅 action.onClicked → 打开标签页
├── api/
│   └── client.ts           # InfluxDB3Client：唯一 HTTP 层
├── stores/
│   ├── connections.ts      # 连接 CRUD、当前连接、健康状态
│   ├── explorer.ts         # 数据库/表树、表结构缓存
│   └── query.ts            # 查询标签、执行状态、结果、历史
├── views/
│   ├── ExplorerView.vue    # 主工作区：左树 + 右编辑器/结果
│   ├── OverviewView.vue    # 概览
│   ├── WriteView.vue       # Line Protocol 写入
│   └── AdminView.vue       # 建库/删库
└── components/
    ├── ConnectionManager.vue  # 连接管理弹窗（含测试连接）
    ├── DbTree.vue             # 数据库/表树（懒加载）
    ├── QueryEditor.vue        # CodeMirror 6，SQL/InfluxQL 切换
    ├── ResultsTable.vue       # 结果表格
    ├── ResultsChart.vue       # uPlot 折线图
    └── ExportButtons.vue      # CSV / JSON 导出
```

每个模块单一职责：views 只组织布局，components 只渲染与交互，stores 持有状态与业务动作，api 层屏蔽全部 HTTP 细节（可独立单测）。

## 4. API 层接口

`InfluxDB3Client`（构造参数：baseUrl、token、timeout 默认 30s）：

| 方法 | HTTP 调用 |
|---|---|
| `health()` | `GET /health` |
| `ping()` | `GET /ping`（取版本号） |
| `listDatabases()` | `GET /api/v3/configure/database?format=json` |
| `listTables(db)` | `POST /api/v3/query_sql` 查 `information_schema.tables` |
| `tableSchema(db, table)` | `POST /api/v3/query_sql` 查 `information_schema.columns` |
| `querySql(db, q)` | `POST /api/v3/query_sql`（`format: json`） |
| `queryInfluxql(db, q)` | `POST /api/v3/query_influxql`（`format: json`） |
| `writeLineProtocol(db, body)` | `POST /api/v3/write_lp?db=<db>` |
| `createDatabase(db)` | `POST /api/v3/configure/database` |
| `deleteDatabase(db)` | `DELETE /api/v3/configure/database?db=<db>` |

认证统一 `Authorization: Bearer <token>` 请求头。实现前需对照目标实例实际版本核对各接口的请求/响应细节。

## 5. 界面布局（用户已选定：左侧树 + 主工作区）

- **顶栏**：产品名 | 连接切换下拉（含「管理连接」入口）| 健康状态灯 | 视图切换（工作区 / 概览 / 写入 / 管理）
- **主工作区（ExplorerView，默认视图）**：
  - 左侧固定宽度侧栏：数据库 → 表 树，懒加载；点击表名自动生成并执行 `SELECT * FROM "<table>" ORDER BY time DESC LIMIT 100` 预览；展开表节点显示列结构
  - 右侧上下分栏：上为查询编辑器（语言切换、运行按钮、Cmd/Ctrl+Enter 执行、历史下拉），下为结果区（表格 / 折线图切换、行数与耗时、导出按钮）
  - 折线图仅当结果包含 time 列且存在数值列时可用；x 轴 time，其余数值列各为一条线
- **概览 / 写入 / 管理**：由顶栏切换的独立视图

## 6. 数据流

单向：组件事件 → Pinia action → `InfluxDB3Client` 请求 → 结果写入 store → 组件响应式渲染。组件不直接调用 api 层。

## 7. 错误处理

- 统一 `ApiError` 类型，区分三类：网络不可达 / 超时；401/403（token 无效）；4xx 业务错误（携带 InfluxDB 返回的错误 JSON 详情）
- 查询、写入错误：内联展示在结果区（保留原始错误信息，方便排查语法）
- 连接级错误：顶栏状态灯变红 + toast
- 删除数据库：必须输入库名确认
- 所有请求带 AbortController 超时控制

## 8. 测试策略

- **Vitest 单测**：api client（mock `fetch`，覆盖每个方法的成功/401/4xx/超时分支）、CSV 导出的转义逻辑、查询历史去重与上限逻辑
- **手动验收**：Docker 启动 `influxdb3 serve`，Chrome 加载 `dist/` 解包扩展，按功能清单逐项走查

## 9. 里程碑

1. **骨架**：Vite + CRXJS 构建链、manifest、连接管理 + 测试连接 + 健康检查（能连上真实实例）
2. **浏览**：数据库/表树、表结构、点表预览
3. **查询**：编辑器、结果表格、折线图、导出、历史
4. **写入 + 管理 + 概览**

## 10. 明确不做（YAGNI）

- Firefox / Safari 适配
- InfluxDB 1.x / 2.x / Cloud 兼容
- 复杂仪表盘、多图表布局、告警
- token 加密存储
- Chrome 商店上架流程
