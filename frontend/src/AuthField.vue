<script setup lang="ts">
import { ElInput } from 'element-plus'
import { ref } from 'vue'

const props = defineProps<{
  name: string
  label: string
  placeholder: string
  autocomplete: string
  type?: 'email' | 'password'
  error?: string
}>()
const model = defineModel<string>({ required: true })
const showPassword = ref(false)
</script>

<template>
  <div class="field" :class="{ 'has-error': error }">
    <label :for="name">{{ label }}</label>
    <ElInput
      :id="name"
      v-model="model"
      :name="name"
      :type="showPassword ? 'text' : (props.type ?? 'text')"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :spellcheck="false"
      autocapitalize="none"
      :aria-invalid="Boolean(error)"
      :aria-describedby="error ? `${name}-error` : undefined"
      required
    >
      <template v-if="type === 'password'" #suffix>
        <button
          class="reveal"
          type="button"
          :aria-controls="name"
          :aria-label="`${showPassword ? '隐藏' : '显示'}${label}`"
          @click="showPassword = !showPassword"
        >{{ showPassword ? '隐藏' : '显示' }}</button>
      </template>
    </ElInput>
    <p v-if="error" :id="`${name}-error`" class="field-error" aria-live="polite">{{ error }}</p>
  </div>
</template>
