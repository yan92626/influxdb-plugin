import { defineStore } from 'pinia'
import { ApiError, type QueryResult } from '../api/client'
import { pushHistory, type HistoryEntry } from '../lib/history'
import { storageGet, storageSet } from '../lib/storage'
import { useConnectionsStore } from './connections'

const HISTORY_KEY = 'queryHistory'

export const useQueryStore = defineStore('query', {
  state: () => ({
    db: '',
    language: 'sql' as 'sql' | 'influxql',
    text: '',
    // 预览时间范围；大库不带时间条件会超 parquet 文件扫描上限
    previewRange: '1 hour' as string,
    running: false,
    result: null as QueryResult | null,
    error: '',
    history: [] as HistoryEntry[],
  }),
  actions: {
    async loadHistory() {
      const h = await storageGet<HistoryEntry[]>(HISTORY_KEY, [])
      this.history = Array.isArray(h) ? h : []
    },
    async run() {
      if (!this.db || !this.text.trim() || this.running) return
      this.running = true
      this.error = ''
      try {
        const client = useConnectionsStore().client()
        this.result =
          this.language === 'sql'
            ? await client.querySql(this.db, this.text)
            : await client.queryInfluxql(this.db, this.text)
        this.history = pushHistory(this.history, {
          q: this.text, db: this.db, language: this.language, at: Date.now(),
        })
        await storageSet(HISTORY_KEY, this.history)
      } catch (e) {
        this.result = null
        this.error = e instanceof ApiError ? `${e.message}${e.detail ? `\n${e.detail}` : ''}` : String(e)
        if (this.error.includes('file limit')) {
          this.error +=
            "\n\n💡 该库数据量大，请在查询中限定时间范围，例如：WHERE time >= now() - INTERVAL '1 hour'"
        }
      } finally {
        this.running = false
      }
    },
    async preview(db: string, table: string) {
      this.db = db
      this.language = 'sql'
      const where =
        this.previewRange === 'all'
          ? ''
          : ` WHERE time >= now() - INTERVAL '${this.previewRange}'`
      this.text = `SELECT * FROM "${table}"${where} ORDER BY time DESC LIMIT 100`
      await this.run()
    },
  },
})
