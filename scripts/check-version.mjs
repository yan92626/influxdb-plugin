import { readFile } from 'node:fs/promises'

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))
const packageJson = await readJson('package.json')
const packageLock = await readJson('package-lock.json')
const manifest = await readJson('public/manifest.json')
const expected = process.argv[2]?.replace(/^v/, '')

const versions = {
  'package.json': packageJson.version,
  'package-lock.json': packageLock.version,
  'package-lock.json (root package)': packageLock.packages?.['']?.version,
  'public/manifest.json': manifest.version,
}
const uniqueVersions = new Set(Object.values(versions))
const errors = []

if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(packageJson.version)) {
  errors.push(`Chrome 扩展版本必须是 1-4 段数字：${packageJson.version}`)
}
if (uniqueVersions.size !== 1) {
  errors.push(`版本不一致：${Object.entries(versions).map(([file, version]) => `${file}=${version}`).join(', ')}`)
}
if (expected && packageJson.version !== expected) {
  errors.push(`Git tag 版本 ${expected} 与项目版本 ${packageJson.version} 不一致`)
}

const changelog = await readFile('CHANGELOG.md', 'utf8')
if (!changelog.includes(`## [${packageJson.version}]`)) {
  errors.push(`CHANGELOG.md 缺少 ## [${packageJson.version}] 发布条目`)
}

if (errors.length) {
  for (const error of errors) console.error(`❌ ${error}`)
  process.exitCode = 1
} else {
  console.log(`✅ 版本 ${packageJson.version} 在清单、lockfile 和 CHANGELOG 中一致`)
}
