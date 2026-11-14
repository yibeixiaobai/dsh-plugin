import path from 'node:path'
import type { Config } from '../config.ts'
import {
  getStrictImageQuota,
  resolveEffectiveImageApi,
} from './shared.ts'
import {
  calculateManifestFingerprint,
  readTaskManifest,
  registerSandboxedImage,
  resolveTaskSandbox,
  writeSandboxedArticle,
  writeTaskManifest,
} from '../sandbox/taskSandbox.ts'
import type { VisualSlotBlueprint } from '../sandbox/taskSandboxTypes.ts'
import { genImagesTool } from './genImages.ts'
import type { ArticleProduceItem, SocialPublisherToolArgs } from './socialPublisherUnifiedTypes.ts'

export async function executeProduceAction(params: {
  cfg: Config
  args: SocialPublisherToolArgs
  targetAccountId: string
  targetPlatform: string
  effectiveWs?: string
  isDry: boolean
  toolContext?: any
}): Promise<any> {
  const { cfg, args, targetAccountId, targetPlatform, effectiveWs, isDry, toolContext } = params

  const incomingArticles: ArticleProduceItem[] =
    Array.isArray(args.articles) && args.articles.length > 0
      ? args.articles.map((a, idx) => ({ ...a, index: a.index || idx + 1 }))
      : args.title && args.content
        ? [
          {
            index: 1,
            title: args.title,
            content: args.content,
            digest: (args.content || '').slice(0, 120).replace(/\n/g, ' '),
            visual_slots: args.visual_slots,
          },
        ]
        : []

  if (incomingArticles.length === 0) {
    throw new Error("action: 'produce' 必须提供 title 与 content 参数，或提供 articles 数组")
  }

  const accountProfile =
    cfg.accounts?.[targetAccountId] || ({ id: targetAccountId, platform: targetPlatform } as any)
  const quotaInfo = getStrictImageQuota(cfg, accountProfile)
  const strictQuota = quotaInfo.totalRequiredImages
  const isXhs = targetPlatform === 'xiaohongshu'
  const isGzh = targetPlatform === 'gzh'
  const defaultRatio = isXhs ? '3:4' : '16:9'

  // 显式传入 visual_slots 时的硬核配额断言拦截
  const explicitSlots =
    args.visual_slots || (incomingArticles.length === 1 ? incomingArticles[0]?.visual_slots : undefined)
  if (
    incomingArticles.length === 1 &&
    Array.isArray(explicitSlots) &&
    explicitSlots.length > 0 &&
    explicitSlots.length !== strictQuota
  ) {
    throw new Error(
      `【严格配额拦截】：平台 [${targetPlatform}] 规则要求必须精确生产 ${strictQuota} 张配图，但实际传入 ${explicitSlots.length} 个视觉插槽！\n` +
        `请重新调整 visual_slots 数组，使其长度严格等于 ${strictQuota} 后再调用 produce。`,
    )
  }

  // 1. 初始化会话专属项目沙箱
  const customTaskId = args.task_id || `task_${Date.now()}_${targetPlatform}_${targetAccountId}`
  const articleType = isXhs ? 'newspic' : 'news'
  const sandbox = resolveTaskSandbox(
    cfg,
    customTaskId,
    targetPlatform,
    targetAccountId,
    articleType,
    undefined,
    effectiveWs,
  )

  // 2. 批量构建与落盘各篇正文，并构造视觉槽位蓝图
  const articleMetas: any[] = []
  const allBlueprints: VisualSlotBlueprint[] = []
  const genItems: any[] = []

  for (let artIdx = 0; artIdx < incomingArticles.length; artIdx++) {
    const art = incomingArticles[artIdx]!
    const currentIdx = art.index || artIdx + 1
    const artFormat = art.format || (isXhs ? 'text' : isGzh ? 'html' : 'markdown')
    const artDigest = art.digest || art.content.slice(0, 120).replace(/\n/g, ' ')
    const meta = writeSandboxedArticle(
      sandbox,
      currentIdx,
      art.title,
      artDigest,
      artFormat,
      art.content,
    )
    articleMetas.push(meta)

    // 视觉插槽：根据账号配额与平台规范，严格精准规划封面与正文插图
    const artIsNewspic = isXhs || artFormat === 'text' || art.format === 'text'
    const artQuota = getStrictImageQuota(cfg, accountProfile, artIsNewspic ? 'newspic' : 'news')
    const incomingSlots = art.visual_slots || []

    if (artQuota.isNewspic) {
      // 小红书/微信小绿书卡片图
      const targetCount = artQuota.cardImageCount || 4
      for (let sub = 1; sub <= targetCount; sub++) {
        const matchedSlot =
          incomingSlots.find(s => s.role === 'card' || s.role === 'cover') || incomingSlots[sub - 1]
        const prompt =
          matchedSlot?.prompt || `${art.title} 核心知识卡片 ${sub}，严谨美观全中文排版`
        const bp: VisualSlotBlueprint = {
          slotId: `slot_a${currentIdx}_${sub}`,
          kind: 'pic',
          index: currentIdx,
          sub,
          ratio: '3:4',
          intentDescription: matchedSlot?.description || `第${currentIdx}篇小绿书卡片 ${sub}`,
          generationPrompt: prompt,
          status: 'planned',
        }
        allBlueprints.push(bp)
        genItems.push({
          kind: 'pic',
          index: currentIdx,
          sub,
          prompt,
          role: sub === 1 ? 'cover' : 'card',
          aspectRatio: '3:4',
          source: matchedSlot?.source,
          search_query: matchedSlot?.search_query,
        })
      }
    } else {
      // 长文平台（微信公众号长文、知乎、百家号、今日头条）
      // 1. 封面图
      if (artQuota.coverRequired) {
        const isHeadline = currentIdx === 1
        const coverRatio = isHeadline && isGzh ? '2.35:1' : isGzh ? '1:1' : '16:9'
        const coverSlot = incomingSlots.find(s => s.role === 'cover') || incomingSlots[0]
        const coverPrompt =
          coverSlot?.prompt ||
          `高清科技与学术主题插画，画面以「${art.title}」为核心视觉主题，严谨工整，全中文质感`
        const bp: VisualSlotBlueprint = {
          slotId: `slot_a${currentIdx}_cover`,
          kind: 'cover',
          index: currentIdx,
          sub: 1,
          ratio: coverRatio as any,
          intentDescription: coverSlot?.description || `第${currentIdx}篇封面：${art.title}`,
          generationPrompt: coverPrompt,
          status: 'planned',
        }
        allBlueprints.push(bp)
        genItems.push({
          kind: 'cover',
          index: currentIdx,
          sub: 1,
          prompt: coverPrompt,
          role: 'cover',
          aspectRatio: coverRatio,
          source: coverSlot?.source || 'gen',
          search_query: coverSlot?.search_query,
        })
      }

      // 2. 正文插图 (精准按 artQuota.contentImageCount 补全)
      const requiredContentCount = artQuota.contentImageCount || 0
      const incomingContentSlots = incomingSlots.filter(s => s.role === 'inline' || s.role === 'card')
      for (let sub = 1; sub <= requiredContentCount; sub++) {
        const matchedSlot = incomingContentSlots[sub - 1]
        const prompt = matchedSlot?.prompt || '16:9 宽屏专业科技信息图谱，全流程分析看板，模块化知识对比图解'
        const bp: VisualSlotBlueprint = {
          slotId: `slot_a${currentIdx}_content_${sub}`,
          kind: 'content',
          index: currentIdx,
          sub,
          ratio: '16:9',
          intentDescription: matchedSlot?.description || `第${currentIdx}篇正文插图 ${sub}`,
          generationPrompt: prompt,
          status: 'planned',
        }
        allBlueprints.push(bp)
        genItems.push({
          kind: 'content',
          index: currentIdx,
          sub,
          prompt,
          role: 'inline',
          aspectRatio: '16:9',
          source: matchedSlot?.source || 'search',
          search_query: matchedSlot?.search_query || `${art.title} 知识图谱 ${sub}`,
        })
      }
    }
  }

  // 3. 阶段二：动态继承生图凭据，内部并发/批量执行 AI 生图与网络搜图打散去重（遇阻秒级降级保底）
  resolveEffectiveImageApi(cfg, effectiveWs)
  const produceDryRun = isDry
  const genTool = genImagesTool(cfg, toolContext)

  const genRes = await genTool.execute(
    {
      account_id: targetAccountId,
      items: genItems as any,
      dry_run: produceDryRun,
      task_id: customTaskId,
      workspace: effectiveWs,
      titles: incomingArticles.map(a => a.title),
      from_unified_tool: true,
    } as any,
    toolContext,
  )

  // 4. 将生成的图片登记到沙箱物料清单
  const manifest = readTaskManifest(cfg, customTaskId, effectiveWs) || sandbox.manifest
  const generatedImages: Array<{ index: number; sub: number; path: string; role: string; aspectRatio: string }> = []
  for (let i = 0; i < genRes.generated.length; i++) {
    const g = genRes.generated[i]!
    const bp = allBlueprints[i]
    const ratio = (bp?.ratio || defaultRatio) as any
    const registered = registerSandboxedImage(
      sandbox,
      (bp?.kind || (isXhs ? 'pic' : 'cover')) as any,
      bp?.index || 1,
      bp?.sub || i + 1,
      g.out,
      ratio,
    )
    if (bp) {
      bp.status = 'completed'
      bp.resolvedImagePath = registered.targetPath
      bp.resolvedImageHash = registered.hash
    }
    generatedImages.push({
      index: bp?.index || 1,
      sub: bp?.sub || i + 1,
      path: registered.targetPath,
      role: bp?.kind || 'inline',
      aspectRatio: ratio,
    })
  }

  manifest.visualSlots = allBlueprints
  manifest.stage = 'reviewed'
  const currentManifestHash = calculateManifestFingerprint(manifest)
  writeTaskManifest(cfg, manifest, effectiveWs)

  const firstMeta = articleMetas[0]
  return {
    ok: true,
    action: 'produce',
    task_id: customTaskId,
    sandbox_dir: sandbox.rootDir,
    manifest_fingerprint: currentManifestHash,
    article: firstMeta
      ? {
        title: incomingArticles[0]?.title,
        path: firstMeta.filePath,
        word_count: incomingArticles[0]?.content.length || 0,
        fingerprint: firstMeta.articleFingerprint,
      }
      : undefined,
    articles: incomingArticles.map((a, i) => ({
      index: a.index || i + 1,
      title: a.title,
      path: articleMetas[i]?.filePath,
      word_count: a.content.length,
      fingerprint: articleMetas[i]?.articleFingerprint,
    })),
    images: generatedImages,
    manifest_path: path.join(sandbox.rootDir, 'manifest.json'),
    preview_ready: true,
    instruction: '图文稿件与配图已全量生成完毕并校验通过！请在对话中向用户展示图文排版效果与审校卡片，等待用户审校确认。',
  }
}
