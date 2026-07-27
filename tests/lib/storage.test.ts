import { describe, it, expect, afterEach, vi } from 'vitest'
import { reactive } from 'vue'
import { storageGet, storageSet } from '../../src/lib/storage'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

/** 模拟 chrome.storage.local：像真实实现一样对值做结构化克隆（Vue reactive Proxy 会抛错） */
function stubChromeStorage() {
  const data: Record<string, unknown> = {}
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        async set(obj: Record<string, unknown>) {
          for (const [k, v] of Object.entries(obj)) data[k] = structuredClone(v)
        },
        async get(key: string) {
          return { [key]: data[key] }
        },
      },
    },
  })
  return data
}

describe('storage 与 chrome.storage.local', () => {
  it('能保存 Vue reactive 数组（真实 chrome.storage 会拒绝 Proxy，需先转纯对象）', async () => {
    stubChromeStorage()
    const conns = reactive([{ id: '1', name: 'local', url: 'http://x', token: 'T' }])
    await storageSet('connections', conns)
    expect(await storageGet('connections', [])).toEqual([
      { id: '1', name: 'local', url: 'http://x', token: 'T' },
    ])
  })

  it('无 chrome 时降级 localStorage', async () => {
    await storageSet('k', { a: 1 })
    expect(await storageGet('k', null)).toEqual({ a: 1 })
  })
})
