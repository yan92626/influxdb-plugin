<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import uPlot from 'uplot'
import type { QueryResult } from '../api/client'
import { formatChartAxisTicks } from '../lib/timezone'
import {
  getChartSchema,
  toChartData,
  type ChartAggregation,
  type ChartSeries,
} from '../lib/chart'

const props = defineProps<{ result: QueryResult; timezone: string }>()
const host = ref<HTMLElement>()
const shell = ref<HTMLElement>()
const metric = ref('')
const groupBy = ref<string[]>([])
const aggregation = ref<ChartAggregation>('last')
const bucket = ref<'auto' | number>('auto')
const hiddenSeries = ref(new Set<string>())
const hover = ref<{ time: string; left: number; top: number; values: { label: string; value: string; color: string }[] } | null>(null)
let plot: uPlot | undefined
let resizeObserver: ResizeObserver | undefined

const COLORS = [
  '#0969da', '#cf222e', '#1a7f37', '#9a6700', '#8250df', '#bc4c00', '#00838f',
  '#d1248f', '#57606a', '#0550ae', '#116329', '#6e7781',
]
const schema = computed(() => getChartSchema(props.result))
const chartData = computed(() => toChartData(props.result, {
  metric: metric.value,
  groupBy: groupBy.value,
  aggregation: aggregation.value,
  bucketSeconds: bucket.value,
}))

const bucketLabel = computed(() => {
  const seconds = chartData.value?.bucketSeconds ?? 0
  if (!seconds) return '原始时间点'
  if (seconds < 60) return `${seconds} 秒桶`
  if (seconds < 3600) return `${seconds / 60} 分钟桶`
  return `${seconds / 3600} 小时桶`
})

function resetSelections() {
  metric.value = schema.value?.metrics[0] ?? ''
  groupBy.value = [...(schema.value?.dimensions ?? [])]
  aggregation.value = 'last'
  bucket.value = 'auto'
  hiddenSeries.value = new Set()
}

function toggleDimension(column: string, checked: boolean) {
  groupBy.value = checked
    ? [...groupBy.value, column]
    : groupBy.value.filter((item) => item !== column)
}

function toggleSeries(index: number, label: string) {
  if (!plot) return
  const next = new Set(hiddenSeries.value)
  const show = next.has(label)
  if (show) next.delete(label)
  else next.add(label)
  hiddenSeries.value = next
  plot.setSeries(index + 1, { show })
}

function formatValue(value: number, series?: ChartSeries): string {
  const magnitude = Math.abs(value)
  const digits = magnitude >= 100 ? 1 : magnitude >= 1 ? 2 : 4
  const formatted = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: digits }).format(value)
  return `${formatted}${series && chartData.value?.unit ? ` ${chartData.value.unit}` : ''}`
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: props.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(new Date(timestamp * 1000))
}

function resetZoom() {
  if (!plot || !chartData.value?.x.length) return
  const first = chartData.value.x[0]
  const last = chartData.value.x[chartData.value.x.length - 1]
  plot.setScale('x', {
    min: first === last ? first - 1 : first,
    max: first === last ? last + 1 : last,
  })
}

function interactionPlugin(): uPlot.Plugin {
  let wheelHandler: ((event: WheelEvent) => void) | undefined
  let doubleClickHandler: (() => void) | undefined
  return {
    hooks: {
      ready: [(self) => {
        wheelHandler = (event) => {
          event.preventDefault()
          const currentMin = self.scales.x.min
          const currentMax = self.scales.x.max
          const allTimes = chartData.value?.x
          if (currentMin == null || currentMax == null || !allTimes?.length) return
          const center = self.posToVal(event.offsetX, 'x')
          const factor = event.deltaY < 0 ? 0.8 : 1.25
          const fullMin = allTimes.length === 1 ? allTimes[0] - 1 : allTimes[0]
          const fullMax = allTimes.length === 1 ? allTimes[0] + 1 : allTimes[allTimes.length - 1]
          const nextMin = Math.max(fullMin, center - (center - currentMin) * factor)
          const nextMax = Math.min(fullMax, center + (currentMax - center) * factor)
          self.setScale('x', { min: nextMin, max: nextMax })
        }
        doubleClickHandler = resetZoom
        self.over.addEventListener('wheel', wheelHandler, { passive: false })
        self.over.addEventListener('dblclick', doubleClickHandler)
      }],
      setCursor: [(self) => {
        const index = self.cursor.idx
        if (index == null || !chartData.value) {
          hover.value = null
          return
        }
        const values = chartData.value.series.flatMap((series, seriesIndex) => {
          const value = series.values[index]
          if (value == null || hiddenSeries.value.has(series.label)) return []
          return [{ label: series.label, value: formatValue(value, series), color: COLORS[seriesIndex % COLORS.length] }]
        })
        hover.value = {
          time: formatTime(chartData.value.x[index]),
          left: Math.min((self.cursor.left ?? 0) + 72, Math.max(12, self.width - 270)),
          top: Math.max(12, (self.cursor.top ?? 0) - 16),
          values,
        }
      }],
      destroy: [(self) => {
        if (wheelHandler) self.over.removeEventListener('wheel', wheelHandler)
        if (doubleClickHandler) self.over.removeEventListener('dblclick', doubleClickHandler)
      }],
    },
  }
}

