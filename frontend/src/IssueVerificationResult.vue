<script setup lang="ts">
import IssueIcon from './IssueIcon.vue'
import { issueDate, type VerificationResult } from './issuesApi'

defineProps<{ result: VerificationResult; previous?: boolean; receipt?: string }>()
</script>

<template>
  <section class="detail-section verification-result">
    <h2 id="verification-result" tabindex="-1" :aria-describedby="receipt ? 'verification-receipt' : undefined">
      {{ previous ? '上次验证' : '验证结果' }}
    </h2>
    <p class="verification-outcome" :data-outcome="result.outcome">
      <IssueIcon :name="result.outcome === 'returned' ? 'return' : 'check'" />
      {{ result.outcome === 'returned' ? '验证未通过，已退回' : '验证通过' }}
    </p>
    <p v-if="result.reason" class="detail-text verification-reason">{{ result.reason }}</p>
    <p class="verification-meta">
      {{ result.tester.username }} · <time :datetime="new Date(result.verified_at).toISOString()">{{ issueDate(result.verified_at) }}</time>
    </p>
    <span v-if="receipt" id="verification-receipt" class="verification-announcement" role="status">{{ receipt }}</span>
  </section>
</template>
