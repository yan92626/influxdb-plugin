<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useConnectionsStore } from './stores/connections'
import ConnectionManager from './components/ConnectionManager.vue'
import ExplorerView from './views/ExplorerView.vue'
import OverviewView from './views/OverviewView.vue'
import WriteView from './views/WriteView.vue'
import AdminView from './views/AdminView.vue'

const views = {
  explorer: { label: '工作区', comp: ExplorerView },
  overview: { label: '概览', comp: OverviewView },
  write: { label: '写入', comp: WriteView },
  admin: { label: '管理', comp: AdminView },
} as const
type ViewKey = keyof typeof views

const store = useConnectionsStore()
const current = ref<ViewKey>('explorer')
const showManager = ref(false)

onMounted(async () => {
  await store.load()
  if (store.active) await store.checkHealth()
  else showManager.value = true
})
watch(() => store.activeId, () => { if (store.active) store.checkHealth() })
</script>

<template>
  <header class="topbar">
    <strong>InfluxDB3 Head</strong>
    <select :value="store.activeId" @change="store.setActive(($event.target as HTMLSelectElement).value)">
      <option v-for="c in store.connections" :key="c.id" :value="c.id">{{ c.name }}</option>
    </select>
    <button class="btn" @click="showManager = true">管理连接</button>
    <span class="dot" :class="store.health" :title="store.health === 'ok' ? `健康 v${store.version}` : store.health === 'down' ? '连接失败' : '未知'"></span>
    <span class="muted" v-if="store.version">v{{ store.version }}</span>
    <nav>
      <button v-for="(v, key) in views" :key="key" class="btn" :class="{ 'btn-primary': current === key }" @click="current = key">
        {{ v.label }}
      </button>
    </nav>
  </header>
  <main>
    <component :is="views[current].comp" />
  </main>
  <ConnectionManager v-if="showManager" @close="showManager = false" />
</template>

<style scoped>
.topbar { display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: #24292f; color: #fff; }
.topbar nav { margin-left: auto; display: flex; gap: 4px; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: #8b949e; }
.dot.ok { background: #2da44e; }
.dot.down { background: #cf222e; }
main { height: calc(100vh - 46px); overflow: auto; }
</style>
