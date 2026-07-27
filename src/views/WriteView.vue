<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ApiError } from '../api/client'
import { useConnectionsStore } from '../stores/connections'
import { useExplorerStore } from '../stores/explorer'

const conns = useConnectionsStore()
const explorer = useExplorerStore()
const db = ref('')
const precision = ref<'auto' | 'nanosecond' | 'microsecond' | 'millisecond' | 'second'>('auto')
const body = ref('')
const msg = ref('')

onMounted(async () => {
  if (!explorer.databases.length && conns.active) await explorer.loadDatabases()
  db.value = conns.active?.defaultDb || explorer.databases[0] || ''
})

async function submit() {
  if (!db.value || !body.value.trim()) return
  msg.value = '写入中…'
  try {
    await conns.client().writeLineProtocol(db.value, body.value, precision.value)
    msg.value = '✅ 写入成功'
  } catch (e) {
    msg.value = `❌ ${e instanceof ApiError ? `${e.message}${e.detail ? `：${e.detail}` : ''}` : String(e)}`
  }
}
</script>

<template>
  <div class="page">
    <h3>写入数据（Line Protocol）</h3>
    <div class="row">
      <label>数据库
        <select v-model="db">
          <option v-for="d in explorer.databases" :key="d" :value="d">{{ d }}</option>
        </select>
      </label>
      <label>时间精度
        <select v-model="precision">
          <option v-for="p in ['auto', 'nanosecond', 'microsecond', 'millisecond', 'second']" :key="p" :value="p">{{ p }}</option>
        </select>
      </label>
    </div>
    <textarea v-model="body" rows="10" spellcheck="false"
      placeholder="measurement,tag1=a field1=1.0,field2=2i 1735545600000000000&#10;每行一条，格式：表名,标签集 字段集 [时间戳]"></textarea>
    <div class="row">
      <button class="btn btn-primary" @click="submit">写入</button>
      <span class="muted" style="white-space: pre-wrap">{{ msg }}</span>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 16px; display: flex; flex-direction: column; gap: 12px; max-width: 800px; }
.row { display: flex; gap: 16px; align-items: center; }
textarea { font-family: ui-monospace, monospace; }
</style>
