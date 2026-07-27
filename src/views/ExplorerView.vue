<script setup lang="ts">
import { onMounted, watch } from 'vue'
import DbTree from '../components/DbTree.vue'
import QueryEditor from '../components/QueryEditor.vue'
import ResultsTable from '../components/ResultsTable.vue'
import { useConnectionsStore } from '../stores/connections'
import { useExplorerStore } from '../stores/explorer'
import { useQueryStore } from '../stores/query'

const conns = useConnectionsStore()
const explorer = useExplorerStore()
const query = useQueryStore()

function pickHistory(ev: Event) {
  const i = Number((ev.target as HTMLSelectElement).value)
  const h = query.history[i]
  if (!h) return
  query.db = h.db
  query.language = h.language
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
        <button class="btn btn-primary" :disabled="query.running" @click="query.run()">
          {{ query.running ? '运行中…' : '运行 (⌘⏎)' }}
        </button>
        <select @change="pickHistory" value="">
          <option value="" disabled>历史查询…</option>
          <option v-for="(h, i) in query.history" :key="h.at" :value="i">
            [{{ h.language }}/{{ h.db }}] {{ h.q.slice(0, 60) }}
          </option>
        </select>
      </div>
      <QueryEditor v-model="query.text" @run="query.run()" class="qe" />
      <div class="results">
        <p v-if="query.error" class="error-box">{{ query.error }}</p>
        <template v-else-if="query.result">
          <p class="muted">{{ query.result.rows.length }} 行 · {{ query.result.durationMs.toFixed(0) }} ms</p>
          <ResultsTable :result="query.result" />
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
.toolbar { display: flex; gap: 8px; align-items: center; }
.results { flex: 1; overflow: auto; }
</style>
