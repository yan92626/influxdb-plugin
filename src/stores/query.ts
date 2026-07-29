import { defineStore } from 'pinia'
import { ApiError, type QueryResult } from '../api/client'
import { pushHistory, type HistoryEntry } from '../lib/history'
import { storageGet, storageSet } from '../lib/storage'
import { analyzeQuery, ensureLimit } from '../lib/guard'
import {
  DEFAULT_TIME_ZONE,
  applyInfluxqlTimeZone,
  applyResultTimeZone,
  normalizeTimeZone,
} from '../lib/timezone'
import { useConnectionsStore } from './connections'

const HISTORY_KEY = 'queryHistory'
const TIMEZONE_KEY = 'queryTimezone'

export const useQueryStore = defineStore('query', {
  state: () => ({
    db: '',
    language: 'sql' as 'sql' | 'influxql',
    text: '',
    timezone: DEFAULT_TIME_ZONE,
    // 预览时间范围；大库不带时间条件会超 parquet 文件扫描上限
    previewRange: '1 hour' as string,
    // 防护：SELECT 无 LIMIT 时自动追加的行数上限
    maxRows: 1000,
    running: false,
    rawResult: null as QueryResult | null,
    result: null as QueryResult | null,
    error: '',
    history: [] as HistoryEntry[],
  }),
  actions: {
    async loadHistory() {
      const h = await storageGet<HistoryEntry[]>(HISTORY_KEY, [])
      this.history = Array.isArray(h) ? h : []
      this.timezone = normalizeTimeZone(await storageGet(TIMEZONE_KEY, DEFAULT_TIME_ZONE))
    },
    async setTimezone(timezone: string) {
      this.timezone = normalizeTimeZone(timezone)
      if (this.rawResult) {
        this.result = applyResultTimeZone(this.rawResult, this.timezone)
      }
      await storageSet(TIMEZONE_KEY, this.timezone)
    },
    // confirm：需要用户确认的防护点回调，返回 false 则中止执行
    async run(confirm: (msg: string) => boolean | Promise<boolean> = () => true) {
      if (!this.db || !this.text.trim() || this.running) return
      const analysis = analyzeQuery(this.text)

      if (analysis.isDangerous && !(await confirm(
        '⚠️ 这是一条会修改/删除数据的语句，确定执行吗？',
      ))) return

      if (analysis.isSelect && !analysis.hasTimeFilter && !(await confirm(
        '该查询没有时间范围条件，在大数据量的库上可能扫描海量数据、拖慢甚至压垮服务端。\n\n' +
        '建议加上 WHERE time >= now() - INTERVAL \'1 hour\' 之类的条件。仍要继续吗？',
      ))) return

      // SELECT 无 LIMIT 时自动兜底，防止一次性拉回过多数据
      let sql = analysis.isSelect ? ensureLimit(this.text, this.maxRows) : this.text
      if (this.language === 'influxql') {
        sql = applyInfluxqlTimeZone(sql, this.timezone)
      }

      this.running = true
      this.error = ''
      try {
        const client = useConnectionsStore().client()
        const result =
          this.language === 'sql'
            ? await client.querySql(this.db, sql)
            : await client.queryInfluxql(this.db, sql)
        this.rawResult = result
        this.result = applyResultTimeZone(this.rawResult, this.timezone)
        this.history = pushHistory(this.history, {
          q: this.text,
          db: this.db,
          language: this.language,
          timezone: this.timezone,
          at: Date.now(),
        })
        await storageSet(HISTORY_KEY, this.history)
      } catch (e) {
        this.rawResult = null
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
      this.text = `SELECT * FROM "${table}"${where} ORDER BY time DESC LIMIT ${this.maxRows}`
      await this.run()
    },
  },
})
