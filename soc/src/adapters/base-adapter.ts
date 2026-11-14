import fs from 'node:fs'
import path from 'node:path'
import type { Config } from '../config.ts'
import { normalizePlatform } from '../config.ts'
import {
  appendPublishRecord,
  readAccountPublishRecords,
} from '../publish-history.ts'
import {
  configuredAccountIds,
  RESULT_FILE,
  writeTextFile,
} from '../tools/shared.ts'
import { normalizeArticleTitle } from '../title-normalizer.ts'
import { LocalRecipeRunner } from '../cf-worker/recipe-runner.ts'
import { launchBrowserSafely, findBrowserExecutable } from '../zhihu.ts'
import { safelyInjectCookies } from '../session-cookies.ts'
import { loadStandardSession } from '../session-manager.ts'
import type {
  ISocialPlatformAdapter,
  LoginCheckResult,
  PlatformCapabilities,
  PublishContext,
  QrLoginResult,
  StandardPublishItem,
  StandardPublishResult,
} from './types.ts'

export interface ExecuteRecipeRunnerOptions {
  profileDir: string
  defaultDomain?: string
  variables?: Record<string, string>
  localFiles?: string[]
  platformDisplayName?: string
}

export abstract class BasePlatformAdapter implements ISocialPlatformAdapter {
  abstract readonly capabilities: PlatformCapabilities

  abstract checkLogin(cfg: Config, accountId: string): Promise<LoginCheckResult>

  abstract triggerQrLogin(
    cfg: Config,
    accountId: string,
    options?: { timeoutMs?: number },
  ): Promise<QrLoginResult>

  abstract publish(ctx: PublishContext): Promise<StandardPublishResult>

  reconcile?(_cfg: Config, _accountId: string): Promise<void>

