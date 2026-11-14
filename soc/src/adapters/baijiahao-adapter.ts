import fs from 'node:fs'
import path from 'node:path'
import type { Config } from '../config.ts'
import { resolveAccount } from '../config-runtime.ts'
import { brandImagePath, contentImagesPerArticle } from '../tools/shared.ts'
import { baijiahaoProfileDir } from '../sync-paths.ts'
import {
  baijiahaoCheckLogin,
  baijiahaoLogin,
  runBaijiahaoPublish,
  type BaijiahaoPublishJob,
} from '../baijiahao.ts'
import { BasePlatformAdapter } from './base-adapter.ts'
import type {
  LoginCheckResult,
  PlatformCapabilities,
  PublishContext,
  QrLoginResult,
  StandardPublishItem,
  StandardPublishResult,
} from './types.ts'

const CLICKBAIT_WORDS = ['震惊', '惊呆', '吓死', '删前必看', '速看', '99%的人不知道', '不看后悔', '必看必转']

export class BaijiahaoPlatformAdapter extends BasePlatformAdapter {
  readonly capabilities: PlatformCapabilities = {
    id: 'baijiahao',
    displayName: '百家号',
    supportedModes: ['browser'],
    supportedActions: ['draft', 'publish_now'],
    articleFormat: 'markdown',
    supportedArticleTypes: ['article'],
    supportsBatchCombination: false,
    maxTitleLength: 64,
    maxDigestLength: 120,
    maxArticlesPerBatch: 20,
    coverAspectRatios: ['16:9'],
    supportsOriginalDeclaration: false,
    supportsBrandImages: true,
    supportsScheduledSlots: false,
  }