function render() {
  plot?.destroy()
  hover.value = null
  const data = chartData.value
  if (!host.value || !data) return
  host.value.replaceChildren()
  const width = Math.max(640, host.value.offsetWidth)
  const height = Math.max(320, Math.min(520, shell.value?.clientHeight ?? 420))
  plot = new uPlot(
    {
      width,
      height,
      scales: {
        y: { range: (_self, min, max) => {
          if (min === max) return [min - Math.max(Math.abs(min) * 0.05, 1), max + Math.max(Math.abs(max) * 0.05, 1)]
          const padding = (max - min) * 0.08
          return [min - padding, max + padding]
        } },
      },
      axes: [
        {
          label: `时间 · ${props.timezone}`,
          labelSize: 18,
          size: 52,
          stroke: '#57606a',
          grid: { stroke: '#d8dee466', width: 1 },
          values: (_self, splits, _axisIndex, _space, increment) =>
            formatChartAxisTicks(splits, props.timezone, increment),
        },
        { label: data.unit || data.metric, stroke: '#57606a', grid: { stroke: '#d8dee488', width: 1 }, size: 62 },
      ],
      cursor: {
        drag: { x: true, y: false, setScale: true },
        focus: { prox: 32 },
        points: { size: 7, width: 2 },
      },
      legend: { show: false },
      focus: { alpha: 0.2 },
      series: [
        {},
        ...data.series.map((series, index) => ({
          label: series.label,
          stroke: COLORS[index % COLORS.length],
          width: 2,
          spanGaps: false,
          points: { show: data.x.length <= 40, size: 5, width: 1.5 },
        })),
      ],
      plugins: [interactionPlugin()],
    },
    [data.x, ...data.series.map((series) => series.values)] as uPlot.AlignedData,
    host.value,
  )
}

watch(() => props.result, resetSelections, { immediate: true })
watch([chartData, () => props.timezone], async () => {
  hiddenSeries.value = new Set()
  await nextTick()
  render()
})

onMounted(() => {
  render()
  resizeObserver = new ResizeObserver(() => {
    if (!plot || !host.value) return
    const width = Math.max(640, host.value.offsetWidth)
    const height = Math.max(320, Math.min(520, shell.value?.clientHeight ?? 420))
    if (plot.width !== width || plot.height !== height) plot.setSize({ width, height })
  })
  if (shell.value) resizeObserver.observe(shell.value)
})
onUnmounted(() => {
  resizeObserver?.disconnect()
  plot?.destroy()
})
</script>

