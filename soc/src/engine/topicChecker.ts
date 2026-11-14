// 原生纯 TypeScript 选题查重引擎（Zero-Dependency Topic Checker）
// 彻底摆脱对外部 Python difflib 与 check_topics.py 的依赖
import fs from 'node:fs'
import path from 'node:path'

export interface TopicCheckMatch {
  title: string
  source: string
  score: number
  kind: string
}

export interface TopicCheckItem {
  topic: string
  risk: 'low' | 'medium' | 'high'
  risk_level?: 'low' | 'medium' | 'high'
  top_score: number
  similarity?: number
  matches: TopicCheckMatch[]
  syntax_pattern?: string
  warning?: string
  reasons?: string[]
  most_similar_to?: string
  source?: string
  batch_duplicate?: boolean
  cross_account_identical?: boolean
  prefix_violation?: boolean
}

export interface TopicCheckReport {
  history_count: number
  cross_history_count: number
  items: TopicCheckItem[]
  checked?: TopicCheckItem[]
  max_risk?: 'low' | 'medium' | 'high'
}

export interface TopicCheckerOptions {
  topics: string[]
  scriptsDir: string
  forbidden?: string[]
  crossDirs?: string[]
  historyDirs?: string[]
  thresholdHigh?: number
  thresholdMedium?: number
}

/**
 * 纯 TypeScript 实现 SequenceMatcher.ratio() 算法
 * 计算两个字符串的相似度比率 (0.0 ~ 1.0)
 * 算法公式: 2.0 * M / (len(s1) + len(s2))
 */
export function calculateSequenceSimilarity(s1: string, s2: string): number {
  if (!s1 && !s2) return 1.0
  if (!s1 || !s2) return 0.0
  if (s1 === s2) return 1.0

  const n = s1.length
  const m = s2.length
  const dp: number[] = new Array(m + 1).fill(0)

  for (let i = 1; i <= n; i++) {
    let prev = 0
    for (let j = 1; j <= m; j++) {
      const temp = dp[j]
      if (s1[i - 1] === s2[j - 1]) {
        dp[j] = prev + 1
      } else {
        dp[j] = Math.max(dp[j], dp[j - 1])
      }
      prev = temp
    }
  }

  const lcsLength = dp[m]
  return Number(((2.0 * lcsLength) / (n + m)).toFixed(2))
}

