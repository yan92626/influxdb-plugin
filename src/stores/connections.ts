import { defineStore } from 'pinia'
import { InfluxDB3Client } from '../api/client'
import { storageGet, storageSet } from '../lib/storage'

export interface SavedConnection {
  id: string
  name: string
  url: string
  token: string
  defaultDb?: string
}

const CONNS_KEY = 'connections'
const ACTIVE_KEY = 'activeConnectionId'

export const useConnectionsStore = defineStore('connections', {
  state: () => ({
    connections: [] as SavedConnection[],
    activeId: '',
    health: 'unknown' as 'unknown' | 'ok' | 'down',
    version: '',
  }),
  getters: {
    active(state): SavedConnection | null {
      return state.connections.find((c) => c.id === state.activeId) ?? null
    },
  },
  actions: {
    client(): InfluxDB3Client {
      const c = this.active
      if (!c) throw new Error('未选择连接')
      return new InfluxDB3Client({ url: c.url, token: c.token })
    },
    async persist() {
      await storageSet(CONNS_KEY, this.connections)
      await storageSet(ACTIVE_KEY, this.activeId)
    },
    async load() {
      // 旧版本可能把 reactive 数组序列化成对象存入，读取时校验形状防脏数据
      const conns = await storageGet<SavedConnection[]>(CONNS_KEY, [])
      this.connections = Array.isArray(conns) ? conns : []
      const active = await storageGet(ACTIVE_KEY, '')
      this.activeId = typeof active === 'string' ? active : ''
      if (!this.active && this.connections.length) this.activeId = this.connections[0].id
    },
    async save(conn: SavedConnection) {
      const i = this.connections.findIndex((c) => c.id === conn.id)
      if (i >= 0) this.connections[i] = conn
      else this.connections.push(conn)
      if (!this.active) this.activeId = conn.id
      await this.persist()
    },
    async remove(id: string) {
      this.connections = this.connections.filter((c) => c.id !== id)
      if (this.activeId === id) this.activeId = this.connections[0]?.id ?? ''
      await this.persist()
    },
    async setActive(id: string) {
      this.activeId = id
      this.health = 'unknown'
      this.version = ''
      await this.persist()
    },
    async checkHealth() {
      try {
        const client = this.client()
        await client.health()
        this.version = (await client.ping()).version
        this.health = 'ok'
      } catch {
        this.health = 'down'
      }
    },
  },
})
