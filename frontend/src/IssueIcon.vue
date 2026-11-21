<script setup lang="ts">
const paths = {
  inbox: 'M3 10.5 6 5h12l3 5.5V19H3z M3 12h5l1.5 3h5l1.5-3h5',
  assigned: 'M9 5H5v15h14V5h-4 M9 3h6v4H9z M8 13l2.5 2.5L16 10',
  feedback: 'M20 4H4v13h5l3 3 3-3h5z M8 9h8m-8 4h5',
  bug: 'M9 6 7 4m8 2 2-2m-5 8v7 M6 10 3 8m3 6H3m3 3-3 2m15-9 3-2m-3 6h3m-3 3 3 2 M6 11a6 6 0 0 1 12 0v3a6 6 0 0 1-12 0z M6 11h12',
  request: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M18 15v6m-3-3h6',
  draft: 'M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6m-6 4h6',
  plus: 'M12 5v14M5 12h14',
  arrow: 'm9 6 6 6-6 6',
  chevron: 'm6 9 6 6 6-6',
  down: 'M12 4v13m-5-5 5 5 5-5 M5 20h14',
  check: 'm5 12 4 4 10-10',
  jump: 'M12 5v14m-5-5 5 5 5-5',
  return: 'm8 7-4 4 4 4m-4-4h11a4 4 0 0 1 0 8h-3',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  close: 'm6 6 12 12M18 6 6 18',
  started: 'm9 6 10 6-10 6z',
  claimed: 'M17 20H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6m2 8 3 3 5-5M8 10h3m-3 4h2M14 4h4a2 2 0 0 1 2 2v3',
  passed: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM8 12l3 3 5-6',
}
defineProps<{ name: keyof typeof paths }>()
</script>

<template>
  <svg class="issue-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path :d="paths[name]" />
  </svg>
</template>
