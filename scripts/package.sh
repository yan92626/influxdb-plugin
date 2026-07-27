#!/usr/bin/env bash
# 一键打包：构建 + 附带安装说明 + 压缩为 influxdb3-head-v<版本>.zip
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./package.json').version")
OUT="influxdb3-head-v${VERSION}.zip"

npm run build
cp INSTALL.md dist/
rm -f "$OUT"
(cd dist && zip -qr "../$OUT" .)

echo "✅ 打包完成: $OUT ($(du -h "$OUT" | cut -f1 | tr -d ' '))"
echo "   把它发给对方，让对方按压缩包内 INSTALL.md 的说明安装"
