import fs from 'node:fs'
import path from 'node:path'
import type { Config } from '../config.ts'
import { resolveAccount } from '../config-runtime.ts'
import {
  appendPublishAttempt,
  listPendingReconcile,
  readAccountPublishRecords,
  readPublishAttempts,
  updateAttemptOutcome,
  updateAttemptReconcile,
  type PublishBatchRecord,
} from '../publish-history.ts'
import { RESULT_FILE } from '../tools/shared.ts'
import { xhsProfileDir } from '../sync-paths.ts'
import {
  runXhsPublish,
  xhsCheckLogin,
  xhsConfirmPublished,
  xhsLogin,
  type XhsNote,
  type XhsPublishJob,
} from '../xiaohongshu.ts'
import { BasePlatformAdapter } from './base-adapter.ts'
import type {
  LoginCheckResult,
  PlatformCapabilities,
  PublishContext,
  QrLoginResult,
  StandardPublishItem,
  StandardPublishResult,
} from './types.ts'

/**
 * 智能装配第 index 篇小红书笔记的有效新鲜配图：
 * 【修复原因与依据】：
 * 1. 唯一事实源与沙箱 Clean Room 隔离：优先且强制从当前任务沙箱 (sandbox) 中获取由生图工具
 *    生成的 coverImage 与 contentImages 产物，严禁任何跨任务、跨历史沙箱旧图渗透。
 * 2. 彻底拔除 12 小时旧图模糊回退漏洞：若沙箱中未找到配图，必须直接抛出清晰中文错误硬阻断，
 *    绝对禁止扫描公共 scriptsDir 捡漏历史残留旧图，杜绝由于漏生图导致数天前选题旧图被错发到小红书。
 * 3. 真封面海报置顶：封面海报（cover_{index}）必须置于上传列表第 1 位。
 * 4. 离线演练模拟隔离：仅在 dryRun 且未实际向线上发布时，方可返回离线虚拟配图路径。
 */
export function resolveXhsNoteImages(
  scriptsDir: string,
  index: number,
  articlePath: string,
  maxImages = 4,
  dryRun = false,
  sandbox?: import('../sandbox/taskSandbox.ts').TaskSandboxContext,
): string[] {
  // 1. 优先读取任务专属沙箱
  if (sandbox) {
    const art = sandbox.targetGroup.articles.find((a) => a.index === index)
    if (art) {
      const sandboxedImgs: string[] = []
      if (art.coverImage?.path && fs.existsSync(art.coverImage.path)) {
        sandboxedImgs.push(art.coverImage.path)
      }
      for (const ci of art.contentImages || []) {
        if (ci.path && fs.existsSync(ci.path) && !sandboxedImgs.includes(ci.path)) {
          sandboxedImgs.push(ci.path)
        }
      }
      if (sandboxedImgs.length > 0) {
        return sandboxedImgs.slice(0, maxImages)
      }
    }

    // 演练模式下返回沙箱内的离线模拟占位
    if (dryRun) {
      const list = [path.resolve(sandbox.targetGroup.imagesDir, `cover_${index}.png`)]
      for (let j = 1; j < maxImages; j++) {
        list.push(path.resolve(sandbox.targetGroup.imagesDir, `content_${index}_${j}.png`))
      }
      return list
    }

    // 【核心安全硬阻断】：沙箱内未找到配图，严禁向下回退至旧文件模糊探测！
    throw new Error(
      `【沙箱配图缺失拦截】：第 ${index} 篇小红书笔记在专属任务沙箱中未找到配图物料（缺少 cover_${index} 或 content_${index}_*）。严禁拾取历史旧图或跨任务旧文件充数！请先运行生图工具 gzh_generate_images。`
    )
  }

  // 2. 兼容非沙箱纯离线演练模式
  if (dryRun) {
    const list = [path.resolve(scriptsDir, `cover_${index}.png`)]
    for (let j = 1; j < maxImages; j++) {
      list.push(path.resolve(scriptsDir, `content_${index}_${j}.png`))
    }
    return list
  }

  // 3. 【中文修复依据】：彻底废除无沙箱兼容模式，实盘发布必须在专属干净沙箱 (sandbox) 内运行，严禁扫描静态共享目录捡漏旧图
  throw new Error(
    `【沙箱准入硬拦截】：第 ${index} 篇小红书笔记未提供专属任务沙箱上下文 (sandbox)。生产环境严格禁止向公共目录嗅探旧图！请确保通过任务沙箱流水线执行。`
  )
}

