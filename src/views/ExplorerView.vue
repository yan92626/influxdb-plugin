<script setup lang="ts">
import { onMounted, watch } from 'vue'
import DbTree from '../components/DbTree.vue'
import { useConnectionsStore } from '../stores/connections'
import { useExplorerStore } from '../stores/explorer'

const conns = useConnectionsStore()
const explorer = useExplorerStore()

function onPreview(db: string, table: string) {
  console.log('preview', db, table) // Task 9 接入查询
}

onMounted(() => { if (conns.active) explorer.loadDatabases() })
watch(() => conns.activeId, () => { explorer.reset(); if (conns.active) explorer.loadDatabases() })
</script>

<template>
  <div class="explorer">
    <aside><DbTree @preview="onPreview" /></aside>
    <section class="work">
      <div class="muted" style="padding: 16px">查询区开发中…</div>
    </section>
  </div>
</template>

<style scoped>
.explorer { display: flex; height: 100%; }
aside { width: 280px; min-width: 280px; border-right: 1px solid #d0d7de; overflow: auto; }
.work { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
</style>
