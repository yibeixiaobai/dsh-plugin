import fs from 'node:fs'; import path from 'node:path'
import type { Config, PublishAction } from '../config.ts'
import { resolveAccount } from '../config-runtime.ts'
import { readAccountPublishRecords } from '../publish-history.ts'
import { checkScheduledTitleCollision, normalizeTitle, resolveNextScheduleSlot } from '../schedule-manager.ts'
import { isInvalidPlaceholderTitle } from '../title-adapter.ts'
import {
  loadWechatDrafts,
  scanDuplicateDrafts,
  batchDeleteWechatDrafts,
} from '../draft-manager.ts'
import {
  assertWechatCreds,
  brandDir,
  brandImagePath,
  contentImagesPerArticle,
  MEDIA_ID_FILE,
  readUploadCache,
  removeJobFile,
  RESULT_FILE,
  runtimeResourceDir,
  runPipeline,
  writeJobFile,
  writeTextFile,
  writeUploadCache,
} from '../tools/shared.ts'
import {
  continueWechatDraftInBrowser,
  enableWechatDraftOriginal,
  publishWechatDraftByBrowser,
  syncWechatScheduledTasks,
  syncWechatDrafts,
  wechatCheckLogin,
  wechatLogin,
  type WechatBrowserPublishJob,
  type WechatDraftContinuationResult,
  type WechatOriginalResult,
} from '../wechat-browser.ts'
import { BasePlatformAdapter } from './base-adapter.ts'
import { wechatProfileDir } from '../sync-paths.ts'
import type {
  LoginCheckResult,
  PlatformCapabilities,
  PublishContext,
  QrLoginResult,
  StandardPublishItem,
  StandardPublishResult,
} from './types.ts'
interface PublishResult {
  dry_run: boolean
  media_id?: string
  media_ids?: string[]
  article_count?: number
  titles?: string[]
  cache: Record<string, string>
  verify?: { checked: boolean; article_count?: number; results?: unknown[] }
  checks?: string[]
  publish_action?: string
  publish_id?: string
  publish_ids?: string[]
  publish_status?: number
}

export class WechatPlatformAdapter extends BasePlatformAdapter {
  readonly capabilities: PlatformCapabilities = {
    id: 'gzh',
    displayName: '微信公众号',
    supportedModes: ['api', 'browser'],
    supportedActions: ['draft', 'publish_now', 'schedule'],
    articleFormat: 'html',
    supportedArticleTypes: ['news', 'newspic'], supportsBatchCombination: true,
    maxTitleLength: 64, // 普通长文 64，小绿书由校验器重载为 32
    maxDigestLength: 120,
    maxArticlesPerBatch: 20,
    coverAspectRatios: ['2.35:1', '1:1', '3:4'],
    supportsOriginalDeclaration: true,
    supportsBrandImages: true,
    supportsScheduledSlots: true,
  }

