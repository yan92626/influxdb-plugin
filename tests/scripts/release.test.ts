import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function runScript(script: string, ...args: string[]): string {
  return execFileSync(process.execPath, [script, ...args], { encoding: 'utf8' })
}

describe('release scripts', () => {
  it('校验当前版本一致', () => {
    const version = JSON.parse(readFileSync('package.json', 'utf8')).version
    expect(runScript('scripts/check-version.mjs')).toContain(`版本 ${version}`)
  })

  it('提取中间和最后一个 CHANGELOG 版本', () => {
    expect(runScript('scripts/release-notes.mjs', '0.1.1')).toContain('### Fixed')
    expect(runScript('scripts/release-notes.mjs', '0.1.0')).toContain('Chrome Manifest V3')
  })
})
