import { readFile, writeFile } from 'node:fs/promises'

const version = process.argv[2]?.replace(/^v/, '')
if (!version || !/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version)) {
  console.error('用法: npm run version:set -- 0.2.0')
  console.error('Chrome 扩展版本必须是 1-4 段数字，不支持 prerelease 后缀。')
  process.exit(1)
}

const updateJson = async (path, update) => {
  const json = JSON.parse(await readFile(path, 'utf8'))
  update(json)
  await writeFile(path, `${JSON.stringify(json, null, 2)}\n`)
}

await updateJson('package.json', (json) => { json.version = version })
await updateJson('package-lock.json', (json) => {
  json.version = version
  json.packages[''].version = version
})
await updateJson('public/manifest.json', (json) => { json.version = version })

console.log(`✅ 已同步版本 ${version}`)
console.log(`   下一步：把 CHANGELOG.md 的 [Unreleased] 内容归档到 [${version}]。`)
