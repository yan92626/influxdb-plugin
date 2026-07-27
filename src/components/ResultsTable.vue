<script setup lang="ts">
import { computed } from 'vue'
import type { QueryResult } from '../api/client'

const props = defineProps<{ result: QueryResult }>()
const MAX_RENDER = 1000
const shown = computed(() => props.result.rows.slice(0, MAX_RENDER))
</script>

<template>
  <div class="wrap">
    <table class="grid">
      <thead>
        <tr><th v-for="c in result.columns" :key="c">{{ c }}</th></tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in shown" :key="i">
          <td v-for="(cell, j) in row" :key="j">{{ cell ?? '' }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="result.rows.length > MAX_RENDER" class="muted">
      仅渲染前 {{ MAX_RENDER }} 行（共 {{ result.rows.length }} 行），完整数据请导出
    </p>
  </div>
</template>

<style scoped>
.wrap { overflow: auto; height: 100%; }
</style>
