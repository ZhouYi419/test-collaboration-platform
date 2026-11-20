<script setup lang="ts">
import { onUnmounted, ref, useId } from 'vue'

interface Confirmation {
  title: string
  message: string
  label: string
  danger?: boolean
}

const dialog = ref<HTMLDialogElement>()
const content = ref<Confirmation>({ title: '', message: '', label: '' })
const titleId = useId()
let resolveConfirmation: ((accepted: boolean) => void) | undefined

function ask(confirmation: Confirmation): Promise<boolean> {
  if (resolveConfirmation || !dialog.value) return Promise.resolve(false)
  content.value = confirmation
  dialog.value.returnValue = 'cancel'
  return new Promise(resolve => {
    resolveConfirmation = resolve
    dialog.value?.showModal()
  })
}

function close(accepted: boolean) {
  dialog.value?.close(accepted ? 'confirm' : 'cancel')
}

function settle() {
  const resolve = resolveConfirmation
  resolveConfirmation = undefined
  resolve?.(dialog.value?.returnValue === 'confirm')
}

onUnmounted(() => {
  resolveConfirmation?.(false)
  resolveConfirmation = undefined
})
defineExpose({ ask })
</script>

<template>
  <dialog ref="dialog" class="account-editor issue-confirm" :aria-labelledby="titleId"
    @cancel.prevent="close(false)" @close="settle">
    <form method="dialog" @submit.prevent="close(true)">
      <div class="editor-body">
        <h2 :id="titleId">{{ content.title }}</h2>
        <p>{{ content.message }}</p>
      </div>
      <div class="editor-actions">
        <button class="admin-button" type="button" autofocus @click="close(false)">取消</button>
        <button class="admin-primary" :class="{ 'danger-button': content.danger }" type="submit">{{ content.label }}</button>
      </div>
    </form>
  </dialog>
</template>
