import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useConnectionsStore, type SavedConnection } from '../../src/stores/connections'

const conn = (over: Partial<SavedConnection> = {}): SavedConnection => ({
  id: 'id-1',
  name: 'local',
  url: 'http://db:8181',
  token: 'T',
  ...over,
})

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe('connections store', () => {
  it('save 后 load 能恢复，且首个连接自动激活', async () => {
    const s = useConnectionsStore()
    await s.save(conn())
    expect(s.activeId).toBe('id-1')

    setActivePinia(createPinia())
    const s2 = useConnectionsStore()
    await s2.load()
    expect(s2.connections).toHaveLength(1)
    expect(s2.active?.name).toBe('local')
  })

  it('save 相同 id 是更新而非新增', async () => {
    const s = useConnectionsStore()
    await s.save(conn())
    await s.save(conn({ name: 'renamed' }))
    expect(s.connections).toHaveLength(1)
    expect(s.active?.name).toBe('renamed')
  })

  it('remove 当前连接后回退到剩余首个', async () => {
    const s = useConnectionsStore()
    await s.save(conn())
    await s.save(conn({ id: 'id-2', name: 'other' }))
    await s.setActive('id-2')
    await s.remove('id-2')
    expect(s.activeId).toBe('id-1')
  })

  it('checkHealth 成功置 ok 并记录版本', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ version: '3.2.0' }),
      text: async () => '',
    }) as Response))
    const s = useConnectionsStore()
    await s.save(conn())
    await s.checkHealth()
    expect(s.health).toBe('ok')
    expect(s.version).toBe('3.2.0')
  })

  it('checkHealth 失败置 down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('refused') }))
    const s = useConnectionsStore()
    await s.save(conn())
    await s.checkHealth()
    expect(s.health).toBe('down')
  })
})
