import { readFile, writeFile } from 'node:fs/promises'

const version = process.argv[2]?.replace(/^v/, '')
const output = process.argv[3]
if (!version) {
  console.error('用法: npm run release:notes -- 0.1.1 [输出文件]')
  process.exit(1)
}

const changelog = await readFile('CHANGELOG.md', 'utf8')
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const heading = changelog.match(new RegExp(`^## \\[${escaped}\\](?: .*)?$`, 'm'))
if (heading?.index == null) {
  console.error(`CHANGELOG.md 中找不到版本 ${version}`)
  process.exit(1)
}

const contentStart = changelog.indexOf('\n', heading.index) + 1
const nextHeading = changelog.indexOf('\n## [', contentStart)
const notes = changelog.slice(contentStart, nextHeading < 0 ? undefined : nextHeading).trim()
if (output) {
  await writeFile(output, `${notes}\n`)
  console.log(`✅ Release notes 已写入 ${output}`)
} else {
  console.log(notes)
}
