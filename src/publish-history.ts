import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { Config } from './config.ts'
import { resolveAccount } from './config-runtime.ts'
import { accountScriptsDir, configuredAccountIds, HISTORY_FILE, RESULT_FILE, writeTextFile } from './tools/shared.ts'

export const PUBLISH_HISTORY_ROUTE = '/api/gzh-publisher/publish-history'

export interface PublishArticleDetail {
  index: number
  title: string
  digest?: string
  url?: string
  draft_id?: string
  published?: boolean
  /** 小红书三态结果：published / unconfirmed / failed（其它平台可省略） */
  status?: 'published' | 'unconfirmed' | 'failed'
}

export interface PublishBatchRecord {
  id: string
  account_id: string
  account_name?: string
  platform: 'gzh' | 'zhihu' | 'xiaohongshu'
  publish_mode?: 'api' | 'browser'
  article_type?: 'news' | 'newspic' | 'both'
  article_count: number
  author: string
  timestamp: string
  draft_media_id?: string
  draft_media_ids?: string[]
  articles: string[]
  digests?: string[]
  /** 批次状态：unconfirmed 表示已提交但未在稿件管理确认（勿当作失败） */
  status?: 'success' | 'unconfirmed' | 'failed'
  items: PublishArticleDetail[]
}

export interface PublishHistoryResponse {
  ok: boolean
  total_batches: number
  total_articles: number
  gzh_articles: number
  zhihu_articles: number
  records: PublishBatchRecord[]
}

import { handleCors, sendJson, isAllowedOrigin } from './http-helpers.ts'

function sameOrigin(req: IncomingMessage): boolean {
  return isAllowedOrigin(req.headers.origin, req.headers.host)
}

function parseHistoryFile(filePath: string): PublishBatchRecord[] {
  if (!fs.existsSync(filePath)) return []
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return Array.isArray(raw) ? (raw as PublishBatchRecord[]) : []
  } catch {
    return []
  }
}

/** 规范化单条批次记录里的每篇文章列表 items */
export function normalizeBatchItems(record: Partial<PublishBatchRecord>): PublishArticleDetail[] {
  if (Array.isArray(record.items) && record.items.length > 0) {
    return record.items
  }
  const titles = Array.isArray(record.articles) ? record.articles : []
  const digests = Array.isArray(record.digests) ? record.digests : []
  const rawDrafts = Array.isArray((record as Record<string, unknown>).drafts)
    ? ((record as Record<string, unknown>).drafts as Array<Record<string, unknown>>)
    : []
  const mediaIds = Array.isArray((record as Record<string, unknown>).draft_media_ids)
    ? ((record as Record<string, unknown>).draft_media_ids as string[])
    : []
  return titles.map((title, idx) => ({
    index: idx + 1,
    title,
    digest: digests[idx] || '',
    draft_id: record.platform === 'zhihu'
      ? (rawDrafts[idx]?.draft_id ? String(rawDrafts[idx].draft_id) : undefined)
      : (mediaIds[idx] || record.draft_media_id),
    url: record.platform === 'zhihu' ? (rawDrafts[idx]?.url ? String(rawDrafts[idx].url) : undefined) : undefined,
    published: record.platform === 'zhihu' ? (rawDrafts[idx]?.published !== undefined ? Boolean(rawDrafts[idx].published) : undefined) : undefined,
  }))
}

/**
 * 历史数据迁移与读取：
 * 优先读取 publish_history.json；若为空但存在旧 publish_result.json，自动迁移并保存。
 */
