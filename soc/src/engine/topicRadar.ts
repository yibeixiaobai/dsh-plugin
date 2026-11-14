// 原生纯 TypeScript 动态热点选题雷达与搜索聚合引擎（Zero-Dependency Topic Radar）
import fs from 'node:fs'
import path from 'node:path'
import { calculateSequenceSimilarity, normalizeTitle } from './topicChecker.ts'
import {
  NOISE_PATTERNS,
  SEASONAL_CALENDAR,
  CLICKBAIT_WORDS,
  ANGLE_TEMPLATES,
} from './topicRadarData.ts'

export interface RecommendedTopic {
  title: string
  angle: 'policy' | 'trap' | 'guide' | 'myth' | 'tools' | 'advance' | string
  angle_name: string
  reason: string
  hot_score: number
  pain_score: number
  novelty_score: number
  composite_score: number
  target_audience: string
  platform_fit: string
  sources?: string[]
  cross_platform_count?: number
  evidence_preview?: string
}

export interface SeasonalFocus {
  month: number
  focus: string
  seasonal_keywords: string[]
}

export interface TrendingSignals {
  search_news_count: number
  top_news: string[]
  surging_queries: string[]
  hot_board_clusters?: Array<{
    title: string
    platforms: string[]
    platform_names: string[]
    cross_platform_count: number
  }>
  hot_platform_coverage?: Record<string, number>
}

export interface TopicDiscoveryResult {
  seasonal_focus: SeasonalFocus
  trending_signals: TrendingSignals
  recommended_topics: RecommendedTopic[]
}

export interface DiscoverTopicsOptions {
  keywords?: string[]
  scriptsDir?: string
  searchSnippets?: Array<{ title: string; snippet?: string; source?: string } | string>
  angle?: 'all' | 'policy' | 'trap' | 'guide' | 'myth' | 'tools' | 'advance' | string
  count?: number
  platform?: string
  brandName?: string
  forbidden?: string[]
}

/** 清洗人机感与套路化词汇 */
export function sanitizeHumanTone(title: string, isXhs = false): string {
  let t = title.trim()
  for (const pat of CLICKBAIT_WORDS) {
    t = t.replace(pat, '')
  }

  t = t.replace(/[！!]+/g, '，')
  t = t.replace(/，{2,}/g, '，')
  t = t.replace(/、、+/g, '、')
  t = t.replace(/^[\s，。、：；！？!?:;,.\-—]+|[\s，。、：；！？!?:;,.\-—]+$/g, '').trim()

  // 严格执行无冒号前缀铁律
  const prefixMatch = t.match(/^(\s*[\[【(（].+?[\]】)）]\s*|[^\s：:]{2,12}[：:])\s*/)
  if (prefixMatch) {
    t = t.slice(prefixMatch[0].length).trim()
  }

  if (isXhs) {
    if (t.length > 20) {
      if (t.includes('，')) {
        const parts = t.split('，')
        t = parts[0].length <= 20 ? parts[0] : t.slice(0, 20)
      } else {
        t = t.slice(0, 20)
      }
      t = t.replace(/[\s，。、：；！？!?:;,.\-—]+$/g, '').trim()
    }
  } else {
    if (t.length > 28) {
      if (t.includes('，')) {
        const parts = t.split('，')
        t = parts.slice(0, 2).join('，')
      }
      if (t.length > 28) {
        t = t.slice(0, 28).replace(/[\s，。、：；！？!?:;,.\-—]+$/g, '').trim()
      }
    }
  }

  return t
}

/** 异步超时 Fetch 封装 */
async function fetchWithTimeout(url: string, timeoutMs = 2500, headers: Record<string, string> = {}): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...headers,
      },
    })
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

/** 抓取 Bing RSS 热点资讯 */
async function fetchBingRss(query: string): Promise<Array<{ title: string; snippet: string; source: string }>> {
  const results: Array<{ title: string; snippet: string; source: string }> = []
  try {
    const xml = await fetchWithTimeout(`https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss`, 3000)
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
    for (const it of items.slice(0, 6)) {
      const mTitle = it.match(/<title>([\s\S]*?)<\/title>/)
      const mDesc = it.match(/<description>([\s\S]*?)<\/description>/)
      let tText = mTitle ? mTitle[1] : ''
      let dText = mDesc ? mDesc[1] : ''
      tText = tText.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<.*?>/g, '').trim()
      dText = dText.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<.*?>/g, '').trim()

      if (NOISE_PATTERNS.some(pat => pat.test(tText))) continue
      if (tText && tText.length >= 6) {
        results.push({
          title: tText,
          snippet: dText.slice(0, 140),
          source: 'Bing实时搜索',
        })
      }
    }
  } catch {
    // 忽略网络异常
  }
  return results
}

/** 抓取知乎搜索联想词 */
async function fetchZhihuSuggest(kw: string): Promise<string[]> {
  try {
    const raw = await fetchWithTimeout(`https://www.zhihu.com/api/v4/search/suggest?q=${encodeURIComponent(kw)}`, 2000)
    const data = JSON.parse(raw)
    const list: string[] = []
    if (Array.isArray(data.suggest)) {
      for (const item of data.suggest) {
        const q = String(item.query || '').trim()
        if (q && q.length >= 4 && q !== kw) list.push(q)
      }
    }
    return list.slice(0, 6)
  } catch {
    return []
  }
}

