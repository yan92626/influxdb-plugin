# Changelog

本项目的所有重要变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.1.1] - 2026-07-29

### Added

- 查询页面支持选择并持久化 IANA 时区。
- 查询历史记录所使用的时区，并在回填查询时恢复。
- Release 打包生成 zip 与 SHA-256 校验文件。

### Fixed

- 将 InfluxDB SQL 返回的无时区后缀时间戳按 UTC 解析。
- 切换时区时立即基于原始数据刷新结果，避免重复转换造成累计偏移。
- 自动追加的 `LIMIT` 保持在 InfluxQL `tz()` 子句之前。

## [0.1.0] - 2026-07-27

### Added

- Chrome Manifest V3 扩展基础框架。
- InfluxDB 3 Core / Enterprise 多连接管理与健康检查。
- 数据库、表和字段浏览，支持受限 token 的默认数据库降级。
- SQL 与 InfluxQL 查询编辑器、历史记录和查询防护。
- 表格与时序折线图展示，以及 CSV / JSON 导出。
- Line Protocol 写入和数据库创建、删除管理。