export function readAccountPublishRecords(cfg: Config, accountId: string): PublishBatchRecord[] {
  const sdir = accountScriptsDir(cfg, accountId)
  const historyPath = path.join(sdir, HISTORY_FILE)
  let list = parseHistoryFile(historyPath)

  if (list.length === 0) {
    const legacyResultPath = path.join(sdir, RESULT_FILE)
    if (fs.existsSync(legacyResultPath)) {
      try {
        const legacy = JSON.parse(fs.readFileSync(legacyResultPath, 'utf-8'))
        if (legacy && Array.isArray(legacy.articles) && legacy.articles.length > 0) {
          const account = resolveAccount(cfg, accountId)
          const legacyItems: PublishArticleDetail[] = legacy.articles.map((title: string, i: number) => {
            const zDraft = Array.isArray(legacy.drafts) ? legacy.drafts[i] : undefined
            return {
              index: i + 1,
              title,
              digest: Array.isArray(legacy.digests) ? legacy.digests[i] : undefined,
              draft_id: zDraft?.draft_id,
              url: zDraft?.url,
              published: zDraft?.published,
            }
          })
          const batch: PublishBatchRecord = {
            id: `batch_${(legacy.timestamp || 'initial').replace(/[^0-9]/g, '').slice(0, 14) || Date.now()}`,
            account_id: accountId,
            account_name: account.profile.name || accountId,
            platform: legacy.platform === 'zhihu' ? 'zhihu' : 'gzh',
            article_type: account.profile.content?.article_type ?? 'news',
            article_count: legacy.article_count || legacy.articles.length,
            author: legacy.author || account.profile.author_name || '',
            timestamp: legacy.timestamp || new Date().toISOString().replace('T', ' ').slice(0, 19),
            draft_media_id: legacy.draft_media_id,
            articles: legacy.articles,
            digests: legacy.digests || [],
            items: legacyItems,
          }
          list = [batch]
          try {
            writeTextFile(sdir, HISTORY_FILE, JSON.stringify(list, null, 2) + '\n')
          } catch {
            // best-effort persistence
          }
        }
      } catch {
        // ignore legacy parse errors
      }
    }
  }

  const account = resolveAccount(cfg, accountId)
  return list.map((b) => ({
    ...b,
    account_name: b.account_name || account.profile.name || accountId,
    items: normalizeBatchItems(b),
  }))
}

/**
 * 发布尝试日志（publish_attempts.json）——防重闸门的权威依据。
 *
 * 【为什么必须有这份日志】
 * 旧防重闸门只读 publish_history.json，而该文件**只在发布成功路径**才写入。
 * 一旦发布「已提交但未能确认」（假阴性），就既不写 history、又没发出去的样子，
 * 于是重试时闸门查不到记录 → 放行 → 把同一篇笔记**真的再发一遍**。
 * 「判为未确认」与「重试重复发」由此互为因果，形成死锁。
 *
 * 因此：发布动作**发起前**先落盘一条 attempt（title + 时间戳），
 * 与最终成败无关。闸门只要看到近期有同标题 attempt，就绝不重发。
 */
export const ATTEMPTS_FILE = 'publish_attempts.json'

export interface PublishAttempt {
  account_id: string
  platform: 'gzh' | 'zhihu' | 'xiaohongshu'
  titles: string[]
  /** 发布动作发起前的时间戳（ms） */
  attemptedAtMs: number
  timestamp: string
  /** 事后回填：published / unconfirmed / failed */
  outcome?: 'published' | 'unconfirmed' | 'failed'
  /**
   * 已确认的笔记 ID（逐篇，与 titles 同序；空串表示该篇尚未确认）。
   * 供后续「自愈式核对」复用：即使当次核对失败，下一次运行也能在此补齐并永久去重。
   */
  note_ids?: string[]
  /** 最近一次核对尝试的时间戳（ms），用于退避，避免每次运行都重扫列表 */
  lastCheckedAtMs?: number
  /** 核对重试次数，便于观测「反复核对不上」的顽固条目 */
  reconcileAttempts?: number
}

function attemptsPath(cfg: Config, accountId: string): string {
  return path.join(accountScriptsDir(cfg, accountId), ATTEMPTS_FILE)
}

