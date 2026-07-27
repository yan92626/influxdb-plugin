<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { keymap } from '@codemirror/view'
import { Prec, Compartment } from '@codemirror/state'
import { sql } from '@codemirror/lang-sql'

const model = defineModel<string>({ required: true })
const emit = defineEmits<{ run: [] }>()

const host = ref<HTMLElement>()
let view: EditorView | undefined
const langConf = new Compartment()

onMounted(() => {
  view = new EditorView({
    parent: host.value!,
    doc: model.value,
    extensions: [
      basicSetup,
      langConf.of(sql()),
      Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => { emit('run'); return true } }])),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) model.value = u.state.doc.toString()
      }),
    ],
  })
})
onUnmounted(() => view?.destroy())

watch(model, (v) => {
  if (view && v !== view.state.doc.toString()) {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } })
  }
})
</script>

<template>
  <div ref="host" class="editor"></div>
</template>

<style scoped>
.editor { border: 1px solid #d0d7de; border-radius: 6px; overflow: auto; max-height: 220px; min-height: 90px; }
.editor :deep(.cm-editor) { min-height: 90px; }
</style>
