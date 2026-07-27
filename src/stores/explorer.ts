import { defineStore } from 'pinia'
import type { ColumnInfo } from '../api/client'
import { useConnectionsStore } from './connections'

export const useExplorerStore = defineStore('explorer', {
  state: () => ({
    databases: [] as string[],
    tablesByDb: {} as Record<string, string[]>,
    schemas: {} as Record<string, ColumnInfo[]>, // key: `${db}.${table}`
    loading: false,
    error: '',
    notice: '',
  }),
  actions: {
    reset() {
      this.databases = []
      this.tablesByDb = {}
      this.schemas = {}
      this.error = ''
      this.notice = ''
    },
    // 列库降级链：configure 管理接口（需 admin）→ SHOW DATABASES → 连接配置的默认数据库
    async loadDatabases() {
      this.loading = true
      this.error = ''
      this.notice = ''
      const conns = useConnectionsStore()
      const defaultDb = conns.active?.defaultDb
      try {
        const client = conns.client()
        try {
          this.databases = await client.listDatabases()
        } catch {
          try {
            this.databases = await client.listDatabasesViaShow(defaultDb || undefined)
            this.notice = 'token 无管理权限，已改用 SHOW DATABASES 列库'
          } catch (e) {
            if (defaultDb) {
              this.databases = [defaultDb]
              this.notice = 'token 无列库权限，仅显示连接配置的默认数据库'
            } else {
              throw e
            }
          }
        }
      } catch (e) {
        this.error =
          String((e as Error).message) +
          '\n提示：非 admin token 无法列库，可在连接配置中填写「默认数据库」继续使用'
      } finally {
        this.loading = false
      }
    },
    async loadTables(db: string) {
      if (this.tablesByDb[db]) return
      try {
        this.tablesByDb[db] = await useConnectionsStore().client().listTables(db)
      } catch (e) {
        this.error = String((e as Error).message)
      }
    },
    async loadSchema(db: string, table: string) {
      const key = `${db}.${table}`
      if (this.schemas[key]) return
      try {
        this.schemas[key] = await useConnectionsStore().client().tableSchema(db, table)
      } catch (e) {
        this.error = String((e as Error).message)
      }
    },
  },
})