/** 读取某账号的全部发布尝试（新→旧） */
export function readPublishAttempts(cfg: Config, accountId: string): PublishAttempt[] {
  const file = attemptsPath(cfg, accountId)
  if (!fs.existsSync(file)) return []
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'))
    return Array.isArray(raw) ? (raw as PublishAttempt[]) : []
  } catch {
    return []
  }
}

/**
 * 在发布动作**发起前**记录一次尝试。best-effort：落盘失败不阻断发布，
 * 但会原样抛出，由调用方决定是否继续（默认不阻断）。
 */
export function appendPublishAttempt(
  cfg: Config,
  attempt: Omit<PublishAttempt, 'timestamp'> & { timestamp?: string },
): PublishAttempt {
  const sdir = accountScriptsDir(cfg, attempt.account_id)
  const record: PublishAttempt = {
    ...attempt,
    timestamp: attempt.timestamp
      || new Date(attempt.attemptedAtMs).toISOString().replace('T', ' ').slice(0, 19),
  }
  const existing = readPublishAttempts(cfg, attempt.account_id)
  // 只保留最近 200 条，避免无限增长
  const updated = [record, ...existing].slice(0, 200)
  writeTextFile(sdir, ATTEMPTS_FILE, JSON.stringify(updated, null, 2) + '\n')
  return record
}

/** 事后把某次尝试的结果回填（best-effort，失败静默） */
export function updateAttemptOutcome(
  cfg: Config,
  accountId: string,
  attemptedAtMs: number,
  outcome: 'published' | 'unconfirmed' | 'failed',
  noteIds?: string[],
): void {
  try {
    const list = readPublishAttempts(cfg, accountId)
    let hit = false
    for (const a of list) {
      if (a.attemptedAtMs === attemptedAtMs) {
        a.outcome = outcome
        // 逐篇记录已确认的 ID：空串代表该篇仍未确认，保留原值不清零
        if (noteIds && noteIds.length === a.titles.length) {
          const prev = a.note_ids || []
          a.note_ids = noteIds.map((id, i) => (id ? id : (prev[i] || '')))
        }
        a.lastCheckedAtMs = Date.now()
        a.reconcileAttempts = (a.reconcileAttempts || 0) + 1
        hit = true
      }
    }
    if (!hit) return
    writeTextFile(accountScriptsDir(cfg, accountId), ATTEMPTS_FILE, JSON.stringify(list, null, 2) + '\n')
  } catch {
    // best-effort：回填失败不影响发布结果
  }
}

/** 仅更新核对元数据（不改 outcome），用于「自愈式核对」回填 note_ids */
export function updateAttemptReconcile(
  cfg: Config,
  accountId: string,
  attemptedAtMs: number,
  noteIds: string[],
): void {
  try {
    const list = readPublishAttempts(cfg, accountId)
    let hit = false
    for (const a of list) {
      if (a.attemptedAtMs !== attemptedAtMs) continue
      const prev = a.note_ids || []
      a.note_ids = noteIds.map((id, i) => (id ? id : (prev[i] || '')))
      a.lastCheckedAtMs = Date.now()
      a.reconcileAttempts = (a.reconcileAttempts || 0) + 1
      // 全部确认后才升级为 published；否则保持 unconfirmed（未知），绝不谎报
      if (a.note_ids.every((id) => Boolean(id))) a.outcome = 'published'
      hit = true
    }
    if (!hit) return
    writeTextFile(accountScriptsDir(cfg, accountId), ATTEMPTS_FILE, JSON.stringify(list, null, 2) + '\n')
  } catch {
    // best-effort
  }
}

/**
 * 待核对清单：仍未取得全部 note_id 的小红书尝试（新→旧）。
 *
 * 这是「自愈式核对」的数据源：只要某篇笔记还没确认到真实 ID，每次运行都会
 * 重新进稿件管理核对一次，直到拿到 ID 或超出老化上限。这样用户无需人工核对。
 */
