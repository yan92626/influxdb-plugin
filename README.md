# InfluxDB3 Head

[English](README_EN.md) | 简体中文

InfluxDB3 Head 是一个用于管理自建 InfluxDB 3.x 的 Chrome 浏览器扩展。它提供类似 elasticsearch-head 的可视化操作界面，让用户无需频繁编写命令行请求，即可浏览数据库结构、执行查询、分析时序数据、写入数据和管理数据库。

项目面向 InfluxDB 3 Core 和 InfluxDB 3 Enterprise，适合本地开发、测试环境排查和日常运维使用。

## 主要功能

### 连接管理

- 保存和切换多个 InfluxDB 实例。
- 使用地址和 API Token 测试连接，并显示实例版本及健康状态。
- 支持配置默认数据库，兼容无法调用列库接口的受限 Token。
- 连接信息保存在 Chrome 本地扩展存储中。

### 数据库与表浏览

- 以树形结构浏览数据库、表和列。
- 区分时间列、Tag 和 Field。
- 点击表名即可按所选时间范围预览最近数据。
- 在概览页面查看实例状态、版本和各数据库的表数量。

### 查询与数据分析

- 支持 SQL 和 InfluxQL 查询。
- 支持选择 IANA 时区，查询结果、图表横轴和悬停时间使用同一时区。
- 支持 `Command/Ctrl + Enter` 快捷执行查询。
- 自动保存最近的查询历史，并恢复数据库、查询语言和时区。
- 查询结果可使用表格或时序折线图查看，并导出为 CSV 或 JSON。
- 折线图支持选择指标、按维度拆分序列、时间聚合、序列显隐、统计信息和缩放。

### 数据写入与管理

- 使用 Line Protocol 写入数据，并选择时间精度。
- 创建数据库。
- 删除数据库时要求输入数据库名称二次确认。
- 对危险查询、无时间范围查询和无 `LIMIT` 查询提供安全防护。

## 兼容性

- Google Chrome 或其他支持加载 Chrome Manifest V3 扩展的浏览器。
- 自建 InfluxDB 3 Core 或 InfluxDB 3 Enterprise。
- 使用 InfluxDB 3.x `/api/v3` 接口。
- 不支持 InfluxDB 1.x、InfluxDB 2.x 和 InfluxDB Cloud。

## 安装

推荐直接从 GitHub Releases 安装；需要开发或修改源码时再从源码构建。

### 从 GitHub Release 安装

1. 打开项目的 [GitHub Releases](https://github.com/yan92626/influxdb-plugin/releases)。
2. 下载最新版本的以下两个文件：
   - `influxdb3-head-vX.Y.Z.zip`
   - `influxdb3-head-vX.Y.Z.zip.sha256`
3. 可选但推荐：在两个文件所在目录校验压缩包。

   ```bash
   shasum -a 256 -c influxdb3-head-vX.Y.Z.zip.sha256
   ```

4. 将 zip 解压到一个固定目录。扩展安装后不要移动或删除该目录。
5. 在 Chrome 地址栏打开 `chrome://extensions`。
6. 开启右上角的“开发者模式”。
7. 点击“加载已解压的扩展程序”，选择刚才解压的目录。
8. 在浏览器工具栏的扩展菜单中找到 InfluxDB3 Head，建议将其固定到工具栏。

### 从源码安装

需要 Node.js 22 或更高版本、npm 和 Google Chrome。

```bash
git clone https://github.com/yan92626/influxdb-plugin.git
cd influxdb-plugin
npm ci
npm run build
```

构建完成后，在 `chrome://extensions` 中选择“加载已解压的扩展程序”，并选择项目的 `dist/` 目录。

代码更新并重新构建后，需要在扩展管理页面点击“重新加载”，再重新打开已有的扩展页面。

## 首次配置

首次打开扩展时会自动显示连接管理窗口。填写以下信息：

| 配置项 | 说明 | 示例 |
| --- | --- | --- |
| 名称 | 用于区分开发、测试或生产环境 | `监控测试库` |
| 地址 | InfluxDB 3 服务地址，必须包含 `http://` 或 `https://` | `http://127.0.0.1:8181` |
| Token | InfluxDB 3 API Token，不要添加 `Bearer ` 前缀 | `apiv3_xxx...` |
| 默认数据库 | 可选；受限 Token 无法列出数据库时建议填写 | `monitoring` |

点击“测试连接”，确认显示健康状态和版本号后保存。之后可以通过页面顶部的连接下拉框切换实例。

## 使用方法

### 浏览和预览数据

1. 进入“工作区”。
2. 在左侧展开数据库和表。
3. 展开表可查看列结构；点击表名可生成并执行最近数据预览查询。
4. 使用“预览范围”选择最近 5 分钟、1 小时、1 天等时间范围。

### 执行查询

1. 在顶部选择数据库、SQL 或 InfluxQL，以及结果时区。
2. 在编辑器中输入查询语句。
3. 点击“运行”，或按 `Command + Enter`（macOS）/ `Ctrl + Enter`（Windows、Linux）。

SQL 示例：

```sql
SELECT *
FROM "cpu"
WHERE time >= now() - INTERVAL '1 hour'
ORDER BY time DESC
LIMIT 1000
```

扩展会对查询提供以下保护：

- SELECT 未设置 `LIMIT` 时，自动追加“最大行数”配置。
- 查询没有时间条件时，执行前要求确认。
- `DROP`、`DELETE` 等危险语句执行前要求确认。

### 查看折线图

查询结果包含 `time` 列和至少一个数值列时，可以切换到“折线图”：

- 选择需要查看的数值指标。
- 使用 Tag 或其他非数值列拆分序列。
- 选择最后值、平均值、最小值或最大值聚合。
- 选择自动或固定时间粒度。
- 点击图例隐藏或显示序列。
- 拖拽框选、使用滚轮缩放，双击或点击按钮复位。

### 写入数据

进入“写入”页面，选择数据库，粘贴 Line Protocol 内容并选择时间精度后提交。Token 必须拥有目标数据库的写入权限。

```text
temperature,host=node-01 value=42.5
```

### 管理数据库

进入“管理”页面可以创建或删除数据库。相关操作通常需要管理权限；删除数据库时必须输入数据库名称进行二次确认。

## 安全说明

- Token 以明文形式保存在本机的 `chrome.storage.local` 中，不会由本项目上传到其他服务。
- 扩展会直接请求用户配置的 InfluxDB 地址。
- 不要在共享电脑上保存生产环境 Token。
- 建议按照实际用途创建最小权限 Token。

## 开发与验证

```bash
npm run dev           # 启动 Vite 开发服务器
npm test              # 运行单元测试
npm run typecheck     # 执行 TypeScript 检查
npm run version:check # 检查 package、lockfile、manifest 和 Changelog 版本
npm run package       # 在 release/ 中生成 zip 和 SHA-256 文件
```

更详细的安装排查见 [INSTALL.md](INSTALL.md)，版本变更见 [CHANGELOG.md](CHANGELOG.md)，维护者发布流程见 [RELEASING.md](RELEASING.md)。
