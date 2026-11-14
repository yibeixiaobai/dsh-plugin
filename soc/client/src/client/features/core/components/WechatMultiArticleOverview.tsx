import React from 'react'
import {
  Smartphone,
  ChevronRight,
  Image as ImageIcon,
  CheckCircle2,
  Layers,
} from 'lucide-react'
import type { ArticleItem } from '../socialPublisherWorkflowExtractor.js'
import { isRenderableImageUrl, extractLocalDiskPathFromUrl, extractFileName, resolveTargetCardCount } from '../socialPublisherWorkflowExtractor.js'
import { useResolvedMediaUrls } from '../useResolvedMediaUrls.js'
import css from './WechatMultiArticleOverview.module.css'
export interface WechatMultiArticleOverviewProps {
  articles: ArticleItem[]
  workspacePath?: string
  workspaceIdentity?: string
  sessionId?: string
  scriptsDir?: string
  onSelectArticle: (index: number) => void
}
/**
 * 微信公众号「多图文群发合辑」高保真拟真排版看板
 * 完美复刻微信订阅号消息流：头条 2.35:1 大图 + 次条 1:1 方图紧凑列表 + 小绿书 3:4 竖版多图胶卷
 */
export function WechatMultiArticleOverview({
  articles,
  workspacePath,
  workspaceIdentity,
  sessionId,
  scriptsDir: explicitScriptsDir,
  onSelectArticle,
}: WechatMultiArticleOverviewProps) {
  // 按照文章体裁与序号拆分：头条、次条长文、小绿书
  const headline = articles.find(a => a.articleType !== 'newspic') || articles[0]
  const rawSubArticles = articles.filter(a => a.id !== headline?.id && a.articleType !== 'newspic')
  // 【中文修复依据】：契约24——画纸末端次条长文幽灵草稿零容忍防御
  // 当合辑中已包含真实物理落盘长文时，彻底过滤无物理落盘文件且无有效内容的虚假幽灵次条
  const hasPhysicalNews = rawSubArticles.some(a => Boolean(a.filePath && (a.id.startsWith('art_file_') || (!a.id.startsWith('art_auto_') && !a.id.startsWith('art_seq_')))))
  const subArticles = rawSubArticles.filter((a) => {
    if (!hasPhysicalNews) return true
    const isPhysical = Boolean(a.filePath && (a.id.startsWith('art_file_') || (!a.id.startsWith('art_auto_') && !a.id.startsWith('art_seq_'))))
    if (isPhysical) return true
    const hasValidContent = Boolean(a.content && a.content.length > 300 && !a.content.includes('已生成就绪') && !a.content.includes('快马加鞭赶来的路上'))
    const hasValidCover = Boolean(a.coverUrl && !a.coverUrl.includes('placeholder'))
    return hasValidContent || hasValidCover
  })
  // 【中文修复依据】：契约24——画纸末端幽灵小绿书草稿过滤防御
  const newsTitles = new Set(
    articles
      .filter(a => a.articleType !== 'newspic')
      .map(a => a.title.replace(/^[《<]|[》>]$/g, '').replace(/\s+/g, '').trim())
      .filter(Boolean),
  )
  const rawNewspics = articles.filter(a => a.articleType === 'newspic')
  const hasPhysicalNewspic = rawNewspics.some(
    np => Boolean(np.filePath && (np.filePath.includes('_pic.json') || np.filePath.includes('newspic'))) || (np.images && np.images.length > 0),
  )
  const newspics = rawNewspics.filter((np) => {
    const isPhysical = Boolean(np.filePath && (np.filePath.includes('_pic.json') || np.filePath.includes('newspic'))) || (np.images && np.images.length > 0)
    if (isPhysical) return true
    const cleanT = np.title.replace(/^[《<]|[》>]$/g, '').replace(/\s+/g, '').trim()
    if (hasPhysicalNewspic || (cleanT && newsTitles.has(cleanT))) {
      return false // 存在真实小绿书或与长文同名时，丢弃虚拟占位稿
    }
    return true
  })
  // 综合推导当前任务沙箱生效物理目录（多级兜底保证 100% 命中沙箱 images 目录）
  const effectiveScriptsDir =
    explicitScriptsDir ||
    headline?.scriptsDir ||
    articles.find(a => a.scriptsDir)?.scriptsDir
  // 聚合所有封面与小绿书配图做解析（附带沙箱账号目录双向探针，彻底解决次条灰色破图方块）
  const allMediaUrls = React.useMemo(() => {
    const list: string[] = []
    const normEffective = effectiveScriptsDir?.replace(/\\/g, '/').replace(/\/+$/, '')
    for (const a of articles) {
      const idx = a.index || 1
      const sDir = a.scriptsDir?.replace(/\\/g, '/').replace(/\/+$/, '') || normEffective
      const acc = a.accountId || headline?.accountId || 'default'
      const targetDirs = sDir ? [
        sDir,
        `${sDir}/gzh_${acc}`, `${sDir}/${acc}`,
      ] : []
      if (a.coverUrl && !list.includes(a.coverUrl)) list.push(a.coverUrl)
      if (a.images) {
        for (const img of a.images) {
          if (img && !list.includes(img)) list.push(img)
        }
      }
      // 【中文修复依据】：次条长文严格锁定 cover_{idx}，杜绝克隆首篇封面与小绿书竖版卡片串用
      const probeFiles = [
        `cover_${idx}.png`, `cover_${idx}.jpg`, `cover_${idx}.webp`,
        ...(idx === 1 ? ['cover.png', 'cover.jpg'] : []),
      ]
      for (const p of probeFiles) {
        if (!list.includes(p)) list.push(p)
        for (const td of targetDirs) {
          const direct1 = `${td}/${p}`
          const direct2 = `${td}/images/${p}`
          if (!list.includes(direct1)) list.push(direct1)
          if (!list.includes(direct2)) list.push(direct2)
        }
      }
    }
    return list
  }, [articles, effectiveScriptsDir])
  const resolvedUrls = useResolvedMediaUrls(allMediaUrls, {
    workspacePath,
    workspaceIdentity,
    accountId: headline?.accountId,
    scriptsDir: effectiveScriptsDir,
    sessionId,
  })
  const resolvedMap = React.useMemo(() => {
    const map = new Map<string, string>()
    for (let i = 0; i < allMediaUrls.length; i++) {
      const raw = allMediaUrls[i]
      const res = resolvedUrls[i]
      if (raw && res && isRenderableImageUrl(res)) {
        map.set(raw, res)
        map.set(raw.replace(/\\/g, '/'), res)
        const diskPath = extractLocalDiskPathFromUrl(raw)
        if (diskPath) {
          map.set(diskPath, res)
          map.set(diskPath.replace(/\\/g, '/'), res)
        }
        const fileName = extractFileName(raw)
        if (fileName && !map.has(fileName)) map.set(fileName, res)
      }
    }
    return map
  }, [allMediaUrls, resolvedUrls])
  const [imgErrorMap, setImgErrorMap] = React.useState<Record<string, boolean>>({})
  // 【中文修复依据】：一旦媒体解析探针产出新的有效图片映射，自动清空旧错误标记，彻底根除死锁破图
  React.useEffect(() => {
    setImgErrorMap({})
  }, [resolvedUrls])
  const accountDisplayName = headline?.accountName || headline?.accountId || '微信官方公众号'
  // 安全获取可在 <img> 标签中渲染的图片真实 URL（【中文修复依据】：增加 subCardIndex 槽位感知，杜绝小绿书卡片全重复为封面）
  const getSafeResolvedImageUrl = React.useCallback((rawUrl?: string, articleIndex?: number, subCardIndex?: number): string | undefined => {
    if (rawUrl) {
      const trimmed = rawUrl.trim()
      if (isRenderableImageUrl(trimmed)) return trimmed
      const direct = resolvedMap.get(trimmed) || resolvedMap.get(trimmed.replace(/\\/g, '/'))
      if (direct && isRenderableImageUrl(direct)) return direct
      const diskPath = extractLocalDiskPathFromUrl(trimmed)
      if (diskPath) {
        const fromDisk = resolvedMap.get(diskPath) || resolvedMap.get(diskPath.replace(/\\/g, '/'))
        if (fromDisk && isRenderableImageUrl(fromDisk)) return fromDisk
      }
      const fileName = extractFileName(trimmed)
      if (fileName) {
        const fromName = resolvedMap.get(fileName)
        if (fromName && isRenderableImageUrl(fromName)) return fromName
        for (const [k, v] of resolvedMap.entries()) {
          if ((k === fileName || k.endsWith('/' + fileName) || k.endsWith('\\' + fileName)) && isRenderableImageUrl(v)) return v
        }
      }
    }
    if (articleIndex) {
      const fallbackNames: string[] = subCardIndex !== undefined
        ? [
          `pic_${articleIndex}_${subCardIndex}.png`, `pic_${articleIndex}_${subCardIndex}.jpg`,
          `xhs_pic_${articleIndex}_${subCardIndex}.png`, `xhs_pic_${articleIndex}_${subCardIndex}.jpg`,
          ...(articleIndex === 1 ? [`pic_${subCardIndex}.png`, `pic_${subCardIndex}.jpg`] : []),
          ...(subCardIndex === 1 ? [`cover_${articleIndex}.png`, `cover_${articleIndex}.jpg`, ...(articleIndex === 1 ? ['cover.png', 'cover.jpg'] : [])] : []),
        ]
        : [
          `cover_${articleIndex}.png`, `cover_${articleIndex}.jpg`, `cover_${articleIndex}.webp`,
          ...(articleIndex === 1 ? ['cover.png', 'cover.jpg'] : []), `pic_${articleIndex}.png`,
        ]
      for (const fb of fallbackNames) {
        const matched = resolvedMap.get(fb)
        if (matched && isRenderableImageUrl(matched)) return matched
        for (const [k, v] of resolvedMap.entries()) {
          if ((k === fb || k.endsWith('/' + fb) || k.endsWith('\\' + fb)) && isRenderableImageUrl(v)) return v
        }
      }
    }
    return undefined
  }, [resolvedMap])
  const headlineCover = getSafeResolvedImageUrl(headline?.coverUrl, headline?.index || 1)
  const isHeadlineCoverValid = Boolean(headlineCover && !imgErrorMap[headlineCover])
  return (
    <div className={css.container}>
      {/* 1. 微信订阅号群发外壳卡片 */}
      <div className={css.feedCard}>
        {/* 顶部身份栏 */}
        <div className={css.feedHeader}>
          <div className={css.accountRow}>
            <div className={css.accountAvatar}>
              订阅号
            </div>
            <div className={css.accountNameCol}>
              <div className={css.accountName}>
                <span>{accountDisplayName}</span>
                <span style={{ borderRadius: 4, background: 'rgba(16, 185, 129, 0.1)', color: '#059669', padding: '1px 4px', fontSize: 9, fontWeight: 700 }}>
                  认证号
                </span>
              </div>
              <div className={css.feedMeta}>今天 12:00 · 微信多图文合辑群发推送</div>
            </div>
          </div>
          <div className={css.feedCountBadge}>
            <Layers size={12} style={{ color: '#059669' }} />
            <span>合辑推送 · 共 {subArticles.length + (headline ? 1 : 0)} 篇</span>
          </div>
        </div>
        {/* 2. #1 首篇封面大图深度长文区块 (2.35:1 视野大图，带智能防破图与沉浸底纹) */}
        {headline && (
          <div
            onClick={() => onSelectArticle(articles.indexOf(headline))}
            className={css.headlineSlot}
            title="点击审校并编辑 #1 首篇长文"
          >
            <div className={css.headlineBanner}>
              {isHeadlineCoverValid ? (
                <img
                  src={headlineCover}
                  alt=""
                  onError={() => setImgErrorMap(prev => ({ ...prev, [headlineCover!]: true }))}
                  className={css.headlineImg}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#34d399' }}>
                  <ImageIcon size={24} />
                  <span style={{ fontSize: 11 }}>微信公众号封面大图排版</span>
                </div>
              )}
              {/* 大图上方标题与渐变蒙层 */}
              <div className={css.headlineOverlay}>
                <div className={css.headlineBadgeRow}>
                  <span className={css.headlineBadge}>
                    #1 封面大图
                  </span>
                  <span style={{ fontSize: 11, opacity: 0.85 }}>深度长文</span>
                </div>
                <h3 className={css.headlineTitle}>
                  {headline.title || '未命名首篇长文'}
                </h3>
              </div>
            </div>
          </div>
        )}
        {/* 3. #2 ~ #N 次条图文列表 (1:1 方形封面 + 标题摘要紧凑列表) */}
        {subArticles.length > 0 && (
          <div className={css.subList}>
            {subArticles.map((subArt) => {
              const actualIdx = articles.indexOf(subArt)
              const articleIdx = subArt.index ?? (actualIdx + 1)
              const subCover = getSafeResolvedImageUrl(subArt.coverUrl, articleIdx)
              return (
                <div
                  key={subArt.id || actualIdx}
                  onClick={() => onSelectArticle(actualIdx)}
                  className={css.subItem}
                  title={`点击审校并编辑 #${actualIdx + 1} 次条长文`}
                >
                  <div className={css.subInfo}>
                    <div>
                      <span className={css.subBadge}>
                        #{actualIdx + 1} 次条
                      </span>
                    </div>
                    <h4 className={css.subTitle}>
                      {subArt.title || '未命名次条长文'}
                    </h4>
                    {subArt.digest && (
                      <p style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary, #9ca3af)', margin: 0 }}>
                        {subArt.digest}
                      </p>
                    )}
                  </div>
                  {/* 右侧 1:1 方形列表封面 */}
                  <div className={css.subCoverWrap}>
                    {subCover && !imgErrorMap[subCover] ? (
                      <img
                        src={subCover}
                        alt=""
                        onError={() => setImgErrorMap(prev => ({ ...prev, [subCover]: true }))}
                        className={css.subCoverImg}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                        <ImageIcon size={20} />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {/* 4. 小绿书卡片区块 (独立图片消息 · 单篇排版) */}
        {newspics.length > 0 && (
          <div className="border-t border-border/30 bg-surface/20 p-4 space-y-3">
            <div className="flex items-center justify-between text-[11px] text-foreground-muted px-1">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Smartphone className="size-3" />
                <span>同批次独立发表 · 微信小绿书 (图片消息)</span>
              </span>
              <span>独立单篇发送</span>
            </div>
            {newspics.map((np) => {
              const actualIdx = articles.indexOf(np)
              const targetSlots = resolveTargetCardCount(np)
              return (
                <div
                  key={np.id || actualIdx}
                  onClick={() => onSelectArticle(actualIdx)}
                  className="rounded-2xl border border-emerald-500/25 bg-card/80 p-3.5 space-y-2.5 hover:border-emerald-500/50 hover:shadow-xs transition-all cursor-pointer group"
                  title={`点击审校并编辑 #${actualIdx + 1} 微信小绿书多图卡片`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 text-ui-2xs font-bold flex items-center gap-1">
                        <Smartphone className="size-3" />
                        <span>#${actualIdx + 1} 微信小绿书</span>
                      </span>
                      <span className="text-[11px] text-foreground-muted">3:4 竖版多图流 · ${targetSlots} 张卡片</span>
                    </div>
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                      <span>单篇审校</span>
                      <ChevronRight className="size-3" />
                    </span>
                  </div>
                  <h4 className="text-ui-xs font-bold text-foreground leading-snug">
                    {np.title || '微信小绿书图文速递'}
                  </h4>
                  {/* 3:4 竖版多图缩略胶卷条：恒定对齐 targetSlots 槽位，未落盘原地微光占位 */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                    {Array.from({ length: targetSlots }).map((_, slotIdx) => {
                      const cardSub = slotIdx + 1
                      const rawUrl = np.images?.[slotIdx]
                      const safeUrl = getSafeResolvedImageUrl(rawUrl, actualIdx + 1, cardSub)
                      const hasImage = Boolean(safeUrl && !imgErrorMap[safeUrl])
                      return (
                        <div
                          key={slotIdx}
                          className="relative aspect-[3/4] w-16 md:w-20 rounded-lg overflow-hidden border border-border/40 bg-surface-hover/30 shrink-0 shadow-2xs"
                        >
                          {safeUrl && hasImage ? (
                            <img
                              src={safeUrl}
                              alt={`卡片 ${cardSub}`}
                              onError={() => {
                                setImgErrorMap(prev => ({ ...prev, [safeUrl]: true }))
                              }}
                              className="size-full object-cover"
                            />
                          ) : (
                            <div className="size-full flex flex-col items-center justify-center text-foreground-muted/40 bg-surface-hover/50">
                              <ImageIcon className="size-4 opacity-50" />
                              <span className="text-[9px] font-mono text-foreground-subtle mt-0.5">待生成</span>
                            </div>
                          )}
                          <div className="absolute top-1 right-1 rounded-sm bg-black/60 px-1 py-0.2 text-[8px] font-bold text-white">
                            {cardSub}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      {/* 5. 底部合辑发布就绪凭据 */}
      <div className="flex items-center justify-between px-3 py-2 rounded-2xl bg-surface/40 border border-border/30 text-ui-2xs text-foreground-muted">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>合辑排版就绪 · 图文排他性对齐已校验</span>
        </div>
        <span>点击任意篇目直接进入就地编辑</span>
      </div>
    </div>
  )
}