export class XiaohongshuPlatformAdapter extends BasePlatformAdapter {
  readonly capabilities: PlatformCapabilities = {
    id: 'xiaohongshu',
    displayName: '小红书',
    supportedModes: ['browser'],
    supportedActions: ['draft', 'publish_now'],
    articleFormat: 'text',
    supportedArticleTypes: ['xhs_note'],
    supportsBatchCombination: false,
    maxTitleLength: 20, // 爆款标题 ≤20 字
    maxDigestLength: 120,
    maxArticlesPerBatch: 20,
    coverAspectRatios: ['3:4'],
    supportsOriginalDeclaration: false,
    supportsBrandImages: false,
    supportsScheduledSlots: false,
  }

  async checkLogin(cfg: Config, accountId: string): Promise<LoginCheckResult> {
    try {
      const status = await xhsCheckLogin(cfg, accountId)
      return {
        loggedIn: Boolean(status.logged_in),
        accountId,
        platform: 'xiaohongshu',
        data: status,
      }
    } catch (error) {
      return {
        loggedIn: false,
        accountId,
        platform: 'xiaohongshu',
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
      const res = await xhsLogin(cfg, accountId, options?.timeoutMs)
      return {
        ok: Boolean(res.logged_in),
        accountId,
        platform: 'xiaohongshu',
        message: res.logged_in ? '小红书账号登录成功' : (res.error || '登录未完成或登录窗口已关闭'),
        data: res,
      }
    } catch (error) {
      return {
        ok: false,
        accountId,
        platform: 'xiaohongshu',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /** 自愈式状态回查核验：补齐 note_id -> 永久去重 */
  async reconcile(cfg: Config, accountId: string): Promise<void> {
    const pendings = listPendingReconcile(cfg, accountId)
    if (pendings.length === 0) return

    for (const p of pendings) {
      const titles = p.titles || []
      if (titles.length === 0) continue
      try {
        const expected = titles.map((t) => ({ title: t, publishedAtMs: p.attemptedAtMs }))
        const verified = await xhsConfirmPublished(cfg, accountId, expected)
        const noteIds = titles.map((t) => verified.items.find((v) => v.title === t && v.status === 'published')?.note_id || '')
        const confirmed = noteIds.every(Boolean) && noteIds.length === titles.length
        if (confirmed) {
          updateAttemptReconcile(cfg, accountId, p.attemptedAtMs, noteIds)
        }
      } catch {
        // 单条自愈异常不阻断
      }
    }
  }

  /** 小红书防重闸门判定 */
  private checkDedup(cfg: Config, accountId: string, titles: string[], windowMs = 30 * 60 * 1000): StandardPublishResult | null {
    const nowMs = Date.now()

    // 1. 发布尝试日志拦截
    try {
      const attempts = readPublishAttempts(cfg, accountId)
      for (const a of attempts) {
        if (a.platform !== 'xiaohongshu') continue
        const at = a.titles || []
        if (at.length !== titles.length) continue
        if (!at.every((t, i) => t === titles[i])) continue

        // 明确失败的发布尝试（无论是刚刚发生还是已过窗口期），绝不能认定为已发布！直接跳过
        if (a.outcome === 'failed') continue

        const ids = a.note_ids || []
        const allConfirmed = ids.length === a.titles.length && ids.every((id) => Boolean(id))
        const confirmed = a.outcome === 'published' && allConfirmed
        const fresh = typeof a.attemptedAtMs === 'number' && nowMs - a.attemptedAtMs < windowMs

        // 若未完全确认且已超过新鲜时间窗口，不再合闸
        if (!confirmed && !fresh) continue

        // 若未完全确认且没有任何真实笔记ID（草稿实际未创建），严禁误报假成功，直接跳过以允许正常重跑
        if (!confirmed && (!ids || ids.length === 0 || ids.every((id) => !id))) continue

        const hpath = path.resolve(cfg.runtime.project_root || '', 'accounts', accountId, 'scripts', RESULT_FILE)
        return {
          accountId,
          platform: 'xiaohongshu',
          dryRun: false,
          alreadyPublished: true,
          mediaIds: ids.filter(Boolean),
          articleCount: titles.length,
          titles,
          items: titles.map((t, i) => ({
            index: i + 1,
            title: t,
            draftId: ids[i] || '',
            url: ids[i] ? 'https://www.xiaohongshu.com/explore/' + ids[i] : '',
            published: Boolean(ids[i]),
            status: Boolean(ids[i]) ? 'published' : 'unconfirmed',
          })),
          verify: { checked: confirmed, article_count: titles.length },
          resultFile: hpath,
          dedupNote: confirmed
            ? '该标题此前已确认发布，直接复用，不再重复创建笔记'
            : '该标题此前已发起发布但尚未确认到笔记ID（未确认≠未发布，重发会产生重复笔记）。已拦截重发；系统会在后续运行中自动核对并回填 ID。确需重发请先人工确认后传 force: true',
        }
      }
    } catch {
      // 容错
    }

    // 2. 扫描历史记录防重
    let records: PublishBatchRecord[] = []
    try {
      records = readAccountPublishRecords(cfg, accountId)
    } catch {
      return null
    }

    for (const r of records) {
      if (r.platform !== 'xiaohongshu') continue
      const recTitles = r.articles || []
      if (recTitles.length !== titles.length) continue
      if (!recTitles.every((t, i) => t === titles[i])) continue

      const recTime = new Date(String(r.timestamp).replace(' ', 'T')).getTime()
      const fresh = !Number.isNaN(recTime) && nowMs - recTime < windowMs
      const items = r.items || []
      const confirmedIds = items
        .map((it) => it.draft_id)
        .filter((id): id is string => Boolean(id) && !/^pending_/i.test(String(id)))
      const fullyConfirmed = confirmedIds.length === titles.length && confirmedIds.length > 0

      if (!fullyConfirmed && !fresh) continue

      return {
        accountId,
        platform: 'xiaohongshu',
        dryRun: false,
        alreadyPublished: true,
        mediaIds: confirmedIds,
        articleCount: r.article_count || titles.length,
        titles,
        items: items.map((it) => ({
          index: it.index,
          title: it.title,
          url: it.url,
          draftId: it.draft_id,
          published: it.published,
          status: it.published ? 'published' : 'unconfirmed',
        })),
        verify: { checked: fullyConfirmed, article_count: r.article_count || titles.length },
        resultFile: path.resolve(cfg.runtime.project_root || '', 'accounts', accountId, 'scripts', RESULT_FILE),
        dedupNote: fullyConfirmed
          ? '该标题组合此前已确认发布（publish_history），直接复用既有结果'
          : '该标题组合近期已在 publish_history 中登记，按防重合闸拦截；确需重发请传 force: true',
      }
    }

    return null
  }

  async publish(ctx: PublishContext): Promise<StandardPublishResult> {
    const { cfg, accountId, titles, digests, articleFiles, scriptsDir, force } = ctx
    const n = titles.length
    const isDryRun = Boolean(ctx.dryRun ?? cfg.runtime?.dry_run)

    // 核心安全门禁与 RecipeRunner 统一调度 (Fail-Closed 闭环)
    if (isDryRun && (ctx.recipeTicket || cfg.cloudflare_worker?.enforce_encryption)) {
      if (!ctx.recipeTicket) {
        throw new Error('【安全门禁拦截】：未接收到有效解密的云端发文调度工单 (RecipeTicket)，严禁在本地降级执行明文发文脚本！')
      }
      const profileDir = xhsProfileDir(cfg, accountId)
      const articlePaths = this.defaultArticleFiles(scriptsDir, n, '_xhs.txt', articleFiles)
      let firstContent = ''
      if (articlePaths[0] && fs.existsSync(articlePaths[0])) {
        try {
          firstContent = fs.readFileSync(articlePaths[0], 'utf8')
        } catch {}
      }
      return this.executeWithRecipeRunner(ctx, {
        profileDir,
        defaultDomain: '.xiaohongshu.com',
        variables: {
          title: titles[0] || '',
          content: firstContent,
          digest: digests[0] || '',
        },
        localFiles: [],
        platformDisplayName: '小红书',
      })
    }

    // 演练模式 100% 物理绝对阻断：绝不启动 Chrome 浏览器与小红书自动化发布
    if (isDryRun) {
      const articlePaths = this.defaultArticleFiles(scriptsDir, n, '_xhs.txt', articleFiles)
      for (const f of articlePaths) {
        if (!fs.existsSync(f)) {
          throw new Error('文章文件不存在（缺少待发布小红书文章文件）: ' + f)
        }
      }
      const now = this.stampNow()
      const items: StandardPublishItem[] = titles.map((t, i) => ({
        index: i + 1,
        title: t,
        digest: digests[i] || '',
        draftId: `dry_run_xhs_note_${i + 1}`,
        status: 'draft_saved',
      }))
      const resultPath = this.writeResultFile(
        scriptsDir,
        {
          status: 'dry_run_simulated',
          account_id: accountId,
          platform: 'xiaohongshu',
          article_type: 'xhs_note',
          notes: items.map((it) => ({
            index: it.index,
            title: it.title,
            draft_id: it.draftId,
            published: false,
          })),
          article_count: n,
          timestamp: now,
          articles: titles,
          dry_run: true,
          warning: '【演练模式执行结果】：本次处于离线演练模式，已完成文章与配图离线自检，未向小红书线上平台正式发布！',
        },
        'publish_result_xhs.json',
      )
      return {
        accountId,
        platform: 'xiaohongshu',
        dryRun: true,
        articleCount: n,
        titles,
        items,
        verify: { checked: false, article_count: n },
        dedupNote: '【演练模式提示】：本次处于离线演练模式，未向小红书线上平台正式发布笔记。',
        resultFile: resultPath,
      }
    }

    // 1. 自愈式核对
    if (!isDryRun) {
      try {
        await this.reconcile(cfg, accountId)
      } catch {}
    }

    // 2. 防重闸门
    if (!isDryRun && !force) {
      const dup = this.checkDedup(cfg, accountId, titles)
      if (dup) return dup
    }

    const account = resolveAccount(cfg, accountId)
    const xhsImagesPerNote = account.profile.content?.xhs_images_per_note || 4
    const articlePaths = this.defaultArticleFiles(scriptsDir, n, '_xhs.txt', articleFiles)

    const imageFiles: Record<string, string[]> = {}
    const imageCounts: number[] = []
    for (let i = 1; i <= n; i++) {
      const artPath = articlePaths[i - 1] || ''
      const imgs = resolveXhsNoteImages(
        scriptsDir,
        i,
        artPath,
        xhsImagesPerNote,
        cfg.runtime.dry_run === true,
        ctx.sandbox,
      )
      // publishOneNote 以 'IMG_A{i}_1'（或 'IMG_A{i}'）为键取整篇图片数组
      imageFiles[`IMG_A${i}_1`] = imgs
      imageCounts.push(imgs.length)
    }

    // 核心安全升级：优先使用 Cloudflare Worker 云端解密时效工单与 LocalRecipeRunner 盲执行
    if (ctx.recipeTicket || ctx.cfg.cloudflare_worker?.enforce_encryption) {
      const profileDir = xhsProfileDir(cfg, accountId)
      const allImages: string[] = []
      for (let i = 1; i <= n; i++) {
        const imgs = imageFiles[`IMG_A${i}_1`] || []
        allImages.push(...imgs)
      }

      let firstContent = ''
      if (articlePaths[0] && fs.existsSync(articlePaths[0])) {
        try {
          firstContent = fs.readFileSync(articlePaths[0], 'utf8')
        } catch {}
      }

      return this.executeWithRecipeRunner(ctx, {
        profileDir,
        defaultDomain: '.xiaohongshu.com',
        variables: {
          title: titles[0] || '',
          content: firstContent,
          digest: digests[0] || '',
        },
        localFiles: allImages,
        platformDisplayName: '小红书',
      })
    }

    // 【云端强管控拦截】：本地明文发文已永久关闭，保留源码仅供归档
    throw new Error('【安全门禁拦截】：未获得合法解密的云端发文工单 (RecipeTicket)，小红书本地明文发布已永久关闭！');

    // @deprecated 本地明文发布已关闭，以下代码保留仅供内部归档
    const job: XhsPublishJob = {
      account_id: accountId,
      titles,
      article_files: articlePaths,
      image_files: imageFiles,
      image_counts: imageCounts,
      publish_immediately: account.profile.publish_immediately === true,
      dry_run: isDryRun,
      min_words: account.profile.content?.min_words ?? 0,
      forbidden: account.profile.content?.forbidden_words ?? [],
      tags: account.profile.content?.topics ?? [],
    }

    const attemptedAtMs = Date.now()
    if (!isDryRun) {
      try {
        appendPublishAttempt(cfg, {
          account_id: accountId,
          platform: 'xiaohongshu',
          titles,
          attemptedAtMs,
        })
      } catch {}
    }

    let result: { dry_run: boolean; notes: XhsNote[] }
    try {
      result = await runXhsPublish(cfg, accountId, job, ctx.ownerTaskId)
    } catch (err) {
      if (!isDryRun) {
        try {
          updateAttemptOutcome(cfg, accountId, attemptedAtMs, 'failed', [])
        } catch {}
      }
      throw err
    }

    if (result.dry_run) {
      return {
        accountId,
        platform: 'xiaohongshu',
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

    const now = this.stampNow()
    const authorName = account.profile.author_name ?? ''
    const notes = result.notes || []

    const items: StandardPublishItem[] = notes.map((note, i) => ({
      index: i + 1,
      title: note.title,
      digest: digests[i] || '',
      draftId: note.note_id,
      url: note.url,
      published: note.published,
      status: note.status || (note.published ? 'published' : 'unconfirmed'),
      note: note.confirm_note,
    }))

    const batchOutcome = notes.every((x) => x.status === 'published')
      ? 'published'
      : notes.some((x) => x.status === 'failed')
        ? 'failed'
        : 'unconfirmed'
    const validNoteIds = notes.map((x) => x.note_id).filter(Boolean)

    if (!isDryRun) {
      try {
        updateAttemptOutcome(cfg, accountId, attemptedAtMs, batchOutcome, validNoteIds)
      } catch {}
    }

    const resultPath = this.writeResultFile(scriptsDir, {
      status: 'success',
      account_id: accountId,
      platform: 'xiaohongshu',
      article_count: n,
      author: authorName,
      timestamp: now,
      articles: titles,
      notes,
    })

    this.recordPublishBatch(cfg, {
      id: `batch_${now.replace(/[^0-9]/g, '').slice(0, 14)}_${Math.random().toString(36).slice(2, 6)}`,
      account_id: accountId,
      platform: 'xiaohongshu',
      article_count: n,
      author: authorName,
      timestamp: now,
      articles: titles,
      digests,
      items: notes.map((note, i) => ({
        index: i + 1,
        title: note.title,
        digest: digests[i] || '',
        draft_id: note.note_id,
        url: note.url,
        published: note.published,
      })),
    })

    return {
      accountId,
      platform: 'xiaohongshu',
      traceId: ctx.traceId,
      failureSnapshotDir: (result as any)?.failureSnapshotDir,
      dryRun: false,
      articleCount: notes.length,
      titles,
      items,
      mediaIds: validNoteIds,
      resultFile: resultPath,
      verify: {
        checked: notes.every((x) => x.status === 'published'),
        article_count: notes.length,
      },
    }
  }
}
