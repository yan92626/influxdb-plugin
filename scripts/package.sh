#!/usr/bin/env bash
# 构建 Chrome 扩展，并在 release/ 生成 zip 与 SHA-256 校验文件。
set -euo pipefail
cd "$(dirname "$0")/.."

npm run version:check

VERSION=$(node -p "require('./package.json').version")
RELEASE_DIR="release"
ARCHIVE="influxdb3-head-v${VERSION}.zip"

npm run build
cp INSTALL.md dist/
mkdir -p "$RELEASE_DIR"
rm -f "$RELEASE_DIR/$ARCHIVE" "$RELEASE_DIR/$ARCHIVE.sha256"
(cd dist && zip -X -qr "../$RELEASE_DIR/$ARCHIVE" .)
(cd "$RELEASE_DIR" && shasum -a 256 "$ARCHIVE" > "$ARCHIVE.sha256")

echo "✅ 打包完成: $RELEASE_DIR/$ARCHIVE ($(du -h "$RELEASE_DIR/$ARCHIVE" | cut -f1 | tr -d ' '))"
echo "   校验文件: $RELEASE_DIR/$ARCHIVE.sha256"