  /**
   * 平台统一云端工单盲执行器 (Generic Blind Recipe Runner Bridge)
   * 核心防风控原则：网络出站 100% 在用户本地真实宽带与本地 Profile 中运行，仅将云端解密原子动作交付执行
   */
  protected async executeWithRecipeRunner(
    ctx: PublishContext,
    options: ExecuteRecipeRunnerOptions,
  ): Promise<StandardPublishResult> {
    // 核心安全门禁 1：必须持有合法解密的云端发文工单
    if (!ctx.recipeTicket) {
      throw new Error(
        `【安全门禁拦截】：适配器 [${this.capabilities.id}] 未接收到合法云端工单 (RecipeTicket)，严禁在本地降级明文执行！`,
      )
    }

    const ticket = ctx.recipeTicket
    const isDryRun = Boolean(ctx.dryRun)
    const runner = new LocalRecipeRunner()

    // 1. 演练模式（Dry Run）调度
    if (isDryRun) {
      const runResult = await runner.execute(ticket, {
        dryRun: true,
        variables: options.variables,
        localFiles: options.localFiles,
      })

      if (!runResult.success) {
        throw new Error(`【工单盲执行失败】：${runResult.error || '未知演练异常'}`)
      }

      const mockId = `dry_run_${ctx.publishMode || 'browser'}_media_id`
      const now = this.stampNow()
      const items: StandardPublishItem[] = ctx.titles.map((t, i) => ({
        index: i + 1,
        title: t,
        digest: ctx.digests[i] || '',
        draftId: mockId,
        status: 'draft_saved',
      }))

      const resData = {
        status: 'dry_run_simulated',
        account_id: ctx.accountId,
        platform: this.capabilities.id,
        recipe_id: ticket.recipeId,
        draft_media_id: mockId,
        draft_media_ids: ctx.titles.map(() => mockId),
        timestamp: now,
        articles: ctx.titles,
        dry_run: true,
        executed_count: runResult.executedCount,
      }
      const resultPath = this.writeResultFile(ctx.scriptsDir, resData)

      return {
        accountId: ctx.accountId,
        platform: this.capabilities.id,
        publishMode: ctx.publishMode || 'browser',
        publishAction: ctx.publishAction || 'draft',
        dryRun: true,
        mediaId: mockId,
        mediaIds: ctx.titles.map(() => mockId),
        articleCount: ctx.titles.length,
        titles: ctx.titles,
        items,
        verify: { checked: true, article_count: ctx.titles.length },
        resultFile: resultPath,
      }
    }

    // 2. 真实发文执行流（本地独立受控无头浏览器）
    const session = loadStandardSession(ctx.cfg, this.capabilities.id, ctx.accountId)
    const executablePath = findBrowserExecutable(ctx.cfg)

    // 安全沙箱防御加固：强力禁用所有扩展与自动化嗅探插件，防止第三方扩展监听 DOM 事件窃取工单选择器
    const securityHardenedArgs = [
      '--disable-extensions',
      '--disable-default-apps',
      '--disable-component-extensions-with-background-pages',
    ]

    const browser = await launchBrowserSafely({
      executablePath,
      headless: true,
      userDataDir: options.profileDir,
      defaultViewport: { width: 1440, height: 900 },
      args: securityHardenedArgs,
      platformDisplayName: options.platformDisplayName || this.capabilities.displayName,
    })

    try {
      const pages = await browser.pages()
      const page = pages.length > 0 ? pages[0] : await browser.newPage()

      // 注入本地安全 Cookie（本地隐私不出站）
      if (session?.cookies && options.defaultDomain) {
        await safelyInjectCookies(page, session.cookies, options.defaultDomain).catch(() => {})
      }

      // 盲执行云端解密工单
      const runResult = await runner.execute(ticket, {
        page,
        dryRun: false,
        variables: options.variables,
        localFiles: options.localFiles,
        onLog: (msg) => console.log(`[${this.capabilities.id}-RecipeRunner] ${msg}`),
      })

      if (!runResult.success) {
        throw new Error(`【工单盲执行失败】：${runResult.error || '未知执行异常'}`)
      }

      const meta = runResult.extractedMetadata || {}
      const returnedId = (meta.draftId || meta.noteId || meta.articleId || meta.pgcId || meta.id || `rec_${Date.now()}`) as string

      const now = this.stampNow()
      const items: StandardPublishItem[] = ctx.titles.map((t, i) => ({
        index: i + 1,
        title: t,
        digest: ctx.digests[i] || '',
        draftId: returnedId,
        status: ctx.publishAction === 'publish_now' ? 'published' : 'draft_saved',
      }))

      const resData = {
        status: 'success',
        account_id: ctx.accountId,
        platform: this.capabilities.id,
        recipe_id: ticket.recipeId,
        media_id: returnedId,
        article_count: ctx.titles.length,
        timestamp: now,
        articles: ctx.titles,
        publish_action: ctx.publishAction || 'draft',
        publish_status: ctx.publishAction === 'publish_now' ? 'published' : 'draft_saved',
        dry_run: false,
        logs: runResult.logs,
      }
      const resultPath = this.writeResultFile(ctx.scriptsDir, resData)

      // 记录本地发布审计批次
      this.recordPublishBatch(ctx.cfg, {
        id: `batch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        account_id: ctx.accountId,
        platform: this.capabilities.id,
        author: ctx.cfg.accounts[ctx.accountId]?.author_name || '作者',
        timestamp: now,
        articles: ctx.titles,
        draft_media_id: returnedId,
        article_count: ctx.titles.length,
        publish_action: ctx.publishAction || 'draft',
      })

      return {
        accountId: ctx.accountId,
        platform: this.capabilities.id,
        publishMode: 'browser',
        publishAction: ctx.publishAction || 'draft',
        dryRun: false,
        mediaId: returnedId,
        articleCount: ctx.titles.length,
        titles: ctx.titles,
        items,
        verify: { checked: true, article_count: ctx.titles.length },
        resultFile: resultPath,
      }
    } finally {
      await browser.close().catch(() => {})
    }
  }

  /** 统一的前置参数与业务校验 */
  async validateBeforePublish(ctx: PublishContext): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = []
    const { titles, digests, articleFiles } = ctx

    // 平台支持动作白名单强门禁断言：彻底杜绝隐式降级与行为歧义
    const action = ctx.publishAction || 'draft'
    if (this.capabilities.supportedActions && !this.capabilities.supportedActions.includes(action)) {
      errors.push(
        `【平台动作不支持拦截】：平台 [${this.capabilities.displayName || this.capabilities.id}] 不支持动作「${action}」！支持的动作仅为：${this.capabilities.supportedActions.join('、')}。请调整 publish_action 参数后再试。`
      )
    }

    // 平台支持发布方案校验
    if (ctx.publishMode && this.capabilities.supportedModes && !this.capabilities.supportedModes.includes(ctx.publishMode)) {
      errors.push(
        `【平台方案不支持拦截】：平台 [${this.capabilities.displayName || this.capabilities.id}] 不支持发布方案「${ctx.publishMode}」！支持的方案仅为：${this.capabilities.supportedModes.join('、')}。`
      )
    }

    if (!Array.isArray(titles) || titles.length === 0 || titles.length > this.capabilities.maxArticlesPerBatch) {
      errors.push(`titles 必须包含 1~${this.capabilities.maxArticlesPerBatch} 个标题`)
    }
    if (!Array.isArray(digests) || digests.length !== titles.length) {
      errors.push(`digests 数量（${digests?.length ?? 0}）必须与 titles 数量（${titles.length}）一致`)
    }
    if (articleFiles && articleFiles.length !== titles.length) {
      errors.push(`article_files 数量（${articleFiles.length}）必须与 titles 数量（${titles.length}）一致`)
    }

    const maxTitle = this.capabilities.maxTitleLength
    for (const t of titles || []) {
      if (typeof t !== 'string' || t.length > maxTitle) {
        errors.push(`标题超 ${maxTitle} 字: ${String(t).slice(0, 40)}`)
      }
    }

    const maxDigest = this.capabilities.maxDigestLength
    for (const d of digests || []) {
      if (typeof d !== 'string' || d.length > maxDigest) {
        errors.push(`摘要超 ${maxDigest} 字: ${String(d).slice(0, 40)}`)
      }
    }

    // 跨账号标题防碰撞断言（非 dry_run 且非 force 时生效）
    if (!ctx.cfg.runtime.dry_run && !ctx.force) {
      try {
        this.assertNoCrossAccountTitleCollision(ctx.cfg, ctx.accountId, ctx.platform, titles)
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err))
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  /** 生成当前 ISO 时间戳 */
  protected stampNow(): string {
    return new Date().toISOString().replace('T', ' ').slice(0, 19)
  }

  /** 获取默认文章文件路径集合 */
  protected defaultArticleFiles(sdir: string, n: number, ext: string, custom?: string[]): string[] {
    const names = custom?.length ? custom : Array.from({ length: n }, (_, i) => `article_v2_${i + 1}${ext}`)
    return names.map((f) => {
      if (path.isAbsolute(f)) return f
      const directCandidate = path.resolve(sdir, f)
      if (fs.existsSync(directCandidate)) return directCandidate
      const articlesCandidate = path.resolve(sdir, 'articles', f)
      if (fs.existsSync(articlesCandidate)) return articlesCandidate
      return directCandidate
    })
  }

  /** 统一将发布结果写入账号工作区 result.json（支持同时写入形态专属文件防止多批次覆盖） */
  protected writeResultFile(sdir: string, data: Record<string, unknown>, extraFilename?: string): string {
    if (extraFilename) {
      try {
        writeTextFile(sdir, extraFilename, JSON.stringify(data, null, 2) + '\n')
      } catch {}
    }
    return writeTextFile(sdir, RESULT_FILE, JSON.stringify(data, null, 2) + '\n')
  }

  /** 统一将批次写入发布审计历史记录 */
  protected recordPublishBatch(cfg: Config, record: Parameters<typeof appendPublishRecord>[1]): void {
    try {
      appendPublishRecord(cfg, record)
    } catch {
      // 容错：历史追加失败不阻断核心结果
    }
  }

  /** 跨账号标题完全一致硬闸断言 */
  protected assertNoCrossAccountTitleCollision(
    cfg: Config,
    accountId: string,
    platform: string,
    titles: string[],
  ): void {
    const norm = (s: string) => normalizeArticleTitle(s)
    const incoming = new Set(titles.map((t) => norm(String(t))).filter(Boolean))
    if (incoming.size === 0) return

    for (const otherId of configuredAccountIds(cfg)) {
      if (otherId === accountId) continue
      const other = cfg.accounts[otherId]
      if (!other || !other.enabled) continue
      if (normalizePlatform(other.platform) !== platform) continue

      for (const rec of readAccountPublishRecords(cfg, otherId)) {
        for (const t of rec.articles || []) {
          if (t && incoming.has(norm(t))) {
            throw new Error(
              `标题与其他账号「${otherId}」已发布标题完全一致（选题可跨账号重复，但标题必须改写：换句式/换切角/换重点）: ${t}`,
            )
          }
        }
      }
    }
  }
}
