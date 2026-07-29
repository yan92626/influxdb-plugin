# InfluxDB3 Head

类似 elasticsearch-head 的 Chrome 扩展，用于可视化管理自建 InfluxDB 3.x（Core / Enterprise）。

## 功能

- 多连接管理（地址 + Token，支持测试连接）
- 数据库 / 表树形浏览，表结构（time / tag / field）
- SQL 与 InfluxQL 查询：IANA 时区选择、结果表格、时序折线图、CSV / JSON 导出、查询历史
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