export function listPendingReconcile(
  cfg: Config,
  accountId: string,
  platform: PublishAttempt['platform'] = 'xiaohongshu',
  maxAgeMs = 7 * 24 * 3600 * 1000,
): PublishAttempt[] {
  const now = Date.now()
  return readPublishAttempts(cfg, accountId).filter((a) => {
    if (a.platform !== platform) return false
    if (a.outcome === 'failed') return false
    if (typeof a.attemptedAtMs !== 'number') return false
    if (now - a.attemptedAtMs > maxAgeMs) return false
    const ids = a.note_ids || []
    // 未全部确认 → 仍需核对
    return !(ids.length === a.titles.length && ids.every((id) => Boolean(id)))
  })
}

/** 追加一条发布成功的记录至 publish_history.json */
export function appendPublishRecord(
  cfg: Config,
  record: Omit<PublishBatchRecord, 'items'> & { items?: PublishArticleDetail[] },
): PublishBatchRecord {
  const sdir = accountScriptsDir(cfg, record.account_id)
  const historyPath = path.join(sdir, HISTORY_FILE)
  const existing = parseHistoryFile(historyPath)
  const account = resolveAccount(cfg, record.account_id)

  const completeRecord: PublishBatchRecord = {
    ...record,
    account_name: record.account_name || account.profile.name || record.account_id,
    items: normalizeBatchItems(record),
  }

  // 按批次 ID 去重，新批次插在最前面（时间倒序）
  const filtered = existing.filter((b) => b.id !== completeRecord.id)
  const updated = [completeRecord, ...filtered]
  writeTextFile(sdir, HISTORY_FILE, JSON.stringify(updated, null, 2) + '\n')
  return completeRecord
}

/** 获取全部或指定账号的发表记录与汇总统计 */
export function getPublishHistory(cfg: Config, targetAccountId?: string): PublishHistoryResponse {
  let records: PublishBatchRecord[] = []
  if (targetAccountId && targetAccountId.trim()) {
    records = readAccountPublishRecords(cfg, targetAccountId.trim())
  } else {
    for (const accId of configuredAccountIds(cfg)) {
      const accRecords = readAccountPublishRecords(cfg, accId)
      records.push(...accRecords)
    }
  }

  // 按时间戳倒序排列
  records.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))

  let totalArticles = 0
  let gzhArticles = 0
  let zhihuArticles = 0

  for (const rec of records) {
    const count = rec.article_count || rec.articles?.length || 0
    totalArticles += count
    if (rec.platform === 'zhihu') {
      zhihuArticles += count
    } else {
      gzhArticles += count
    }
  }

  return {
    ok: true,
    total_batches: records.length,
    total_articles: totalArticles,
    gzh_articles: gzhArticles,
    zhihu_articles: zhihuArticles,
    records,
  }
}

export function handlePublishHistoryRoute(
  req: IncomingMessage,
  res: ServerResponse,
  getConfig: () => Config,
): void {
  if (handleCors(req, res)) return
  if (!sameOrigin(req)) {
    sendJson(res, 403, { error: '仅允许同源或本地请求' })
    return
  }
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: '不支持的请求方法' })
    return
  }
  try {
    const url = new URL(req.url ?? PUBLISH_HISTORY_ROUTE, `http://${req.headers.host ?? '127.0.0.1'}`)
    const accountId = url.searchParams.get('account') ?? undefined
    const result = getPublishHistory(getConfig(), accountId)
    sendJson(res, 200, result)
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}

/** 注册发表记录 HTTP 路由 */
export function registerPublishHistoryRoutes(ctx: Context, getConfig: () => Config): void {
  ctx.inject(['webServer'], (webCtx) => {
    if (!webCtx.webServer) return
    webCtx.effect(() => webCtx.webServer!.register({
      kind: 'exact',
      path: PUBLISH_HISTORY_ROUTE,
      handler: (req, res) => handlePublishHistoryRoute(req, res, getConfig),
    }), 'gzh-publisher: publish history route')
  })
}
