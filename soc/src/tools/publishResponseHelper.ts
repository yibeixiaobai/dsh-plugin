/**
 * 发布结果响应格式化与沙箱状态同步辅助函数
 */

import type { Config } from '../config.ts'
import type { StandardPublishResult } from '../adapters/types.ts'
import type { PublishOk, ZhihuDraftInfo, WechatOriginalResult } from './publishTypes.ts'
import { archiveTaskSandbox, calculateManifestFingerprint, writeTaskManifest } from '../sandbox/taskSandbox.ts'

export interface FormatPublishResponseOptions {
  res: StandardPublishResult
  sandbox: any
  effectiveCfg: Config
  isDryRun: boolean
  effectiveTraceId: string
  cfRecipeId?: string
  encryptedUsed?: boolean
}

export function formatPublishResponse({
  res,
  sandbox,
  effectiveCfg,
  isDryRun,
  effectiveTraceId,
  cfRecipeId,
  encryptedUsed,
}: FormatPublishResponseOptions): PublishOk {
  const drafts: ZhihuDraftInfo[] = res.items.map(it => ({
    draft_id: it.draftId || '',
    title: it.title,
    url: it.url || '',
    published: it.published,
  }))

  const okResult: PublishOk = {
    account_id: res.accountId,
    platform: res.platform,
    publish_mode: res.publishMode,
    dry_run: res.dryRun,
    media_id: res.mediaId,
    media_ids: res.mediaIds,
    drafts: drafts.length > 0 ? drafts : undefined,
    draft_url: res.items.find(it => it.url)?.url,
    article_count: res.articleCount,
    titles: res.titles,
    verify: res.verify,
    result_file: res.resultFile,
    already_published: res.alreadyPublished,
    dedup_note: res.dedupNote,
    original_result: res.originalResult as WechatOriginalResult | undefined,
    publish_action: res.publishAction,
    publish_status: res.scheduleError
      ? 'failed'
      : res.publishAction === 'publish_now'
        ? 'published'
        : res.publishAction === 'schedule'
          ? 'scheduled'
          : 'draft_saved',
    scheduled_time: res.scheduledTime,
    scheduled_job_id: res.scheduledJobId,
    ...(res.scheduleError ? { schedule_error: res.scheduleError } : {}),
    needs_qr_confirmation: res.needsQrConfirmation,
    qr_screenshot: res.qrScreenshot,
    receipt_screenshot: res.receiptScreenshot,
    cleaned_duplicates_count: res.cleanedDuplicatesCount,
    synced_schedule_tasks_count: res.syncedScheduleTasksCount,
    cloudflare_recipe_id: cfRecipeId || res.cloudflareRecipeId,
    encrypted_workflow_used: encryptedUsed || Boolean(res.encryptedWorkflowUsed),
    trace_id: res.traceId || effectiveTraceId,
    ...(res.fallbackFromApi ? {
      fallback_from_api: true,
      api_fallback_reason: res.apiFallbackReason,
    } : {}),
    failure_snapshot_dir: res.failureSnapshotDir,
    _social_event: {
      v: 1,
      stage: res.scheduleError ? 'review' : 'published',
      platform: res.platform,
      accountId: res.accountId,
      articles: res.items.map(it => ({
        index: it.index,
        title: it.title,
        digest: it.digest,
      })),
      publishedInfo: {
        mediaId: res.mediaId,
        draftId: res.items[0]?.draftId,
        scheduledTime: res.scheduledTime,
        isVerified: res.verify?.checked,
        receiptScreenshot: res.receiptScreenshot,
        qrScreenshot: res.qrScreenshot,
      },
      step: {
        id: 'publish_dispatch',
        label: `发布至 ${res.platform}`,
        status: res.scheduleError ? 'failed' : 'completed',
      },
    },
  }

  sandbox.targetGroup.publishResult = {
    status: res.scheduleError
      ? 'failed'
      : isDryRun
        ? 'dry_run'
        : (res.publishAction === 'schedule' ? 'scheduled' : 'success'),
    mediaId: res.mediaId,
    draftUrl: res.items.find(it => it.url)?.url,
    publishedAt: new Date().toISOString(),
    scheduledTime: res.scheduledTime,
    receiptFile: res.resultFile,
    error: res.scheduleError,
  }
  sandbox.manifest.stage = isDryRun ? 'reviewed' : 'published'
  writeTaskManifest(effectiveCfg, sandbox.manifest)

  okResult.task_id = sandbox.taskId
  okResult.manifest_fingerprint = calculateManifestFingerprint(sandbox.manifest)

  // 【中文修复依据】：发布终局态（非演练且无排期错误）触发原子归档，将活跃沙箱整体移入 tasks/archive/，保持 active 目录干净
  if (!isDryRun && !res.scheduleError) {
    try {
      const archivedPath = archiveTaskSandbox(effectiveCfg, sandbox.taskId, sandbox.manifest?.workspacePath)
      if (archivedPath) {
        okResult.archived_path = archivedPath
      }
    } catch (archiveErr) {
      console.warn('[publish] archive non-fatal:', archiveErr)
    }
  }
  if (isDryRun) {
    okResult.publish_status = 'dry_run' as any
    ;(okResult as any).warning = '【演练模式提示】：本次处于离线演练模式，稿件已在本地完成校验与沙箱存证，未向线上正式发布！'
  }

  return okResult
}
