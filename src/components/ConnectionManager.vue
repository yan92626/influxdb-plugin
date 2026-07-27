<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useConnectionsStore, type SavedConnection } from '../stores/connections'
import { InfluxDB3Client, ApiError } from '../api/client'

defineEmits<{ close: [] }>()
const store = useConnectionsStore()

const blank = (): SavedConnection => ({
  id: crypto.randomUUID(),
  name: '',
  url: 'http://localhost:8181',
  token: '',
  defaultDb: '',
})
const form = reactive(blank())
const testMsg = ref('')

function edit(c: SavedConnection) {
  Object.assign(form, c)
  testMsg.value = ''
}
async function save() {
  if (!form.name || !form.url) return
  await store.save({ ...form })
  Object.assign(form, blank())
}
async function test() {
  testMsg.value = '测试中…'
  try {
    const client = new InfluxDB3Client({ url: form.url, token: form.token, timeoutMs: 5000 })
    await client.health()
    const { version } = await client.ping()
    testMsg.value = `✅ 连接成功（版本 ${version}）`
  } catch (e) {
    testMsg.value = `❌ ${e instanceof ApiError ? e.message : String(e)}`
  }
}
</script>

<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="dialog">
      <h3>连接管理</h3>
      <table class="grid" v-if="store.connections.length">
        <thead><tr><th>名称</th><th>地址</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="c in store.connections" :key="c.id">
            <td>{{ c.name }}</td>
            <td>{{ c.url }}</td>
            <td>
              <button class="btn" @click="edit(c)">编辑</button>
              <button class="btn btn-danger" @click="store.remove(c.id)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="form">
        <input v-model="form.name" placeholder="名称，如 prod-influx3" />
        <input v-model="form.url" placeholder="http://localhost:8181" />
        <input v-model="form.token" type="password" placeholder="Token" />
        <input v-model="form.defaultDb" placeholder="默认数据库（可选）" />
        <div>
          <button class="btn" @click="test">测试连接</button>
          <button class="btn btn-primary" @click="save">保存</button>
          <button class="btn" @click="$emit('close')">关闭</button>
        </div>
        <span class="muted">{{ testMsg }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; background: rgb(0 0 0 / 40%); display: flex; align-items: center; justify-content: center; z-index: 10; }
.dialog { background: #fff; border-radius: 8px; padding: 20px; width: 560px; max-height: 80vh; overflow: auto; }
.form { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
</style>