/** 规范化标题文本，移除空白与标点符号 */
export function normalizeTitle(title: string): string {
  return title.replace(/[\s，。、：；！？!?:;,.\-—（）()【】\[\]"'“”‘’《》〈〉·`~_+=|\\/]/g, '').toLowerCase()
}

/** 从目录中提取历史文章标题 */
export function extractHistoryTitlesFromDir(dirPath: string, tag: string): Array<{ title: string; source: string }> {
  const results: Array<{ title: string; source: string }> = []
  if (!dirPath || !fs.existsSync(dirPath)) {
    return results
  }

  // 1. 读取 publish_history.json
  const phPath = path.join(dirPath, 'publish_history.json')
  if (fs.existsSync(phPath)) {
    try {
      const content = fs.readFileSync(phPath, 'utf-8')
      const records = JSON.parse(content)
      if (Array.isArray(records)) {
        for (const rec of records) {
          const articles = Array.isArray(rec.articles) ? rec.articles : []
          for (const t of articles) {
            if (typeof t === 'string' && t.trim()) {
              results.push({ title: t.trim(), source: `${tag}:publish_history.json` })
            }
          }
        }
      }
    } catch {
      // 容错忽略
    }
  }

  // 2. 读取 publish_result.json
  const prPath = path.join(dirPath, 'publish_result.json')
  if (fs.existsSync(prPath)) {
    try {
      const content = fs.readFileSync(prPath, 'utf-8')
      const d = JSON.parse(content)
      const articles = Array.isArray(d.articles) ? d.articles : []
      for (const t of articles) {
        if (typeof t === 'string' && t.trim()) {
          results.push({ title: t.trim(), source: `${tag}:publish_result.json` })
        }
      }
    } catch {
      // 容错忽略
    }
  }

  // 3. 读取 wechat_scheduled_tasks.json
  for (const candDir of [dirPath, path.dirname(dirPath), path.dirname(path.dirname(dirPath))]) {
    if (!candDir || !fs.existsSync(candDir)) continue
    const stPath = path.join(candDir, 'wechat_scheduled_tasks.json')
    if (fs.existsSync(stPath)) {
      try {
        const content = fs.readFileSync(stPath, 'utf-8')
        const tasks = JSON.parse(content)
        if (Array.isArray(tasks)) {
          for (const task of tasks) {
            const topic = task.topic || task.title
            if (typeof topic === 'string' && topic.trim()) {
              results.push({ title: topic.trim(), source: `${tag}:wechat_scheduled_tasks.json` })
            }
          }
        }
      } catch {
        // 容错忽略
      }
    }
  }

  return results
}

/**
 * 原生执行选题查重比对
 */
export function checkTopicsNative(opts: TopicCheckerOptions): TopicCheckReport {
  const {
    topics,
    scriptsDir,
    forbidden = [],
    crossDirs = [],
    historyDirs = [],
    thresholdHigh = 0.55,
    thresholdMedium = 0.40,
  } = opts

  // 收集本账号严格历史
  const strictHistory: Array<{ title: string; source: string }> = []
  strictHistory.push(...extractHistoryTitlesFromDir(scriptsDir, 'local'))
  for (const hDir of historyDirs) {
    strictHistory.push(...extractHistoryTitlesFromDir(hDir, 'history'))
  }

  // 收集跨账号宽松历史
  const crossHistory: Array<{ title: string; source: string }> = []
  for (const cDir of crossDirs) {
    crossHistory.push(...extractHistoryTitlesFromDir(cDir, 'cross'))
  }

  const items: TopicCheckItem[] = []
  let overallMaxRisk: 'low' | 'medium' | 'high' = 'low'

  for (let idx = 0; idx < topics.length; idx++) {
    const rawTopic = String(topics[idx] || '').trim()
    const normTopic = normalizeTitle(rawTopic)
    const reasons: string[] = []
    const matches: TopicCheckMatch[] = []
    let riskLevel: 'low' | 'medium' | 'high' = 'low'
    let prefixViolation = false
    let crossIdentical = false

    // 1. 违禁词检测
    for (const fb of forbidden) {
      if (fb && rawTopic.includes(fb)) {
        riskLevel = 'high'
        reasons.push(`包含违禁词: "${fb}"`)
      }
    }

    // 2. 冒号前缀铁律守卫
    const prefixMatch = rawTopic.match(/^(\s*[\[【(（].+?[\]】)）]\s*|[^\s：:]{2,12}[：:])\s*/)
    if (prefixMatch) {
      prefixViolation = true
      riskLevel = 'high'
      reasons.push(`违规包含冒号/标签前缀: "${prefixMatch[0]}"`)
    }

    // 3. 本账号严格比对
    for (const h of strictHistory) {
      const normH = normalizeTitle(h.title)
      if (!normH) continue
      const sim = calculateSequenceSimilarity(normTopic, normH)
      if (sim >= 0.35) {
        matches.push({
          title: h.title,
          source: h.source,
          score: sim,
          kind: sim >= 0.55 ? 'similar' : 'keyword-overlap',
        })
      }
    }

    // 4. 跨账号比对
    for (const c of crossHistory) {
      const normC = normalizeTitle(c.title)
      if (normTopic === normC) {
        crossIdentical = true
        matches.push({
          title: c.title,
          source: c.source,
          score: 1.0,
          kind: 'cross-account-identical',
        })
        reasons.push(`与其它账号已发布标题完全一致 (100%): "${c.title}"`)
        break
      }
    }

    matches.sort((a, b) => b.score - a.score)
    const topScore = matches.length > 0 ? matches[0].score : 0.0

    if (topScore >= thresholdHigh || prefixViolation || crossIdentical) {
      riskLevel = 'high'
    } else if (topScore >= thresholdMedium) {
      if (riskLevel !== 'high') riskLevel = 'medium'
    }

    if (riskLevel === 'high') {
      overallMaxRisk = 'high'
    } else if (riskLevel === 'medium' && overallMaxRisk !== 'high') {
      overallMaxRisk = 'medium'
    }

    const warnings: string[] = [...reasons]
    if (topScore >= thresholdHigh && matches.length > 0) {
      warnings.push(`与历史标题高度相似 (${Math.round(topScore * 100)}%): "${matches[0].title}"`)
    }

    items.push({
      topic: rawTopic,
      risk: riskLevel,
      risk_level: riskLevel,
      top_score: topScore,
      similarity: topScore,
      matches: matches.slice(0, 2),
      syntax_pattern: '常规陈述式',
      warning: warnings.length > 0 ? warnings.join('；') : undefined,
      reasons: warnings,
      most_similar_to: matches[0]?.title,
      source: matches[0]?.source,
      cross_account_identical: crossIdentical,
      prefix_violation: prefixViolation,
    })
  }

  return {
    history_count: strictHistory.length,
    cross_history_count: crossHistory.length,
    items,
    checked: items,
    max_risk: overallMaxRisk,
  }
}
