import { validateImportConfig } from '../src/config-io.ts'
import { normalizeConfig } from '../src/config-runtime.ts'

const input = {
  accounts: {
    test_xhs: {
      platform: 'xiaohongshu',
      name: '测试小红书',
      enabled: true,
      content: {
        articles_per_day: 2,
        xhs_images_per_note: 6,
        xhs_min_words: 300,
        xhs_tags: ['考研', '学术日常'],
        topics: ['考研经验', '论文写作'],
        forbidden_words: ['第一', '绝对'],
      },
    },
  },
}

const validationResult = validateImportConfig(input as any)
const validated = validationResult.data!
console.log('Validated platform:', validated.accounts?.test_xhs?.platform)
console.log('Validated publish_mode:', validated.accounts?.test_xhs?.publish_mode)
console.log('Validated cover_ratio:', validated.accounts?.test_xhs?.content?.headline_cover_ratio)
console.log('Validated xhs_images_per_note:', validated.accounts?.test_xhs?.content?.xhs_images_per_note)
console.log('Validated xhs_min_words:', validated.accounts?.test_xhs?.content?.xhs_min_words)
console.log('Validated xhs_tags:', validated.accounts?.test_xhs?.content?.xhs_tags)

const summary = validationResult.summary!
console.log('Summary xhs_accounts:', summary.xhs_accounts)

const normalized = normalizeConfig(validated as any)
console.log('Normalized platform:', normalized.accounts?.test_xhs?.platform)
console.log('Normalized cover_ratio:', normalized.accounts?.test_xhs?.content?.headline_cover_ratio)
console.log('Normalized xhs_images_per_note:', normalized.accounts?.test_xhs?.content?.xhs_images_per_note)
console.log('Normalized xhs_min_words:', normalized.accounts?.test_xhs?.content?.xhs_min_words)
console.log('Normalized xhs_tags:', normalized.accounts?.test_xhs?.content?.xhs_tags)

import { mergeConfigData } from '../src/config-io.ts'
import { applyNormalizedConfig } from '../src/config-runtime.ts'

// Test mergeConfigData
const merged = mergeConfigData(normalized, {
  accounts: {
    test_xhs: {
      platform: 'xiaohongshu',
      name: '修改后的测试小红书',
      enabled: true,
      content: {
        xhs_images_per_note: 8,
      } as any,
    } as any,
  },
})
console.log('Merged name:', merged.accounts.test_xhs.name)
console.log('Merged platform:', merged.accounts.test_xhs.platform)
console.log('Merged xhs_images_per_note:', merged.accounts.test_xhs.content.xhs_images_per_note)
console.log('Merged preserved xhs_min_words:', merged.accounts.test_xhs.content.xhs_min_words)

// Test applyNormalizedConfig
const appliedTarget = normalizeConfig({ accounts: {} } as any)
applyNormalizedConfig(appliedTarget, merged, true)
console.log('Applied target platform:', appliedTarget.accounts.test_xhs.platform)

if (
  validated.accounts?.test_xhs?.platform === 'xiaohongshu' &&
  normalized.accounts?.test_xhs?.platform === 'xiaohongshu' &&
  summary.xhs_accounts === 1 &&
  normalized.accounts?.test_xhs?.content?.headline_cover_ratio === '3:4' &&
  normalized.accounts?.test_xhs?.content?.xhs_images_per_note === 6 &&
  normalized.accounts?.test_xhs?.content?.xhs_min_words === 300 &&
  normalized.accounts?.test_xhs?.content?.xhs_tags?.length === 2 &&
  merged.accounts.test_xhs.platform === 'xiaohongshu' &&
  merged.accounts.test_xhs.content.xhs_images_per_note === 8 &&
  merged.accounts.test_xhs.content.xhs_min_words === 300 &&
  appliedTarget.accounts.test_xhs.platform === 'xiaohongshu'
) {
  console.log('ALL TESTS PASSED SUCCESSFULLY!')
} else {
  console.error('TEST FAILED!')
  process.exit(1)
}
