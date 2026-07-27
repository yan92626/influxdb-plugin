<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ApiError } from '../api/client'
import { useConnectionsStore } from '../stores/connections'
import { useExplorerStore } from '../stores/explorer'

const conns = useConnectionsStore()
const explorer = useExplorerStore()
const newDb = ref('')
const confirmName = ref('')
const deleting = ref('') // 正在确认删除的库名
const msg = ref('')

onMounted(() => { if (conns.active) { explorer.reset(); explorer.loadDatabases() } })

async function create() {
  if (!newDb.value) return
  try {
    await conns.client().createDatabase(newDb.value)
    msg.value = `✅ 已创建 ${newDb.value}`
    newDb.value = ''
    explorer.reset()
    await explorer.loadDatabases()
  } catch (e) {
    msg.value = `❌ ${e instanceof ApiError ? `${e.message}${e.detail ? `：${e.detail}` : ''}` : String(e)}`
  }
}

async function doDelete(db: string) {
  if (confirmName.value !== db) return
  try {
    await conns.client().deleteDatabase(db)
    msg.value = `✅ 已删除 ${db}`
    deleting.value = ''
    confirmName.value = ''
    explorer.reset()
    await explorer.loadDatabases()
  } catch (e) {
    msg.value = `❌ ${e instanceof ApiError ? `${e.message}${e.detail ? `：${e.detail}` : ''}` : String(e)}`
  }
}
</script>

<template>
  <div class="page">
    <h3>数据库管理</h3>
    <div class="row">
      <input v-model="newDb" placeholder="新数据库名" />
      <button class="btn btn-primary" @click="create">创建</button>
      <span class="muted">{{ msg }}</span>
    </div>
    <table class="grid">
      <thead><tr><th>数据库</th><th style="width: 380px">操作</th></tr></thead>
      <tbody>
        <tr v-for="db in explorer.databases" :key="db">
          <td>{{ db }}</td>
          <td>
            <template v-if="deleting === db">
              <input v-model="confirmName" :placeholder="`输入 ${db} 确认删除`" />
              <button class="btn btn-danger" :disabled="confirmName !== db" @click="doDelete(db)">确认删除</button>
              <button class="btn" @click="deleting = ''; confirmName = ''">取消</button>
            </template>
            <button v-else class="btn btn-danger" @click="deleting = db; confirmName = ''">删除…</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.page { padding: 16px; display: flex; flex-direction: column; gap: 12px; max-width: 800px; }
.row { display: flex; gap: 8px; align-items: center; }
</style>