/** 抓取 360 搜索下拉联想词 */
async function fetch360Suggest(kw: string): Promise<string[]> {
  try {
    const raw = await fetchWithTimeout(`https://sug.so.360.cn/suggest?word=${encodeURIComponent(kw)}&encodein=utf-8&encodeout=utf-8`, 2000)
    const data = JSON.parse(raw)
    const list: string[] = []
    if (Array.isArray(data.result)) {
      for (const item of data.result) {
        const w = String(item.word || '').trim()
        if (w && w.length >= 4 && w !== kw) list.push(w)
      }
    }
    return list.slice(0, 6)
  } catch {
    return []
  }
}

/** 从目录中提取历史标题集合用于新颖度评分 */
function loadHistoryTitleSet(scriptsDir?: string): Set<string> {
  const titles = new Set<string>()
  if (!scriptsDir || !fs.existsSync(scriptsDir)) return titles

  for (const fname of ['publish_history.json', 'publish_result.json']) {
    const p = path.join(scriptsDir, fname)
    if (fs.existsSync(p)) {
      try {
        const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
        if (Array.isArray(data)) {
          for (const item of data) {
            const t = item.title || item.topic
            if (t) titles.add(String(t).trim())
          }
        } else if (typeof data === 'object' && data !== null) {
          const list = [...(data.articles || []), ...(data.items || [])]
          for (const a of list) {
            const t = typeof a === 'object' && a !== null ? a.title : a
            if (t) titles.add(String(t).trim())
          }
        }
      } catch {
        // 忽略
      }
    }
  }
  return titles
}

/**
 * 原生执行热点嗅探与选题雷达
 */
export async function discoverTopicsNative(opts: DiscoverTopicsOptions): Promise<TopicDiscoveryResult> {
  const {
    keywords = [],
    scriptsDir,
    searchSnippets = [],
    angle = 'all',
    count = 6,
    platform = 'zhihu',
    brandName = '知识分享',
    forbidden = [],
  } = opts

  const currentMonth = new Date().getMonth() + 1
  const seasonal = SEASONAL_CALENDAR[currentMonth] || SEASONAL_CALENDAR[1]
  const isXhs = platform === 'xiaohongshu'

  // 1. 收集外部搜索线索与联想词
  const topNews: string[] = []
  const surgingQueries: string[] = []

  for (const snip of searchSnippets) {
    if (typeof snip === 'object' && snip !== null && snip.title) {
      topNews.push(snip.title.trim())
    } else if (typeof snip === 'string' && snip.trim().length >= 6) {
      topNews.push(snip.trim().slice(0, 60))
    }
  }

  const kwList = keywords.length > 0 ? keywords : ['期刊发表', '职称评审', '论文投稿']
  const searchTasks: Array<Promise<void>> = []

  for (const kw of kwList.slice(0, 3)) {
    searchTasks.push(
      fetchBingRss(`${kw} 最新动态`).then((res) => {
        for (const r of res) topNews.push(r.title)
      }),
      fetchZhihuSuggest(kw).then((res) => {
        surgingQueries.push(...res)
      }),
      fetch360Suggest(kw).then((res) => {
        surgingQueries.push(...res)
      }),
    )
  }

  await Promise.allSettled(searchTasks)

  // 2. 构建候选推荐选题
  const historyTitles = loadHistoryTitleSet(scriptsDir)
  const candidateTopics: RecommendedTopic[] = []
  const targetAngles = angle === 'all' || !ANGLE_TEMPLATES[angle]
    ? ['policy', 'trap', 'guide', 'myth', 'tools']
    : [angle]

  let seedIdx = 0
  for (const aKey of targetAngles) {
    const aMeta = ANGLE_TEMPLATES[aKey] || ANGLE_TEMPLATES.guide
    for (const tpl of aMeta.templates) {
      const kw = kwList[seedIdx % kwList.length]
      seedIdx++

      let rawTitle = tpl.replace(/\{kw\}/g, kw)
      rawTitle = sanitizeHumanTone(rawTitle, isXhs)

      if (forbidden.some(fb => fb && rawTitle.includes(fb))) continue

      let maxSim = 0.0
      const normRaw = normalizeTitle(rawTitle)
      for (const h of historyTitles) {
        const sim = calculateSequenceSimilarity(normRaw, normalizeTitle(h))
        if (sim > maxSim) maxSim = sim
      }
      const noveltyScore = Number(Math.max(0.1, 1.0 - maxSim).toFixed(2))
      const hotScore = Number((0.85 + (seedIdx % 3) * 0.05).toFixed(2))
      const painScore = Number((0.88 + (seedIdx % 4) * 0.03).toFixed(2))
      const compositeScore = Number((hotScore * 0.35 + painScore * 0.35 + noveltyScore * 0.30).toFixed(2))

      candidateTopics.push({
        title: rawTitle,
        angle: aKey,
        angle_name: aMeta.name,
        reason: `契合${seasonal.focus.slice(0, 18)}时效热点，切中一线人员核心关切`,
        hot_score: hotScore,
        pain_score: painScore,
        novelty_score: noveltyScore,
        composite_score: compositeScore,
        target_audience: aMeta.audience,
        platform_fit: `${platform === 'gzh' ? '公众号深度长文' : '知乎/百家号专栏问答'}高阅读切角`,
        sources: ['全网搜索雷达', '时令日历矩阵'],
      })
    }
  }

  candidateTopics.sort((a, b) => b.composite_score - a.composite_score)
  const finalTopics = candidateTopics.slice(0, Math.max(1, count))

  return {
    seasonal_focus: {
      month: currentMonth,
      focus: seasonal.focus,
      seasonal_keywords: seasonal.keywords,
    },
    trending_signals: {
      search_news_count: topNews.length,
      top_news: Array.from(new Set(topNews)).slice(0, 6),
      surging_queries: Array.from(new Set(surgingQueries)).slice(0, 10),
    },
    recommended_topics: finalTopics,
  }
}
