<script setup lang="ts">
import { ref } from 'vue'
import { useExplorerStore } from '../stores/explorer'

const emit = defineEmits<{ preview: [db: string, table: string] }>()
const store = useExplorerStore()
const openDbs = ref(new Set<string>())
const openTables = ref(new Set<string>())

async function toggleDb(db: string) {
  if (openDbs.value.has(db)) openDbs.value.delete(db)
  else {
    openDbs.value.add(db)
    await store.loadTables(db)
  }
}
async function toggleSchema(db: string, table: string) {
  const key = `${db}.${table}`
  if (openTables.value.has(key)) openTables.value.delete(key)
  else {
    openTables.value.add(key)
    await store.loadSchema(db, table)
  }
}
const roleIcon = { time: '🕐', tag: '🏷', field: '📈' } as const
</script>

<template>
  <div class="tree">
    <div class="tree-head">
      <span>数据库 / 表</span>
      <button class="btn" title="刷新" @click="store.reset(); store.loadDatabases()">⟳</button>
    </div>
    <p v-if="store.error" class="error-box">{{ store.error }}</p>
    <p v-else-if="store.loading" class="muted">加载中…</p>
    <p v-if="store.notice" class="muted">ℹ️ {{ store.notice }}</p>
    <ul>
      <li v-for="db in store.databases" :key="db">
        <div class="node" @click="toggleDb(db)">{{ openDbs.has(db) ? '▾' : '▸' }} 📁 {{ db }}</div>
        <ul v-if="openDbs.has(db)">
          <li v-for="t in store.tablesByDb[db] ?? []" :key="t">
            <div class="node">
              <span @click="toggleSchema(db, t)">{{ openTables.has(`${db}.${t}`) ? '▾' : '▸' }}</span>
              <span class="tname" @click="emit('preview', db, t)" :title="`预览 ${t}`">📊 {{ t }}</span>
            </div>
            <ul v-if="openTables.has(`${db}.${t}`)" class="cols">
              <li v-for="col in store.schemas[`${db}.${t}`] ?? []" :key="col.name" class="muted">
                {{ roleIcon[col.role] }} {{ col.name }} <em>{{ col.dataType }}</em>
              </li>
            </ul>
          </li>
        </ul>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.tree { padding: 8px; font-size: 13px; }
.tree-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; color: #57606a; }
ul { list-style: none; margin: 0; padding-left: 14px; }
.tree > ul { padding-left: 0; }
.node { cursor: pointer; padding: 2px 4px; border-radius: 4px; white-space: nowrap; }
.node:hover { background: #f6f8fa; }
.tname:hover { color: #0969da; text-decoration: underline; }
.cols em { font-style: normal; opacity: 0.7; font-size: 11px; }
</style>