  async validateBeforePublish(ctx: PublishContext): Promise<{ valid: boolean; errors: string[] }> {
    const baseResult = await super.validateBeforePublish(ctx)
    const errors = [...baseResult.errors]

    // 百家号专属标题党审核校验
    for (const t of ctx.titles || []) {
      const hit = CLICKBAIT_WORDS.find((w) => t.includes(w))
      if (hit) {
        errors.push(`百家号标题含标题党词「${hit}」（百度机器审核将拒稿或扣分）: ${t.slice(0, 40)}`)
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  async checkLogin(cfg: Config, accountId: string): Promise<LoginCheckResult> {
    try {
      const loggedIn = await baijiahaoCheckLogin(cfg, accountId)
      return { loggedIn, accountId, platform: 'baijiahao' }
    } catch (error) {
      return {
        loggedIn: false,
        accountId,
        platform: 'baijiahao',
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
      const logged = await baijiahaoLogin(cfg, accountId, options?.timeoutMs)
      return {
        ok: logged,
        accountId,
        platform: 'baijiahao',
        message: logged ? '百家号账号登录成功' : '登录未完成或登录窗口已关闭',
      }
    } catch (error) {
      return {
        ok: false,
        accountId,
        platform: 'baijiahao',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async publish(ctx: PublishContext): Promise<StandardPublishResult> {
    const { cfg, accountId, titles, digests, articleFiles, scriptsDir } = ctx
    const n = titles.length
    const isDryRun = Boolean(ctx.dryRun ?? cfg.runtime?.dry_run)

    // 核心安全门禁与 RecipeRunner 统一调度 (Fail-Closed 闭环)
    if (isDryRun && (ctx.recipeTicket || cfg.cloudflare_worker?.enforce_encryption)) {
      if (!ctx.recipeTicket) {
        throw new Error('【安全门禁拦截】：未接收到有效解密的云端发文调度工单 (RecipeTicket)，严禁在本地降级执行明文发文脚本！')
      }
      const profileDir = baijiahaoProfileDir(cfg, accountId)
      const articlePaths = this.defaultArticleFiles(scriptsDir, n, '.md', articleFiles)
      let firstContent = ''
      if (articlePaths[0] && fs.existsSync(articlePaths[0])) {
        try {
          firstContent = fs.readFileSync(articlePaths[0], 'utf8')
        } catch {}
      }
      return this.executeWithRecipeRunner(ctx, {
        profileDir,
        defaultDomain: '.baidu.com',
        variables: {
          title: titles[0] || '',
          content: firstContent,
          digest: digests[0] || '',
        },
        platformDisplayName: '百家号',
      })
    }

    // 演练模式 100% 物理绝对阻断：绝不启动 Chrome 浏览器发布百家号
    if (isDryRun) {
      const articlePaths = this.defaultArticleFiles(scriptsDir, n, '.md', articleFiles)
      for (const f of articlePaths) {
        if (!fs.existsSync(f)) {
          throw new Error('文章文件不存在（缺少待发布百家号文章文件）: ' + f)
        }
      }
      return {
        accountId,
        platform: 'baijiahao',
        dryRun: true,
        articleCount: n,
        titles,
        items: titles.map((t, i) => ({
          index: i + 1,
          title: t,
          digest: digests[i] || '',
          draftId: `dry_run_baijiahao_draft_${i + 1}`,
          status: 'draft_saved',
        })),
        resultFile: '',
        verify: { checked: true, article_count: n },
      }
    }

    const account = resolveAccount(cfg, accountId)
    const contentImgs = contentImagesPerArticle(cfg, account.profile)
    const sandbox = ctx.sandbox
    const sandboxedArticles = sandbox?.targetGroup?.articles || []

    let articlePaths: string[] = []
    if (articleFiles && articleFiles.length > 0) {
      articlePaths = articleFiles.map((f: string) => (path.isAbsolute(f) ? f : path.resolve(scriptsDir, f)))
    } else if (sandboxedArticles.length >= n) {
      articlePaths = sandboxedArticles.slice(0, n).map((a: any) => a.filePath).filter((p: string) => p && fs.existsSync(p))
    }
    if (articlePaths.length < n) {
      articlePaths = this.defaultArticleFiles(scriptsDir, n, '.md', articleFiles)
    }

    // 核心安全升级：优先使用 Cloudflare Worker 云端解密时效工单与 LocalRecipeRunner 盲执行
    if (ctx.recipeTicket || ctx.cfg.cloudflare_worker?.enforce_encryption) {
      const profileDir = baijiahaoProfileDir(cfg, accountId)
      let firstContent = ''
      if (articlePaths[0] && fs.existsSync(articlePaths[0])) {
        try {
          firstContent = fs.readFileSync(articlePaths[0], 'utf8')
        } catch {}
      }
      return this.executeWithRecipeRunner(ctx, {
        profileDir,
        defaultDomain: '.baidu.com',
        variables: {
          title: titles[0] || '',
          content: firstContent,
          digest: digests[0] || '',
        },
        platformDisplayName: '百家号',
      })
    }

    const contentFiles: Record<string, string> = {}
    for (let i = 1; i <= n; i++) {
      const art = sandboxedArticles.find((a: any) => a.index === i)
      for (let j = 1; j <= contentImgs; j++) {
        const key = `IMG_A${i}_${j}`
        const cImg = art?.contentImages?.find((ci: any) => ci.sub === j)
        let resolvedContent = ''
        if (cImg?.path && fs.existsSync(cImg.path)) {
          resolvedContent = cImg.path
        } else if (cfg.runtime.dry_run) {
          resolvedContent = path.resolve(scriptsDir, `content_${i}_${j}.png`)
        } else {
          // 【中文修复依据】：百家号严格沙箱配图隔离，严禁向 scriptsDir 嗅探历史旧图
          throw new Error(
            `【沙箱配图缺失拦截】：第 ${i} 篇百家号文章在专属任务沙箱中未找到第 ${j} 张插图（缺少 content_${i}_${j}.png）。绝对禁止拾取历史旧图充数！请先运行生图工具 gzh_generate_images。`
          )
        }
        contentFiles[key] = resolvedContent
      }
    }

    const coverFiles: Record<string, string> = {}
    if (account.profile.publish_immediately === true) {
      for (let i = 1; i <= n; i++) {
        const artCover = sandboxedArticles.find((a) => a.index === i)?.coverImage?.path
        if (cfg.runtime.dry_run) {
          coverFiles[String(i)] = path.resolve(scriptsDir, `cover_${i}.png`)
        } else if (artCover && fs.existsSync(artCover)) {
          coverFiles[String(i)] = artCover
        } else {
          // 【中文修复依据】：百家号封面严格沙箱隔离，未在沙箱生成则硬阻断，严禁从公共 scriptsDir 捡漏旧封面
          throw new Error(
            `【沙箱配图缺失拦截】：第 ${i} 篇百家号文章在专属任务沙箱中未找到封面物料（缺少 cover_${i}.png）。绝对禁止拾取历史旧图充数！请先运行生图工具 gzh_generate_images。`
          )
        }
      }
    }

    const brandImages = account.profile.brand_images
    const brandImageFiles: { header?: string; footer?: string } = {}
    if (brandImages?.header?.enabled) {
      const headerPath = brandImagePath(cfg, brandImages.header.file, 'brand_top.jpg', account.id)
      if (!cfg.runtime.dry_run && !fs.existsSync(headerPath)) {
        throw new Error('缺少百家号头部品牌图: ' + headerPath)
      }
      brandImageFiles.header = headerPath
    }
    if (brandImages?.footer?.enabled) {
      const footerPath = brandImagePath(cfg, brandImages.footer.file, 'brand_bot.jpg', account.id)
      if (!cfg.runtime.dry_run && !fs.existsSync(footerPath)) {
        throw new Error('缺少百家号尾部品牌图: ' + footerPath)
      }
      brandImageFiles.footer = footerPath
    }

    const job: BaijiahaoPublishJob = {
      account_id: accountId,
      titles,
      article_files: articlePaths,
      content_files: contentFiles,
      content_img_count: contentImgs,
      cover_files: coverFiles,
      publish_immediately: account.profile.publish_immediately === true,
      brand_image_files: brandImageFiles,
      dry_run: cfg.runtime.dry_run === true,
      min_words: account.profile.content?.min_words ?? 0,
      forbidden: account.profile.content?.forbidden_words ?? [],
      tags: account.profile.content?.topics ?? [],
    }

    const result = await runBaijiahaoPublish(cfg, accountId, job)

    if (result.dry_run) {
      return {
        accountId,
        platform: 'baijiahao',
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
    const drafts = result.drafts || []
    const warnings = drafts.filter((d) => d.warning)

    const items: StandardPublishItem[] = drafts.map((d, i) => ({
      index: i + 1,
      title: d.title,
      digest: digests[i] || '',
      draftId: d.draft_id,
      url: d.url,
      published: d.published,
      warning: d.warning,
      status: d.published ? 'published' : 'draft_saved',
    }))

    const resultPath = this.writeResultFile(scriptsDir, {
      status: 'success',
      account_id: accountId,
      platform: 'baijiahao',
      article_count: n,
      author: authorName,
      timestamp: now,
      articles: titles,
      drafts,
      ...(warnings.length > 0 ? { warnings: warnings.map((d) => d.warning) } : {}),
    })

    this.recordPublishBatch(cfg, {
      id: `batch_${now.replace(/[^0-9]/g, '').slice(0, 14)}_${Math.random().toString(36).slice(2, 6)}`,
      account_id: accountId,
      platform: 'baijiahao',
      article_count: n,
      author: authorName,
      timestamp: now,
      articles: titles,
      digests,
      items: drafts.map((d, i) => ({
        index: i + 1,
        title: d.title,
        digest: digests[i] || '',
        draft_id: d.draft_id,
        url: d.url,
        published: d.published,
      })),
    })

    return {
      accountId,
      platform: 'baijiahao',
      dryRun: false,
      articleCount: drafts.length,
      titles,
      items,
      resultFile: resultPath,
      verify: { checked: false },
    }
  }
}
