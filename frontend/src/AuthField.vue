<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  name: string
  label: string
  hint?: string
  autocomplete: string
  type?: 'email' | 'password'
  error?: string
  busy?: boolean
}>()
const model = defineModel<string>({ required: true })
const showPassword = ref(false)
</script>

<template>
  <div class="auth-field" :class="{ 'has-error': error }">
    <div class="field-caption">
      <label :for="name">{{ label }}</label>
      <span v-if="hint && !error" :id="`${name}-hint`" class="field-hint">{{ hint }}</span>
    </div>
    <div class="input-shell">
      <input
        :id="name" v-model="model" :name="name" :type="showPassword ? 'text' : (props.type ?? 'text')"
        :autocomplete="autocomplete" :spellcheck="false" autocapitalize="none" :readonly="busy"
        :aria-invalid="error ? true : undefined"
        :aria-describedby="error ? `${name}-error` : hint ? `${name}-hint` : undefined" required
      >
      <button
        v-if="type === 'password'" class="reveal" type="button" :disabled="busy"
        :aria-controls="name" :aria-label="`${showPassword ? '隐藏' : '显示'}${label}`"
        @click="showPassword = !showPassword"
      >{{ showPassword ? '隐藏' : '显示' }}</button>
    </div>
    <p :id="`${name}-error`" class="field-feedback" aria-live="polite">{{ error }}</p>
  </div>
</template>
