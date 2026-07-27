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
  }),
  actions: {
    reset() {
      this.databases = []
      this.tablesByDb = {}
      this.schemas = {}
      this.error = ''
    },
    async loadDatabases() {
      this.loading = true
      this.error = ''
      try {
        this.databases = await useConnectionsStore().client().listDatabases()
      } catch (e) {
        this.error = String((e as Error).message)
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