<template>
  <section class="chart-workspace">
    <div class="chart-controls" v-if="schema">
      <label>指标
        <select v-model="metric">
          <option v-for="item in schema.metrics" :key="item" :value="item">{{ item }}</option>
        </select>
      </label>
      <details class="dimension-picker">
        <summary>拆分维度 <span>{{ groupBy.length ? `${groupBy.length} 项` : '不拆分' }}</span></summary>
        <div class="dimension-options">
          <label v-for="column in schema.dimensions" :key="column">
            <input
              type="checkbox"
              :checked="groupBy.includes(column)"
              @change="toggleDimension(column, ($event.target as HTMLInputElement).checked)"
            >
            {{ column }}
          </label>
          <span v-if="!schema.dimensions.length" class="muted">结果中没有可用维度</span>
        </div>
      </details>
      <label>聚合
        <select v-model="aggregation">
          <option value="last">最后值</option>
          <option value="avg">平均值</option>
          <option value="min">最小值</option>
          <option value="max">最大值</option>
        </select>
      </label>
      <label>时间粒度
        <select v-model="bucket">
          <option value="auto">自动</option>
          <option :value="0">原始</option>
          <option :value="10">10 秒</option>
          <option :value="60">1 分钟</option>
          <option :value="300">5 分钟</option>
          <option :value="900">15 分钟</option>
          <option :value="3600">1 小时</option>
        </select>
      </label>
      <button class="btn reset-zoom" @click="resetZoom">复位缩放</button>
      <span class="interaction-hint">拖拽框选 · 滚轮缩放 · 双击复位</span>
    </div>

    <div v-if="chartData" class="chart-meta">
      <span>{{ chartData.sourceRows }} 行</span>
      <span>{{ chartData.x.length }} 个时间点</span>
      <span>{{ chartData.series.length }} 条序列</span>
      <span>{{ bucketLabel }}</span>
      <span v-if="chartData.duplicatePoints" class="notice">已聚合 {{ chartData.duplicatePoints }} 个重叠采样</span>
      <span v-if="chartData.omittedSeries" class="warning">序列过多，已隐藏 {{ chartData.omittedSeries }} 条</span>
      <span v-if="chartData.validRows < chartData.sourceRows" class="warning">已忽略 {{ chartData.sourceRows - chartData.validRows }} 行无效值</span>
    </div>

    <div ref="shell" class="plot-shell">
      <div ref="host" class="plot-host"></div>
      <div v-if="hover" class="chart-tooltip" :style="{ left: `${hover.left}px`, top: `${hover.top}px` }">
        <strong>{{ hover.time }}</strong>
        <div v-for="item in hover.values" :key="item.label">
          <i :style="{ background: item.color }"></i>
          <span>{{ item.label }}</span>
          <b>{{ item.value }}</b>
        </div>
      </div>
    </div>

    <div v-if="chartData" class="series-legend" aria-label="序列图例">
      <button
        v-for="(series, index) in chartData.series"
        :key="series.label"
        :class="{ hidden: hiddenSeries.has(series.label) }"
        @click="toggleSeries(index, series.label)"
      >
        <i :style="{ background: COLORS[index % COLORS.length] }"></i>
        <strong :title="series.label">{{ series.label }}</strong>
        <span>最新 {{ formatValue(series.latest, series) }}</span>
        <span>均值 {{ formatValue(series.avg, series) }}</span>
        <span>范围 {{ formatValue(series.min) }}–{{ formatValue(series.max, series) }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.chart-workspace { min-width: 680px; display: flex; flex-direction: column; color: #24292f; }
.chart-controls { min-height: 44px; display: flex; align-items: center; gap: 12px; padding: 8px 4px; border-bottom: 1px solid #d8dee4; flex-wrap: wrap; }
.chart-controls > label { display: flex; align-items: center; gap: 6px; color: #57606a; font-size: 12px; }
.chart-controls select { min-width: 108px; background: #fff; }
.dimension-picker { position: relative; }
.dimension-picker summary { list-style: none; padding: 4px 9px; border: 1px solid #d0d7de; border-radius: 6px; background: #fff; cursor: pointer; color: #57606a; font-size: 12px; }
.dimension-picker summary::-webkit-details-marker { display: none; }
.dimension-picker summary span { margin-left: 5px; color: #0969da; }
.dimension-options { position: absolute; z-index: 5; top: calc(100% + 5px); left: 0; min-width: 200px; max-height: 240px; overflow: auto; padding: 8px; border: 1px solid #d0d7de; border-radius: 7px; background: #fff; box-shadow: 0 8px 24px #8c959f33; }
.dimension-options label { display: flex; align-items: center; gap: 7px; padding: 5px 3px; white-space: nowrap; }
.dimension-options input { margin: 0; }
.reset-zoom { margin-left: auto; }
.interaction-hint { color: #6e7781; font-size: 12px; }
.chart-meta { display: flex; gap: 14px; padding: 7px 8px 5px; color: #57606a; font-size: 12px; flex-wrap: wrap; }
.chart-meta span + span { position: relative; }
.chart-meta span + span::before { content: '·'; position: absolute; left: -9px; color: #afb8c1; }
.chart-meta .notice { color: #0969da; }
.chart-meta .warning { color: #9a6700; }
.plot-shell { position: relative; flex: 1; min-height: 340px; overflow: hidden; }
.plot-host { width: 100%; }
.plot-host :deep(.uplot) { font-family: inherit; }
.plot-host :deep(.u-select) { background: #0969da1a; border: 1px solid #0969da66; }
.chart-tooltip { position: absolute; z-index: 4; width: 250px; max-height: 220px; overflow: auto; padding: 9px 10px; border: 1px solid #afb8c1; border-radius: 7px; background: #fffffff2; box-shadow: 0 8px 24px #8c959f33; pointer-events: none; backdrop-filter: blur(4px); font-size: 12px; }
.chart-tooltip strong { display: block; margin-bottom: 5px; color: #57606a; font-weight: 600; }
.chart-tooltip div { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; align-items: center; gap: 7px; min-height: 24px; }
.chart-tooltip i, .series-legend i { width: 8px; height: 8px; border-radius: 50%; }
.chart-tooltip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chart-tooltip b { font-variant-numeric: tabular-nums; }
.series-legend { display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 1px; margin-top: 5px; border-top: 1px solid #d8dee4; background: #d8dee4; }
.series-legend button { display: grid; grid-template-columns: 10px minmax(90px, 1fr) auto auto auto; align-items: center; gap: 8px; min-width: 0; padding: 7px 9px; border: 0; background: #fff; color: #57606a; text-align: left; font: inherit; font-size: 11px; }
.series-legend button:hover { background: #f6f8fa; }
.series-legend button.hidden { opacity: 0.42; }
.series-legend strong { overflow: hidden; color: #24292f; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.series-legend span { white-space: nowrap; font-variant-numeric: tabular-nums; }
@media (max-width: 900px) {
  .interaction-hint { display: none; }
  .series-legend { grid-template-columns: 1fr; }
}
</style>
