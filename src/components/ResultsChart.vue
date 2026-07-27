<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import uPlot from 'uplot'
import type { ChartData } from '../lib/chart'

const props = defineProps<{ data: ChartData }>()
const host = ref<HTMLElement>()
let plot: uPlot | undefined

const COLORS = ['#0969da', '#cf222e', '#2da44e', '#bf8700', '#8250df', '#bc4c00']

function render() {
  plot?.destroy()
  if (!host.value) return
  plot = new uPlot(
    {
      width: host.value.offsetWidth || 800,
      height: 320,
      series: [
        {},
        ...props.data.series.map((s, i) => ({
          label: s.label,
          stroke: COLORS[i % COLORS.length],
          width: 1.5,
        })),
      ],
    },
    [props.data.x, ...props.data.series.map((s) => s.values)] as uPlot.AlignedData,
    host.value,
  )
}

onMounted(render)
watch(() => props.data, render)
onUnmounted(() => plot?.destroy())
</script>

<template>
  <div ref="host"></div>
</template>
