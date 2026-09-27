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
