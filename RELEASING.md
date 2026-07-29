# 发布指南

项目使用 Semantic Versioning、Keep a Changelog 和 GitHub Releases 管理版本。
Git 仓库只保存源码、发布脚本和变更记录；zip 与校验文件由发布流程生成并上传为 Release assets，避免二进制文件持续膨胀 Git 历史。

## 版本规则

- `MAJOR`：不兼容的行为或数据格式变更。
- `MINOR`：向后兼容的新功能。
- `PATCH`：向后兼容的问题修复。

Chrome 扩展清单只接受 1-4 段数字，因此不使用 `-alpha`、`-beta` 等 SemVer 后缀。

## 准备发布

以下示例发布 `0.1.2`：

```bash
npm run version:set -- 0.1.2
```

然后编辑 `CHANGELOG.md`：

1. 保留一个空的 `## [Unreleased]`。
2. 将待发布条目移动到 `## [0.1.2] - YYYY-MM-DD`。
3. 按 `Added`、`Changed`、`Deprecated`、`Removed`、`Fixed`、`Security` 分类。

执行完整校验并生成本地制品：

```bash
npm ci
npm run version:check
npm test
npm run typecheck
npm run package
```

输出位于 `release/`：

```text
influxdb3-head-v0.1.2.zip
influxdb3-head-v0.1.2.zip.sha256
```

在制品目录中验证校验和：

```bash
cd release
shasum -a 256 -c influxdb3-head-v0.1.2.zip.sha256
```

## 创建 Release

提交版本与 CHANGELOG 后，创建与版本一致的 annotated tag：

```bash
git add CHANGELOG.md package.json package-lock.json public/manifest.json
git commit -m "chore(release): 发布 v0.1.2"
git tag -a v0.1.2 -m "v0.1.2"
git push origin main
git push origin v0.1.2
```

推送 `v*.*.*` 标签后，`.github/workflows/release.yml` 会自动：

1. 校验 tag、项目清单和 CHANGELOG 版本一致。
2. 安装依赖并运行测试、类型检查。
3. 构建 zip 和 SHA-256 文件。
4. 从 CHANGELOG 提取当前版本说明。
5. 创建 GitHub Release 并上传两个制品。

如果仓库尚未配置远端，先执行：

```bash
git remote add origin <GitHub 仓库地址>
git push -u origin main
```

## 本地安装验证

Chrome 已加载项目 `dist/` 时，执行 `npm run build` 后在 `chrome://extensions` 点击“重新加载”。
验证通过后再创建 tag，避免发布无法安装的制品。