  async validateBeforePublish(ctx: PublishContext): Promise<{ valid: boolean; errors: string[] }> {
    const baseRes = await super.validateBeforePublish(ctx); const isNewspic = this.isNewspicMode(ctx)
    const maxTitle = isNewspic ? 32 : 64 // 小绿书标题最大 32 字，长文 64 字

    const errors: string[] = [...baseRes.errors]
    const { titles, digests, articleFiles } = ctx

    if (!Array.isArray(titles) || titles.length === 0 || titles.length > this.capabilities.maxArticlesPerBatch) {
      errors.push(`titles 必须包含 1~${this.capabilities.maxArticlesPerBatch} 个标题`)
    }
    if (!Array.isArray(digests) || digests.length !== titles.length) {
      errors.push(`digests 数量（${digests?.length ?? 0}）必须与 titles 数量（${titles.length}）一致`)
    }
    if (articleFiles && articleFiles.length !== titles.length) {
      errors.push(`article_files 数量（${articleFiles.length}）必须与 titles 数量（${titles.length}）一致`)
    }

    for (let i = 0; i < (titles || []).length; i++) {
      const t = titles[i]
      if (typeof t !== 'string' || t.length > maxTitle) {
        errors.push(`标题超 ${maxTitle} 字（${isNewspic ? '小绿书' : '长文'}模式）: ${String(t).slice(0, 40)}`)
      }
      if (isInvalidPlaceholderTitle(t)) {
        errors.push(`【发布安全拦截】：第 ${i + 1} 篇标题「${t}」为调试占位符，严禁提交到微信公众号后台！`)
      }
    }

    // 批次内文章自查重校验：杜绝单次提交中包含归一化后相同的重复文章
    const seenBatchTitles = new Set<string>()
    for (let i = 0; i < (titles || []).length; i++) {
      const norm = normalizeTitle(titles[i])
      if (norm && seenBatchTitles.has(norm)) {
        errors.push(`同批次文章标题自重复（第 ${i + 1} 篇「${titles[i]}」与前文重复）`)
      }
      seenBatchTitles.add(norm)
    }

    const maxDigest = this.capabilities.maxDigestLength
    for (const d of digests || []) {
      if (typeof d !== 'string' || d.length > maxDigest) {
        errors.push(`摘要超 ${maxDigest} 字: ${String(d).slice(0, 40)}`)
      }
    }

    if (!ctx.cfg.runtime.dry_run && !ctx.force) {
      try {
        this.assertNoCrossAccountTitleCollision(ctx.cfg, ctx.accountId, 'gzh', titles)
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err))
      }
    }

    const account = resolveAccount(ctx.cfg, ctx.accountId)
    const hasApiCreds = Boolean(account.profile.appid && account.profile.app_secret)
    const resolvedMode = ctx.publishMode || account.profile.publish_mode || (hasApiCreds ? 'api' : 'browser')
    const resolvedAction = ctx.publishAction || account.profile.publish_action_default || (account.profile.publish_immediately ? 'publish_now' : 'draft')
    // 【中文修复依据】：当配置了 AppID 与 AppSecret 时，发布链路升级为「API 草稿入库 + 浏览器后台自动化开启原创与定时发表」混合模式；
    // 只有在未配置 API 凭据、且强制指定纯 API 模式时才报错拦截
    if (resolvedAction === 'schedule' && resolvedMode === 'api' && !hasApiCreds) {
      errors.push('微信公众号官方开放平台接口模式不支持原生定时发表，定时发表由微信后台官方托管，请将发布方案切换为免 API 浏览器模式（publish_mode: "browser"）。')
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  async checkLogin(cfg: Config, accountId: string): Promise<LoginCheckResult> {
    try {
      const loggedIn = await wechatCheckLogin(cfg, accountId)
      return { loggedIn, accountId, platform: 'gzh' }
    } catch (error) {
      return {
        loggedIn: false,
        accountId,
        platform: 'gzh',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async triggerQrLogin(
    cfg: Config,
    accountId: string,
    options?: { timeoutMs?: number },
  ): Promise<QrLoginResult> {
    try {
      const logged = await wechatLogin(cfg, accountId, options?.timeoutMs)
      return {
        ok: logged,
        accountId,
        platform: 'gzh',
        message: logged ? '微信公众平台扫码登录成功' : '登录未完成或登录窗口已关闭',
      }
    } catch (error) {
      return {
        ok: false,
        accountId,
        platform: 'gzh',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  private isNewspicMode(ctx: PublishContext): boolean {
    const account = resolveAccount(ctx.cfg, ctx.accountId)
    const content = account.profile.content
    return (
      ctx.articleType === 'newspic' ||
      (!ctx.articleType && content?.article_type === 'newspic') ||
      Boolean(ctx.articleFiles && ctx.articleFiles.some((f) => f.endsWith('_pic.json') || f.endsWith('.json')))
    )
  }

  async publish(ctx: PublishContext): Promise<StandardPublishResult> {
    const { cfg, accountId, titles, digests, scriptsDir, force } = ctx
    const n = titles.length
    const account = resolveAccount(cfg, accountId)
    const content = account.profile.content
    const isNewspic = this.isNewspicMode(ctx)
    const hasApiCreds = Boolean(account.profile.appid && account.profile.app_secret)
    const publishMode = ctx.publishMode || account.profile.publish_mode || (hasApiCreds ? 'api' : 'browser')
    const publishAction: PublishAction = ctx.publishAction || account.profile.publish_action_default || (account.profile.publish_immediately ? 'publish_now' : 'draft')
    const isDryRun = Boolean(ctx.dryRun ?? cfg.runtime?.dry_run)

    // 核心安全门禁与 RecipeRunner 统一调度 (Fail-Closed 闭环)
    if ((ctx.recipeTicket || cfg.cloudflare_worker?.enforce_encryption) && isDryRun) {
      if (!ctx.recipeTicket) {
        throw new Error('【安全门禁拦截】：未接收到有效解密的云端发文调度工单 (RecipeTicket)，严禁在本地降级执行明文发文脚本！')
      }
      const profileDir = wechatProfileDir(cfg, accountId)
      const ext = isNewspic ? '_pic.json' : '.html'
      const articlePaths = this.defaultArticleFiles(scriptsDir, n, ext, ctx.articleFiles)
      let firstContent = ''
      if (articlePaths[0] && fs.existsSync(articlePaths[0])) {
        try {
          const rawText = fs.readFileSync(articlePaths[0], 'utf8')
          if (isNewspic) {
            const parsed = JSON.parse(rawText)
            firstContent = parsed.content || parsed.text || ''
          } else {
            firstContent = rawText
          }
        } catch {}
      }
      return this.executeWithRecipeRunner(ctx, {
        profileDir,
        defaultDomain: '.weixin.qq.com',
        variables: {
          title: titles[0] || '',
          content: firstContent,
          author: account.profile.author_name || '',
          digest: digests[0] || '',
        },
        localFiles: [],
        platformDisplayName: '微信公众平台',
      })
    }

    // 演练模式（Dry Run）100% 物理绝对阻断：绝不发起任何外部网络请求、接口调用或浏览器自动化
    if (isDryRun) {
      const ext = isNewspic ? '_pic.json' : '.html'
      const articlePaths = this.defaultArticleFiles(scriptsDir, n, ext, ctx.articleFiles)
      for (const f of articlePaths) {
        if (!fs.existsSync(f)) {
          throw new Error('文章文件不存在（缺少待发布文章文件）: ' + f)
        }
      }
      const mockMediaId = `dry_run_${publishMode}_media_id`
      const now = this.stampNow()
      const items: StandardPublishItem[] = titles.map((t, i) => ({
        index: i + 1,
        title: t,
        digest: digests[i] || '',
        draftId: mockMediaId,
        status: 'draft_saved',
      }))
      const resultPath = this.writeResultFile(
        scriptsDir,
        {
          status: 'success',
          account_id: accountId,
          platform: 'gzh',
          article_type: isNewspic ? 'newspic' : 'news',
          draft_media_id: mockMediaId,
          draft_media_ids: titles.map(() => mockMediaId),
          article_count: n,
          author: account.profile.author_name,
          timestamp: now,
          articles: titles,
          publish_action: publishAction,
          publish_status: 'draft_saved',
          dry_run: true,
        },
        isNewspic ? 'publish_result_newspic.json' : 'publish_result_news.json',
      )
      return {
        accountId,
        platform: 'gzh',
        publishMode,
        publishAction,
        dryRun: true,
        mediaId: mockMediaId,
        mediaIds: titles.map(() => mockMediaId),
        articleCount: n,
        titles,
        items,
        verify: { checked: true, article_count: n },
        resultFile: resultPath,
      }
    }

    // 排期时刻解析：小绿书严格优先使用专属时段池（schedule_times_newspic），不被长文全局固定时间污染；
    // 只有用户显式传入具体指定时间（且非 'auto'）时才覆盖专属时段池
    const rawReqTime = (ctx.scheduleTime || '').trim()
    // 【中文修复依据】：长文与小绿书排期通道完全正交独立，各自优先使用专属时段池（长文 schedule_times_article，小绿书 schedule_times_newspic）；
    // 只有用户在任务提示/备注中有显式指定具体时间（且非 'auto'）时才覆盖专属时段池，未指定时留空以激活专属时段池自动决议
    const scheduleTime = rawReqTime && rawReqTime !== 'auto' ? rawReqTime : ''

    let cleanedDuplicatesCount = 0
    let syncedScheduleTasksCount = 0

    // 自动化闭环：定时发布与浏览器模式前置自动拉取云端定时任务列表与草稿箱去重
    if (!isDryRun && !force && publishMode === 'browser') {
      // 1. 若为定时发布且允许自动同步排期，自动拉取微信公众平台后台首页最新定时任务
      if (publishAction === 'schedule' && ctx.autoSyncSchedule !== false) {
        try {
          const schedRes = await syncWechatScheduledTasks(cfg, accountId)
          if (schedRes.ok) {
            syncedScheduleTasksCount = schedRes.count
            console.log(`[social-publisher] 账号 ${accountId} 定时发布前已自动拉取云端排期任务: ${schedRes.count} 项`)
          }
        } catch (err) {
          console.warn(`[social-publisher] 账号 ${accountId} 自动拉取云端排期异常（降级使用本地排期库）:`, err)
        }
      }

      // 2. 若允许自动清理重复草稿，前置同步云端草稿箱并扫描清理
      if (ctx.autoCleanDuplicates !== false) {
        try {
          const draftSyncRes = await syncWechatDrafts(cfg, accountId)
          if (draftSyncRes.ok) {
            console.log(`[social-publisher] 账号 ${accountId} 发布前已自动同步云端草稿箱: ${draftSyncRes.count} 篇`)
            const dupScan = scanDuplicateDrafts(cfg, accountId, ctx.duplicateKeepStrategy || 'keep_latest')
            if (dupScan.total_redundant_count > 0) {
              const toDeleteIds: string[] = []
              for (const group of dupScan.groups) {
                for (const item of group.items) {
                  if (item.selected_for_delete && item.appmsgid) {
                    toDeleteIds.push(item.appmsgid)
                  }
                }
              }
              if (toDeleteIds.length > 0) {
                const cleanRes = await batchDeleteWechatDrafts(cfg, accountId, toDeleteIds)
                cleanedDuplicatesCount = cleanRes.deleted_count
                console.log(`[social-publisher] 账号 ${accountId} 发布前已自动清理 ${cleanedDuplicatesCount} 篇冗余重复草稿`)
              }
            }
          }
        } catch (err) {
          console.warn(`[social-publisher] 账号 ${accountId} 自动拉取/清理草稿箱异常:`, err)
        }
      }
    }

    // 防重复发布保护（幂等拦截机制）
    if (!isDryRun && !force) {
      // 0. 定时排期防重拦截：检查标题是否已在微信后台图3或本地活跃排期中
      const scheduleCollision = checkScheduledTitleCollision(cfg, accountId, titles)
      if (scheduleCollision.hasCollision) {
        throw new Error(
          `文章「${scheduleCollision.collidedTitles.join('、')}」已在微信公众号已有定时排期中（排期时间：${scheduleCollision.existingTime || '已有任务'}），避免出现重复发布！若确认需要重新提交请传入 force: true。`,
        )
      }

      const recentRecords = readAccountPublishRecords(cfg, accountId)

      // 1. 完全相同标题与形态防重（支持幂等返回已有草稿结果）
      const exactMatch = recentRecords.find((r) => {
        const typeMatch = isNewspic ? r.article_type === 'newspic' : r.article_type !== 'newspic'
        if (!typeMatch) return false
        const recTitles = r.articles || []
        // 【中文修复依据】：历史记录中只要存在任何占位符标题（如文章_1），绝对严禁命中复用！
        if (recTitles.some((t) => isInvalidPlaceholderTitle(t))) return false
        // 【中文修复依据】：若当前处于沙箱构建发布链路中且物料已落盘刷新，严禁盲目命中旧草稿复用，必须向微信创建新草稿
        if (ctx.sandbox) return false
        return (
          recTitles.length === titles.length &&
          recTitles.every((t, i) => normalizeTitle(t) === normalizeTitle(titles[i]))
        )
      })
      if (exactMatch && exactMatch.draft_media_id) {
        const rawIds = exactMatch.draft_media_ids && exactMatch.draft_media_ids.length > 0
          ? exactMatch.draft_media_ids
          : [exactMatch.draft_media_id]
        const mediaIds = rawIds.filter((id): id is string => Boolean(id))
        return {
          accountId,
          platform: 'gzh',
          publishMode,
          publishAction,
          dryRun: false,
          alreadyPublished: true,
          mediaId: exactMatch.draft_media_id,
          mediaIds,
          articleCount: exactMatch.article_count || n,
          titles,
          items: titles.map((t, i) => ({
            index: i + 1,
            title: t,
            digest: digests[i] || '',
            draftId: isNewspic ? (mediaIds[i] || exactMatch.draft_media_id) : exactMatch.draft_media_id,
            status: 'draft_saved',
          })),
          verify: { checked: true, article_count: exactMatch.article_count || n },
          resultFile: path.resolve(scriptsDir, RESULT_FILE),
        }
      }

      // 2. 逐篇穿透查重（全链路杜绝重复文章）：若任何候选标题命中历史记录，严格拦截报错
      for (const t of titles) {
        const normT = normalizeTitle(t)
        if (!normT || normT.length < 4) continue
        for (const r of recentRecords) {
          const matchedArticle = (r.articles || []).find((art) => normalizeTitle(art) === normT)
          if (matchedArticle) {
            throw new Error(
              `文章「${t}」与历史已发布文章「${matchedArticle}」重复（历史记录时间：${r.timestamp || '已存记录'}），全链路杜绝重复文章！若确认强制重新发布请传入 force: true。`,
            )
          }
        }
      }

      // 3. 微信存量草稿箱查重：若草稿箱中已存在同名草稿，防止重复建稿在草稿箱内堆积同名文章
      const localDrafts = loadWechatDrafts(cfg, accountId)
      const dirtyDraftIdsToDelete: string[] = []
      for (const t of titles) {
        const normT = normalizeTitle(t)
        if (!normT || normT.length < 4) continue
        for (const d of localDrafts) {
          const matchedDraftArt = (d.articles || []).find((art) => normalizeTitle(art.title) === normT)
          if (matchedDraftArt) {
            // 【中文修复依据】：若该同名草稿内含有占位符标题（如包含文章_1等旧草稿），判定为历史脏草稿，加入自动注销队列，严禁阻断新稿发布
            const hasPlaceholder = (d.articles || []).some((art) => isInvalidPlaceholderTitle(art.title))
            if (hasPlaceholder && d.id) {
              dirtyDraftIdsToDelete.push(d.id)
              continue
            }
            throw new Error(
              `文章「${t}」在微信草稿箱中已存在草稿（草稿标题：「${matchedDraftArt.title}」，更新于 ${d.update_time_str || '近期'}），避免在草稿箱内重复生成相同草稿导致多发！若确认重新创建请清理草稿箱后再试或传入 force: true。`,
            )
          }
        }
      }
      if (dirtyDraftIdsToDelete.length > 0) {
        try {
          const uniqueIds = Array.from(new Set(dirtyDraftIdsToDelete))
          await batchDeleteWechatDrafts(cfg, accountId, uniqueIds)
          console.log(`[social-publisher] 账号 ${accountId} 发布前已自动置换清理 ${uniqueIds.length} 篇含占位符的旧脏草稿`)
        } catch (delErr) {
          console.warn(`[social-publisher] 自动清理脏草稿异常:`, delErr)
        }
      }

      // 2. 小绿书篇数限额保护（4小时配额防重）
      if (isNewspic) {
        const allowedNewspicCount = content.newspic_articles_per_day || 1
        const nowMs = Date.now()
        const recentNewspicBatches = recentRecords.filter((r) => {
          if (r.article_type !== 'newspic' || !r.draft_media_id) return false
          const recTime = new Date(r.timestamp).getTime()
          return !isNaN(recTime) && (nowMs - recTime < 4 * 3600 * 1000)
        })
        const publishedCount = recentNewspicBatches.reduce((acc, r) => acc + (r.article_count || 1), 0)
        if (publishedCount >= allowedNewspicCount && recentNewspicBatches.length > 0) {
          const lastBatch = recentNewspicBatches[0]
          const rawIds = lastBatch.draft_media_ids && lastBatch.draft_media_ids.length > 0
            ? lastBatch.draft_media_ids
            : [lastBatch.draft_media_id]
          const mediaIds = rawIds.filter((id): id is string => Boolean(id))
          return {
            accountId,
            platform: 'gzh',
            publishMode,
            publishAction,
            dryRun: false,
            alreadyPublished: true,
            mediaId: lastBatch.draft_media_id,
            mediaIds,
            articleCount: lastBatch.article_count || 1,
            titles: lastBatch.articles,
            items: lastBatch.articles.map((t, i) => ({
              index: i + 1,
              title: t,
              draftId: mediaIds[i] || lastBatch.draft_media_id,
              status: 'draft_saved',
            })),
            verify: { checked: true, article_count: lastBatch.article_count || 1 },
            resultFile: path.resolve(scriptsDir, RESULT_FILE),
          }
        }
      }
    }

    if (publishMode === 'browser') {
      return this.publishBrowserMode(ctx, isNewspic, publishAction, scheduleTime, {
        cleanedDuplicatesCount,
        syncedScheduleTasksCount,
      })
    }
    return this.publishApiMode(ctx, isNewspic, publishAction, scheduleTime, {
        cleanedDuplicatesCount,
        syncedScheduleTasksCount,
      })
  }

  private resolveSandboxedWechatMaterials(
    ctx: PublishContext,
    n: number,
    isNewspic: boolean,
    scriptsDir: string,
    articleFiles?: string[],
  ): { articlePaths: string[]; coverPaths: string[]; contentFiles: Record<string, string> } {
    const account = resolveAccount(ctx.cfg, ctx.accountId)
    const contentImgs = contentImagesPerArticle(ctx.cfg, account.profile)
    const ext = isNewspic ? '_pic.json' : '.html'

    const sandbox = ctx.sandbox
    const sandboxedArticles = sandbox?.targetGroup?.articles || []

    let articlePaths: string[] = []
    if (articleFiles && articleFiles.length > 0) {
      articlePaths = articleFiles.map((f: string) => (path.isAbsolute(f) ? f : path.resolve(scriptsDir, f)))
    } else if (sandboxedArticles.length >= n) {
      articlePaths = sandboxedArticles.slice(0, n).map((a: any) => a.filePath).filter((p: string) => p && fs.existsSync(p))
    }
    if (articlePaths.length < n) {
      articlePaths = this.defaultArticleFiles(scriptsDir, n, ext, articleFiles)
    }

    const coverPaths: string[] = []
    const contentFiles: Record<string, string> = {}

    if (!isNewspic) {
      for (let i = 1; i <= n; i++) {
        const art = sandboxedArticles.find((a: any) => a.index === i && (isNewspic ? (a.kind === 'newspic' || a.fileName?.includes('_pic.json')) : (a.kind !== 'newspic' && !a.fileName?.includes('_pic.json')))) || sandboxedArticles.find((a: any) => a.index === i)
        let resolvedCover = ''
        if (art?.coverImage?.path && fs.existsSync(art.coverImage.path)) {
          resolvedCover = art.coverImage.path
        } else if (ctx.cfg.runtime?.dry_run) {
          resolvedCover = path.resolve(scriptsDir, `cover_${i}.png`)
        } else {
          // 【中文修复依据】：严禁向共享公共目录嗅探旧图，沙箱配图缺失立即硬阻断，杜绝错版旧图渗透
          throw new Error(`【沙箱配图缺失拦截】：第 ${i} 篇微信公众号长文在专属任务沙箱中未找到封面物料（缺少 cover_${i}.png）。绝对禁止拾取历史旧图或跨任务旧文件充数！请先运行生图工具 gzh_generate_images。`)
        }
        coverPaths.push(resolvedCover)

        for (let j = 1; j <= contentImgs; j++) {
          const key = `IMG_A${i}_${j}`
          const cImg = art?.contentImages?.find((ci: any) => ci.sub === j)
          let resolvedContent = ''
          if (cImg?.path && fs.existsSync(cImg.path)) {
            resolvedContent = cImg.path
          } else if (ctx.cfg.runtime?.dry_run) {
            resolvedContent = path.resolve(scriptsDir, `content_${i}_${j}.png`)
          } else {
            // 【中文修复依据】：严禁向共享公共目录嗅探旧图，沙箱配图缺失立即硬阻断，杜绝错版旧图渗透
            throw new Error(
              `【沙箱配图缺失拦截】：第 ${i} 篇微信公众号长文在专属任务沙箱中未找到第 ${j} 张插图（缺少 content_${i}_${j}.png）。绝对禁止拾取历史旧图充数！请先运行生图工具 gzh_generate_images。`
            )
          }
          contentFiles[key] = resolvedContent
        }
      }
    }

    return { articlePaths, coverPaths, contentFiles }
  }

  /** 公众号官方 API 发布模式 */
  private async publishApiMode(
    ctx: PublishContext,
    isNewspic: boolean,
    publishAction: PublishAction,
    scheduleTime: string,
    extraStats?: { cleanedDuplicatesCount?: number; syncedScheduleTasksCount?: number },
  ): Promise<StandardPublishResult> {
    const { cfg, accountId, titles, digests, articleFiles, scriptsDir } = ctx
    const n = titles.length
    const account = resolveAccount(cfg, accountId)
    const contentImgs = contentImagesPerArticle(cfg, account.profile)
    // 【中文修复依据】：统一接入权威沙箱物料解析器，优先读取 Manifest 绝对路径与 images/ 正本
    const { articlePaths, coverPaths, contentFiles } = this.resolveSandboxedWechatMaterials(
      ctx,
      n,
      isNewspic,
      scriptsDir,
      articleFiles,
    )

    let result: PublishResult | undefined
    let apiFailureError: Error | null = null

    try {
      const bdir = brandDir(cfg)
      const brandTop = brandImagePath(cfg, account.profile.brand_images?.header?.file, 'brand_top.jpg', accountId)
      const brandBot = brandImagePath(cfg, account.profile.brand_images?.footer?.file, 'brand_bot.jpg', accountId)

      if (!cfg.runtime.dry_run) {
        assertWechatCreds(cfg, accountId)
        if (!isNewspic) {
          if (account.profile.brand_images?.header?.enabled && !fs.existsSync(brandTop)) {
            throw new Error('缺少头部品牌图: ' + brandTop)
          }
          if (account.profile.brand_images?.footer?.enabled && !fs.existsSync(brandBot)) {
            throw new Error('缺少尾部品牌图: ' + brandBot)
          }
        }
      }

      const job = {
        account_id: accountId,
        article_type: isNewspic ? 'newspic' : 'news',
        titles,
        digests,
        article_files: articlePaths,
        cover_files: coverPaths,
        content_files: contentFiles,
        brand_top: brandTop,
        brand_bot: brandBot,
        brand_top_enabled: isNewspic ? false : account.profile.brand_images?.header?.enabled,
        brand_bot_enabled: isNewspic ? false : account.profile.brand_images?.footer?.enabled,
        cache: readUploadCache(cfg, accountId),
        use_cache: cfg.runtime.use_upload_cache,
        dry_run: cfg.runtime.dry_run,
        need_open_comment: cfg.runtime.need_open_comment ? 1 : 0,
        only_fans_can_comment: 0,
        author: account.profile.author_name,
        brand_name: account.profile.brand_name,
        ending_guide_required: account.profile.content?.ending_guide_required,
        content_img_count: isNewspic ? (account.profile.content?.newspic_images_per_article || 4) : contentImgs,
        min_words: isNewspic ? (account.profile.content?.newspic_min_words ?? 100) : account.profile.content?.min_words,
        forbidden: account.profile.content?.forbidden_words,
        verify: cfg.runtime.verify_after_publish,
        publish_action: publishAction === 'publish_now' ? 'publish_now' : 'draft',
      }

      const jobFile = writeJobFile(scriptsDir, job, 'publish')
      try {
        result = await runPipeline<PublishResult>(
          cfg,
          'publish_pipeline.py',
          ['--job', jobFile.name, '--scripts-dir', scriptsDir, '--brand-dir', bdir, '--resource-dir', runtimeResourceDir()],
          Math.max(600000, n * 120000),
        )
      } finally {
        removeJobFile(jobFile.dir, jobFile.name)
      }

      // 【中文修复依据】：非演练模式下，若开放平台 API 未能成功返回有效 media_id，判定为 API 录入失败
      if (!result?.dry_run && (!result || !result.media_id)) {
        throw new Error('微信官方开放平台 API 录入未返回有效的草稿 media_id')
      }
    } catch (err) {
      apiFailureError = err instanceof Error ? err : new Error(String(err))
    }

    // 【中文修复依据】：当配置了 AppID 与 AppSecret 的公众号在尝试通过 API 传入草稿箱失败时（如凭据失效、IP白名单限制、网络中断等），
    // 自动捕获异常并全量平滑降级为免 API 浏览器模式，从零接管创建草稿、图文注入与定时/发布提交，保障发文任务不中断
    if (apiFailureError || !result) {
      const apiErrMsg = apiFailureError ? apiFailureError.message : '微信 API 未返回草稿结果'
      console.warn(
        `[social-publisher] 账号 ${accountId} 尝试通过 API 传入微信草稿箱失败 (${apiErrMsg})，触发自动容错机制：正在全量切换为免 API 浏览器模式执行发布...`,
      )
      return this.publishBrowserMode(
        ctx,
        isNewspic,
        publishAction,
        scheduleTime,
        extraStats,
        {
          fallbackFromApi: true,
          apiFallbackReason: apiErrMsg,
        },
      )
    }

    writeUploadCache(cfg, accountId, result.cache ?? {})
    if (result.dry_run) {
      return {
        accountId,
        platform: 'gzh',
        publishMode: 'api',
        publishAction,
        dryRun: true,
        articleCount: n,
        titles,
        items: titles.map((t, i) => ({
          index: i + 1,
          title: t,
          digest: digests[i] || '',
          status: 'draft_saved',
        })),
        resultFile: '',
        verify: { checked: false },
      }
    }

    if (!result.media_id) throw new Error('发布成功但未返回 media_id')
    const mediaIds = result.media_ids && result.media_ids.length > 0 ? result.media_ids : [result.media_id]
    writeTextFile(scriptsDir, MEDIA_ID_FILE, mediaIds.join('\n') + '\n')

    // -------------------------------------------------------------
    // 第二阶段：浏览器自动化接力（原创开启与立即/定时发表）
    // -------------------------------------------------------------
    let continuationResult: WechatDraftContinuationResult | undefined
    let originalResult: WechatOriginalResult | undefined
    let scheduledTimeIso: string | undefined
    let isPublished = false
    let isScheduled = false
    let receiptScreenshot: string | undefined
    let scheduleError: string | undefined

    const shouldAutoOriginal = Boolean(
      ctx.autoEnableOriginal ?? account.profile.auto_enable_original ?? cfg.wechat?.auto_enable_original ?? true,
    )
    const needsBrowserContinuation = publishAction !== 'draft' || (shouldAutoOriginal && !isNewspic)

    if (needsBrowserContinuation) {
      let wantNotification = false
      if (publishAction === 'schedule') {
        // 核心规范：每次定时发布操作必须先同步微信后台最新定时排期列表进行检查，确保基于云端事实源排期
        await syncWechatScheduledTasks(cfg, accountId).catch(() => undefined)
        const slotRes = resolveNextScheduleSlot(
          cfg,
          accountId,
          isNewspic ? 'newspic' : 'news',
          scheduleTime || undefined,
          new Date(),
          { requireNotification: !isNewspic },
        )
        scheduledTimeIso = slotRes.iso
        wantNotification = slotRes.need_notification
      }

      continuationResult = await continueWechatDraftInBrowser(cfg, accountId, {
        targetTitles: titles,
        authorName: account.profile.author_name,
        autoEnableOriginal: shouldAutoOriginal,
        publishAction,
        scheduleTime: scheduledTimeIso,
        ownerTaskId: ctx.ownerTaskId,
        isNewspic,
        wantNotification,
      })

      if (continuationResult.originalResult) {
        originalResult = continuationResult.originalResult
      }
      isPublished = Boolean(continuationResult.published)
      isScheduled = Boolean(continuationResult.scheduled)
      receiptScreenshot = continuationResult.receipt_screenshot
      scheduleError = continuationResult.schedule_error
      if (continuationResult.scheduled_time) {
        scheduledTimeIso = continuationResult.scheduled_time
      }
    }

    const scheduleFailed = publishAction === 'schedule' && !isScheduled
    const publishFailed = publishAction === 'publish_now' && !isPublished
    const publishStatus: StandardPublishItem['status'] = isPublished
      ? 'published'
      : scheduleFailed || publishFailed
        ? 'failed'
        : isScheduled
          ? 'scheduled'
          : 'draft_saved'

    const now = this.stampNow()
    const items: StandardPublishItem[] = titles.map((title, i) => ({
      index: i + 1,
      title,
      digest: digests[i] || '',
      draftId: isNewspic ? (mediaIds[i] || result.media_id) : result.media_id,
      published: publishStatus === 'published',
      status: publishStatus,
    }))

    const resultPath = this.writeResultFile(
      scriptsDir,
      {
        status: 'success',
        account_id: accountId,
        platform: 'gzh',
        article_type: isNewspic ? 'newspic' : 'news',
        draft_media_id: result.media_id,
        draft_media_ids: mediaIds,
        article_count: n,
        author: account.profile.author_name,
        timestamp: now,
        articles: titles,
        original_result: originalResult,
        publish_action: publishAction,
        publish_status: publishStatus as any,
        publish_id: result.publish_id,
        scheduled_time: scheduledTimeIso,
        ...(receiptScreenshot ? { receipt_screenshot: receiptScreenshot } : {}),
        ...(scheduleError ? { schedule_error: scheduleError } : {}),
        draft_url: continuationResult?.draftUrl,
      },
      isNewspic ? 'publish_result_newspic.json' : 'publish_result_news.json',
    )

    this.recordPublishBatch(cfg, {
      id: `batch_${now.replace(/[^0-9]/g, '').slice(0, 14)}_${Math.random().toString(36).slice(2, 6)}`,
      account_id: accountId,
      account_name: account.profile.name,
      platform: 'gzh',
      publish_mode: 'api',
      article_type: isNewspic ? 'newspic' : 'news',
      article_count: n,
      author: account.profile.author_name,
      timestamp: now,
      draft_media_id: result.media_id,
      draft_media_ids: mediaIds,
      articles: titles,
      digests,
      publish_action: publishAction,
      publish_status: publishStatus as any,
      publish_id: result.publish_id,
      scheduled_time: scheduledTimeIso,
      published_at: publishStatus === 'published' ? now : undefined,
      items: items.map((it) => ({
        index: it.index,
        title: it.title,
        digest: it.digest || '',
        draft_id: it.draftId,
        published: it.published,
        publish_id: result.publish_id,
        status: it.status as any,
      })),
    })

    return {
      accountId,
      platform: 'gzh',
      publishMode: 'api',
      publishAction,
      dryRun: false,
      mediaId: result.media_id,
      mediaIds,
      articleCount: result.article_count ?? n,
      titles,
      items,
      verify: result.verify ?? { checked: false },
      resultFile: resultPath,
      scheduledTime: scheduledTimeIso,
      originalResult,
    }
  }

  /** 公众号免 API 浏览器发布模式 */
  private async publishBrowserMode(
    ctx: PublishContext,
    isNewspic: boolean,
    publishAction: PublishAction,
    scheduleTime: string,
    extraStats?: { cleanedDuplicatesCount?: number; syncedScheduleTasksCount?: number },
    fallbackInfo?: { fallbackFromApi?: boolean; apiFallbackReason?: string },
  ): Promise<StandardPublishResult> {
    const { cfg, accountId, titles, digests, articleFiles, scriptsDir } = ctx
    const n = titles.length
    const account = resolveAccount(cfg, accountId)
    const contentImgs = contentImagesPerArticle(cfg, account.profile)
    // 【中文修复依据】：统一接入权威沙箱物料解析器，优先读取 Manifest 绝对路径与 images/ 正本
    const { articlePaths, coverPaths, contentFiles } = this.resolveSandboxedWechatMaterials(
      ctx,
      n,
      isNewspic,
      scriptsDir,
      articleFiles,
    )

    const brandTop = brandImagePath(cfg, account.profile.brand_images?.header?.file, 'brand_top.jpg', accountId)
    const brandBot = brandImagePath(cfg, account.profile.brand_images?.footer?.file, 'brand_bot.jpg', accountId)

    let scheduledTimeIso: string | undefined
    let wantNotification: boolean | undefined
    if (publishAction === 'schedule') {
      // 核心规范：每次定时发布操作必须先同步微信后台最新定时排期列表进行检查，确保基于云端事实源排期
      await syncWechatScheduledTasks(cfg, accountId).catch(() => undefined)
      // 核心排期决策：
      // 1. 若用户在任务提示/备注中有显式指定时间（且非 'auto'），备注要求最高优先级；
      // 2. 否则，按照设定时间规则（schedule_times_article / schedule_times_newspic），
      //    通过检查同步后的对应账号微信后台排期（wechat_scheduled_tasks.json），优先选定离目前时间最近的无同类型任务时间段！
      // 3. 只有每天最早的第一个普通长文定时任务需要开启群发通知，其余后续长文与所有小绿书均不群发！
      const slotRes = resolveNextScheduleSlot(
        cfg,
        accountId,
        isNewspic ? 'newspic' : 'news',
        scheduleTime || undefined,
        new Date(),
      )
      scheduledTimeIso = slotRes.iso
      wantNotification = slotRes.need_notification
      if (slotRes.delayed && slotRes.delay_reason) {
        console.log(`[social-publisher] 账号 ${accountId} 定时发表排期提示: ${slotRes.delay_reason}`)
      }
    }

    // 核心安全升级：优先使用 Cloudflare Worker 云端解密时效工单与 LocalRecipeRunner 盲执行
    if (ctx.recipeTicket || cfg.cloudflare_worker?.enforce_encryption) {
      const profileDir = wechatProfileDir(cfg, accountId)
      let firstContent = ''
      if (articlePaths[0] && fs.existsSync(articlePaths[0])) {
        try {
          const rawText = fs.readFileSync(articlePaths[0], 'utf8')
          if (isNewspic) {
            const parsed = JSON.parse(rawText)
            firstContent = parsed.content || parsed.text || ''
          } else {
            firstContent = rawText
          }
        } catch {}
      }

      const allLocalFiles: string[] = [...coverPaths, ...Object.values(contentFiles)].filter(Boolean)
      return this.executeWithRecipeRunner(ctx, {
        profileDir,
        defaultDomain: '.weixin.qq.com',
        variables: {
          title: titles[0] || '',
          content: firstContent,
          author: account.profile.author_name || '',
          digest: digests[0] || '',
          schedule_time: scheduledTimeIso || '',
        },
        localFiles: allLocalFiles,
        platformDisplayName: '微信公众平台',
      })
    }

    // 【云端强管控拦截】：本地明文发文已永久关闭，保留源码仅供归档
    throw new Error('【安全门禁拦截】：未获得合法解密的云端发文工单 (RecipeTicket)，本地明文发布已永久关闭！');

    // @deprecated 本地明文发布已关闭，以下代码保留仅供内部归档
    const job: WechatBrowserPublishJob = {
      account_id: accountId,
      article_type: isNewspic ? 'newspic' : 'news',
      titles,
      digests,
      article_files: articlePaths,
      cover_files: coverPaths,
      content_files: contentFiles,
      brand_top: brandTop,
      brand_bot: brandBot,
      brand_top_enabled: isNewspic ? false : account.profile.brand_images?.header?.enabled,
      brand_bot_enabled: isNewspic ? false : account.profile.brand_images?.footer?.enabled,
      author: account.profile.author_name,
      brand_name: account.profile.brand_name,
      min_words: isNewspic ? (account.profile.content?.newspic_min_words ?? 100) : account.profile.content?.min_words,
      forbidden: account.profile.content?.forbidden_words,
      auto_enable_original: Boolean(ctx.autoEnableOriginal ?? account.profile.auto_enable_original ?? false),
      publish_action: publishAction,
      schedule_time: scheduledTimeIso,
      want_notification: wantNotification,
      dry_run: cfg.runtime.dry_run === true,
    }

    const browserResult = await publishWechatDraftByBrowser(cfg, accountId, job, ctx.ownerTaskId)
    // 关键平滑冷却窗口（中文注释）：长文多图文发布并关闭浏览器后，休眠 2 秒确保 Chrome 进程安全释放排他锁与后台会话沉淀
    if (!isNewspic && !browserResult.dry_run) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }

    if (browserResult.dry_run) {
      return {
        accountId,
        platform: 'gzh',
        publishMode: 'browser',
        publishAction,
        dryRun: true,
        articleCount: n,
        titles,
        items: titles.map((t, i) => ({
          index: i + 1,
          title: t,
          digest: digests[i] || '',
          status: 'draft_saved',
        })),
        resultFile: '',
        verify: { checked: false },
      }
    }

    const mediaId = browserResult.media_id || ''
    const mediaIds = browserResult.media_ids || (mediaId ? [mediaId] : [])
    writeTextFile(scriptsDir, MEDIA_ID_FILE, mediaIds.join('\n') + '\n')

    // 修复变量重复声明：函数前部已声明 let scheduledTimeIso，此处复用该变量并以最终执行结果或排期时间为准
    scheduledTimeIso = publishAction === 'schedule' ? (browserResult.scheduled_time || job.schedule_time) : undefined

    // 定时必须以后台真实结果为准：browserResult.scheduled 才是「定时已设上」的证据。
    // 严禁用 publishAction === 'schedule' 短路——那会把「定时设置失败」误记为已排期（历史 bug）。
    const scheduleFailed = publishAction === 'schedule' && !browserResult.scheduled
    const publishStatus: StandardPublishItem['status'] = browserResult.published
      ? 'published'
      : scheduleFailed
        ? 'failed'
        : browserResult.scheduled
          ? 'scheduled'
          : 'draft_saved'

    const now = this.stampNow()
    const items: StandardPublishItem[] = titles.map((title, i) => ({
      index: i + 1,
      title,
      digest: digests[i] || '',
      draftId: mediaId,
      url: browserResult.draft_url,
      published: publishStatus === 'published',
      status: publishStatus,
    }))

    const resultPath = this.writeResultFile(
      scriptsDir,
      {
        status: 'success',
        account_id: accountId,
        platform: 'gzh',
        publish_mode: 'browser',
        article_type: isNewspic ? 'newspic' : 'news',
        draft_media_id: mediaId,
        draft_media_ids: mediaIds,
        article_count: n,
        author: account.profile.author_name,
        timestamp: now,
        articles: titles,
        draft_url: browserResult.draft_url,
        original_result: browserResult.original_result,
        publish_action: publishAction,
        publish_status: publishStatus as any,
        published: browserResult.published,
        scheduled: browserResult.scheduled,
        scheduled_time: scheduledTimeIso || browserResult.scheduled_time,
        ...(browserResult.schedule_error ? { schedule_error: browserResult.schedule_error } : {}),
        needs_qr_confirmation: browserResult.needs_qr_confirmation,
        qr_screenshot: browserResult.qr_screenshot,
        receipt_screenshot: browserResult.receipt_screenshot,
        ...(fallbackInfo?.fallbackFromApi ? {
          fallback_from_api: true,
          api_fallback_reason: fallbackInfo.apiFallbackReason,
        } : {}),
      },
      isNewspic ? 'publish_result_newspic.json' : 'publish_result_news.json',
    )

    this.recordPublishBatch(cfg, {
      id: `batch_${now.replace(/[^0-9]/g, '').slice(0, 14)}_${Math.random().toString(36).slice(2, 6)}`,
      account_id: accountId,
      account_name: account.profile.name,
      platform: 'gzh',
      publish_mode: 'browser',
      article_type: isNewspic ? 'newspic' : 'news',
      article_count: n,
      author: account.profile.author_name,
      timestamp: now,
      draft_media_id: mediaId,
      draft_media_ids: mediaIds,
      articles: titles,
      digests,
      publish_action: publishAction,
      publish_status: publishStatus as any,
      scheduled_time: scheduledTimeIso || browserResult.scheduled_time,
      published_at: publishStatus === 'published' ? now : undefined,
      ...(fallbackInfo?.fallbackFromApi ? {
        fallback_from_api: true,
        api_fallback_reason: fallbackInfo.apiFallbackReason,
      } : {}),
      items: items.map((it) => ({
        index: it.index,
        title: it.title,
        digest: it.digest || '',
        draft_id: it.draftId,
        url: it.url,
        published: it.published,
        status: it.status as any,
      })),
    })

    return {
      accountId,
      platform: 'gzh',
      publishMode: 'browser',
      publishAction,
      dryRun: false,
      mediaId,
      mediaIds,
      articleCount: n,
      titles,
      items,
      resultFile: resultPath,
      ...(browserResult.schedule_error ? { scheduleError: browserResult.schedule_error } : {}),
      scheduledTime: scheduledTimeIso || browserResult.scheduled_time,
      originalResult: browserResult.original_result,
      needsQrConfirmation: browserResult.needs_qr_confirmation,
      qrScreenshot: browserResult.qr_screenshot,
      receiptScreenshot: browserResult.receipt_screenshot,
      verify: browserResult.verify ?? { checked: true, article_count: n },
      cleanedDuplicatesCount: extraStats?.cleanedDuplicatesCount,
      syncedScheduleTasksCount: extraStats?.syncedScheduleTasksCount,
      fallbackFromApi: fallbackInfo?.fallbackFromApi,
      apiFallbackReason: fallbackInfo?.apiFallbackReason,
    }
  }
}
