<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import DbTree from '../components/DbTree.vue'
import QueryEditor from '../components/QueryEditor.vue'
import ResultsTable from '../components/ResultsTable.vue'
import ResultsChart from '../components/ResultsChart.vue'
import { getChartSchema } from '../lib/chart'
import { toCsv, toJson, download } from '../lib/export'
import { getTimeZoneOptions } from '../lib/timezone'
import { useConnectionsStore } from '../stores/connections'
import { useExplorerStore } from '../stores/explorer'
import { useQueryStore } from '../stores/query'

const conns = useConnectionsStore()
const explorer = useExplorerStore()
const query = useQueryStore()

const viewMode = ref<'table' | 'chart'>('table')
const chartSchema = computed(() => (query.result ? getChartSchema(query.result) : null))
const timeZones = getTimeZoneOptions()

// 防护确认点用浏览器原生 confirm 弹窗
function runGuarded() {
  return query.run((msg) => window.confirm(msg))
}

function pickHistory(ev: Event) {
  const i = Number((ev.target as HTMLSelectElement).value)
  const h = query.history[i]
  if (!h) return
  query.db = h.db
  query.language = h.language
  if (h.timezone) void query.setTimezone(h.timezone)
  query.text = h.q
  ;(ev.target as HTMLSelectElement).value = ''
}

onMounted(async () => {
  await query.loadHistory()
  if (conns.active) {
    await explorer.loadDatabases()
    if (!query.db) query.db = conns.active.defaultDb || explorer.databases[0] || ''
  }
})
watch(() => conns.activeId, async () => {
  explorer.reset()
  if (conns.active) {
    await explorer.loadDatabases()
    query.db = conns.active.defaultDb || explorer.databases[0] || ''
  }
})
</script>

<template>
  <div class="explorer">
    <aside><DbTree @preview="(db, t) => query.preview(db, t)" /></aside>
    <section class="work">
      <div class="toolbar">
        <select v-model="query.db">
          <option v-for="db in explorer.databases" :key="db" :value="db">{{ db }}</option>
        </select>
        <select v-model="query.language">
          <option value="sql">SQL</option>
          <option value="influxql">InfluxQL</option>
        </select>
        <label class="muted">时区
          <select
            class="timezone-select"
            :value="query.timezone"
            title="查询结果时区"
            @change="query.setTimezone(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="timezone in timeZones" :key="timezone" :value="timezone">
              {{ timezone }}
            </option>
          </select>
        </label>
        <button class="btn btn-primary" :disabled="query.running" @click="runGuarded">
          {{ query.running ? '运行中…' : '运行 (⌘⏎)' }}
        </button>
        <label class="muted">最大行数
          <select v-model.number="query.maxRows" title="SELECT 未写 LIMIT 时自动追加此上限">
            <option :value="100">100</option>
            <option :value="500">500</option>
            <option :value="1000">1000</option>
            <option :value="5000">5000</option>
          </select>
        </label>
        <select @change="pickHistory" value="">
          <option value="" disabled>历史查询…</option>
          <option v-for="(h, i) in query.history" :key="h.at" :value="i">
            [{{ h.language }}/{{ h.db }}/{{ h.timezone ?? 'UTC' }}] {{ h.q.slice(0, 60) }}
          </option>
        </select>
        <label class="muted">预览范围
          <select v-model="query.previewRange" title="点击左侧表名预览时的时间范围">
            <option value="5 minutes">最近 5 分钟</option>
            <option value="1 hour">最近 1 小时</option>
            <option value="6 hours">最近 6 小时</option>
            <option value="1 day">最近 1 天</option>
            <option value="7 days">最近 7 天</option>
            <option value="all">全部（大库可能超限）</option>
          </select>
        </label>
      </div>
      <QueryEditor v-model="query.text" @run="runGuarded" class="qe" />
      <div class="results">
        <p v-if="query.error" class="error-box">{{ query.error }}</p>
        <template v-else-if="query.result">
          <div class="toolbar">
            <span class="muted">{{ query.result.rows.length }} 行 · {{ query.result.durationMs.toFixed(0) }} ms</span>
            <button class="btn" :class="{ 'btn-primary': viewMode === 'table' }" @click="viewMode = 'table'">表格</button>
            <button class="btn" :class="{ 'btn-primary': viewMode === 'chart' }" :disabled="!chartSchema" @click="viewMode = 'chart'"
              :title="chartSchema ? '' : '结果需包含 time 列和数值列'">折线图</button>
            <button class="btn" @click="download('result.csv', toCsv(query.result!), 'text/csv')">导出 CSV</button>
            <button class="btn" @click="download('result.json', toJson(query.result!), 'application/json')">导出 JSON</button>
          </div>
          <ResultsChart v-if="viewMode === 'chart' && chartSchema" :result="query.result" :timezone="query.timezone" />
          <ResultsTable v-else :result="query.result" />
        </template>
        <p v-else class="muted">点击左侧表名预览数据，或输入查询后运行</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.explorer { display: flex; height: 100%; }
aside { width: 280px; min-width: 280px; border-right: 1px solid #d0d7de; overflow: auto; }
.work { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 8px; gap: 8px; }
.toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.timezone-select { max-width: 190px; }
.results { flex: 1; overflow: auto; }
</style>
