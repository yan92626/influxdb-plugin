<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useConnectionsStore } from '../stores/connections'

const conns = useConnectionsStore()
const dbStats = ref<{ db: string; tables: number }[]>([])
const error = ref('')

onMounted(async () => {
  if (!conns.active) return
  try {
    const client = conns.client()
    const dbs = await client.listDatabases()
    dbStats.value = await Promise.all(
      dbs.map(async (db) => ({ db, tables: (await client.listTables(db)).length })),
    )
  } catch (e) {
    error.value = String((e as Error).message)
  }
})
</script>

<template>
  <div class="page">
    <h3>概览</h3>
    <div class="stats">
      <div class="stat"><span class="muted">连接</span><b>{{ conns.active?.name ?? '—' }}</b></div>
      <div class="stat"><span class="muted">状态</span><b>{{ conns.health === 'ok' ? '健康' : conns.health === 'down' ? '不可用' : '未知' }}</b></div>
      <div class="stat"><span class="muted">版本</span><b>{{ conns.version || '—' }}</b></div>
      <div class="stat"><span class="muted">数据库</span><b>{{ dbStats.length }}</b></div>
    </div>
    <p v-if="error" class="error-box">{{ error }}</p>
    <table class="grid" v-else>
      <thead><tr><th>数据库</th><th>表数量</th></tr></thead>
      <tbody>
        <tr v-for="s in dbStats" :key="s.db"><td>{{ s.db }}</td><td>{{ s.tables }}</td></tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.page { padding: 16px; display: flex; flex-direction: column; gap: 12px; max-width: 800px; }
.stats { display: flex; gap: 12px; }
.stat { border: 1px solid #d0d7de; border-radius: 6px; padding: 12px 20px; display: flex; flex-direction: column; gap: 4px; min-width: 120px; }
</style>
