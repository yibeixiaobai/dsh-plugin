import type { Config } from '../config.ts'
import { readTaskManifest } from '../sandbox/taskSandbox.ts'
import { publishTool } from './publish.ts'
import type { SocialPublisherToolArgs } from './socialPublisherUnifiedTypes.ts'

export async function executePublishAction(params: {
  cfg: Config
  args: SocialPublisherToolArgs
  targetAccountId: string
  targetPlatform: string
  effectiveWs?: string
  isDry: boolean
  toolContext?: any
}): Promise<any> {
  const { cfg, args, targetAccountId, targetPlatform, effectiveWs, isDry, toolContext } = params

  if (args.user_confirmed !== true && !args.force) {
    throw new Error(
      '【发布强门禁拦截】：稿件尚未经过用户审校确认，请先在前端卡片中确认内容无误后再执行发布。',
    )
  }

  const pubTool = publishTool(cfg)
  let resolvedBatchTitles = args.titles && args.titles.length > 0 ? args.titles : undefined
  let resolvedBatchDigests = args.digests && args.digests.length > 0 ? args.digests : undefined
  let resolvedBatchFiles: string[] | undefined =
    args.article_files && args.article_files.length > 0 ? args.article_files : undefined

  // 当多图文组合发布时，若未显式传完整 titles/digests/article_files，且提供了 task_id，
  // 自动从任务沙箱 manifest 中自愈补齐待发布的图文篇目、摘要与文件名，彻底消除参数不对齐的阻断
  if ((!resolvedBatchTitles || !resolvedBatchFiles) && args.task_id) {
    try {
      const sm = readTaskManifest(cfg, args.task_id, effectiveWs)
      const tg =
        sm?.targets?.[targetPlatform + '_' + targetAccountId] ||
        sm?.targets?.['gzh_' + targetAccountId]
      if (tg && Array.isArray(tg.articles) && tg.articles.length > 0) {
        const validArts = tg.articles.filter(
          (a: any) => !a.fileName?.includes('_pic.json') && a.kind !== 'newspic',
        )
        if (validArts.length > 0) {
          if (!resolvedBatchTitles) resolvedBatchTitles = validArts.map((a: any) => a.title).filter(Boolean)
          if (!resolvedBatchDigests) resolvedBatchDigests = validArts.map((a: any) => a.digest || '')
          if (!resolvedBatchFiles) resolvedBatchFiles = validArts.map((a: any) => a.fileName).filter(Boolean)
        }
      }
    } catch {}
  }

  const accountProfile =
    cfg.accounts?.[targetAccountId] || ({ id: targetAccountId, platform: targetPlatform } as any)
  const resolvedAction = args.publish_action || accountProfile.publish_action_default || 'draft'
  const resolvedScheduleTime = args.schedule_time || (resolvedAction === 'schedule' ? 'auto' : undefined)

  const pubRes = await pubTool.execute(
    {
      account_id: targetAccountId,
      task_id: args.task_id,
      titles: resolvedBatchTitles || (args.title ? [args.title] : undefined),
      digests: resolvedBatchDigests,
      article_files: resolvedBatchFiles,
      workspace: effectiveWs,
      dry_run: isDry,
      publish_action: resolvedAction,
      schedule_time: resolvedScheduleTime,
      publish_immediately: args.publish_immediately,
      signed_manifest_hash: args.signed_manifest_hash,
      signed_article_hashes: args.signed_article_hashes,
      target_article_indices: args.target_article_indices,
      combine_as_batch: args.combine_as_batch !== undefined ? args.combine_as_batch : true,
      user_confirmed: true,
      force: args.force,
      from_unified_tool: true,
    },
    toolContext,
  )

  return {
    ok: true,
    action: 'publish',
    published: !isDry,
    publish_result: pubRes,
  }
}
