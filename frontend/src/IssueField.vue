<script setup lang="ts">
import { computed } from 'vue'
import type { IssueFieldSpec } from './issuesApi'

defineProps<{ field: IssueFieldSpec; error?: string }>()
const model = defineModel<string | null>()
const selection = computed({ get: () => model.value ?? '', set: value => { model.value = value || null } })
</script>

<template>
  <div class="form-field" :class="{ wide: field.key === 'title' || (field.multiline && !field.pair) }">
    <label :for="field.key">{{ field.label }}<span v-if="!field.optional" class="required" aria-hidden="true">*</span></label>
    <div v-if="field.options" class="select-control">
      <select :id="field.key" v-model="selection" :aria-required="!field.optional" :aria-invalid="!!error"
        :aria-describedby="error ? `${field.key}-error` : undefined">
        <option value="">请选择</option>
        <option v-for="option in field.options" :key="option">{{ option }}</option>
      </select>
    </div>
    <textarea v-else-if="field.multiline" :id="field.key" v-model="model" maxlength="5000"
      :aria-required="!field.optional" :aria-invalid="!!error"
      :aria-describedby="error ? `${field.key}-error` : undefined"></textarea>
    <input v-else :id="field.key" v-model="model" :type="field.type ?? 'text'"
      :maxlength="field.type ? undefined : field.limit ?? 120" :placeholder="field.placeholder"
      :aria-required="!field.optional" :aria-invalid="!!error"
      :aria-describedby="error ? `${field.key}-error` : undefined">
    <p v-if="error" :id="`${field.key}-error`" class="field-error">{{ error }}</p>
  </div>
</template>
