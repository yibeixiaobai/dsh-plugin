import type http from 'node:http'
import type { Config } from './config.ts'
import { readBodyText, sendJson } from './http-helpers.ts'
import { loadWechatScheduledTasks } from './schedule-manager.ts'
import {
  syncWechatScheduledTasks,
  syncWechatDrafts,
  cancelWechatScheduledTaskByBrowser,
} from './wechat-browser.ts'
import {
  loadWechatDrafts,
  saveWechatDrafts,
  scanDuplicateDrafts,
  deleteWechatDraft,
  batchDeleteWechatDrafts,
  sweepPlaceholderTemplateDrafts,
} from './draft-manager.ts'

export const SCHEDULE_JOBS_ROUTE = '/api/gzh-publisher/schedule/jobs'
export const TASKS_LIST_ROUTE = '/api/gzh-publisher/tasks/list'
export const TASKS_SYNC_ROUTE = '/api/gzh-publisher/tasks/sync'
export const TASKS_CANCEL_ROUTE = '/api/gzh-publisher/tasks/cancel'
export const DRAFTS_LIST_ROUTE = '/api/gzh-publisher/drafts/list'
export const DRAFTS_SYNC_ROUTE = '/api/gzh-publisher/drafts/sync'
export const DRAFTS_DELETE_ROUTE = '/api/gzh-publisher/drafts/delete'
export const DRAFTS_DUPLICATES_SCAN_ROUTE = '/api/gzh-publisher/drafts/duplicates/scan'
export const DRAFTS_DUPLICATES_CLEAN_ROUTE = '/api/gzh-publisher/drafts/duplicates/clean'

/**
 * 处理微信公众号草稿与定时发布任务相关路由
 */
export async function handleDraftsAndTasksRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  parsedUrl: URL,
  getConfig: () => Config,
): Promise<boolean> {
  if (pathname === SCHEDULE_JOBS_ROUTE || pathname === TASKS_LIST_ROUTE) {
    const account =
      parsedUrl.searchParams.get('account_id') ||
      parsedUrl.searchParams.get('account') ||
      undefined
    const statusFilter = parsedUrl.searchParams.get('status') || undefined
    const allTasks = loadWechatScheduledTasks(getConfig(), account)
    const filtered = statusFilter
      ? allTasks.filter((t: any) => t.status === statusFilter)
      : allTasks
    sendJson(res, 200, { ok: true, jobs: filtered, count: filtered.length })
    return true
  }

  if (pathname === TASKS_SYNC_ROUTE && req.method === 'POST') {
    const text = await readBodyText(req).catch(() => '')
    let body: any = {}
    try {
      body = text ? JSON.parse(text) : {}
    } catch {}
    const accountId = body?.account_id || getConfig().default_account || 'default'
    const syncRes = await syncWechatScheduledTasks(getConfig(), accountId)
    sendJson(res, 200, syncRes)
    return true
  }

  if (pathname === TASKS_CANCEL_ROUTE && req.method === 'POST') {
    const text = await readBodyText(req).catch(() => '')
    let body: any = {}
    try {
      body = text ? JSON.parse(text) : {}
    } catch {}
    const accountId = body?.account_id || getConfig().default_account || 'default'
    const taskId = String(body?.task_id || body?.id || '').trim()
    const title = body?.title ? String(body.title).trim() : undefined
    const displayTime = body?.display_time ? String(body.display_time).trim() : undefined

    if (!taskId && !title && !displayTime) {
      sendJson(res, 400, {
        ok: false,
        error: '缺少必须的 task_id、title 或 display_time 参数',
      })
      return true
    }

    const cancelRes = await cancelWechatScheduledTaskByBrowser(
      getConfig(),
      accountId,
      taskId,
      title,
      displayTime,
    )
    sendJson(res, cancelRes.ok ? 200 : 400, cancelRes)
    return true
  }

  if (pathname === DRAFTS_LIST_ROUTE) {
    const account =
      parsedUrl.searchParams.get('account_id') ||
      parsedUrl.searchParams.get('account') ||
      undefined
    const typeFilter = parsedUrl.searchParams.get('type') || undefined
    const keyword = (parsedUrl.searchParams.get('keyword') || '').trim().toLowerCase()
    const allDrafts = loadWechatDrafts(getConfig(), account)

    // 中文注释：若指定有效账号，后台静默调度模板废稿清道夫，彻底拔除微信后台可能存在的历史 SP-TEMPLATE
    if (account && account !== 'all') {
      sweepPlaceholderTemplateDrafts(getConfig(), account).catch(() => {})
    }

    let filtered = allDrafts
    if (typeFilter && typeFilter !== 'all') {
      filtered = filtered.filter(d => d.article_type === typeFilter)
    }
    if (keyword) {
      filtered = filtered.filter((d) => {
        const hasInArticle = d.articles.some(a =>
          a.title.toLowerCase().includes(keyword),
        )
        return hasInArticle || (d as any).title?.toLowerCase()?.includes(keyword)
      })
    }

    const articleCount = allDrafts.filter(d => d.article_type === 'news').length
    const newspicCount = allDrafts.filter(d => d.article_type === 'newspic').length

    sendJson(res, 200, {
      ok: true,
      drafts: filtered,
      count: filtered.length,
      summary: {
        article_count: articleCount,
        newspic_count: newspicCount,
        total_count: allDrafts.length,
      },
    })
    return true
  }

  if (pathname === DRAFTS_SYNC_ROUTE && req.method === 'POST') {
    const text = await readBodyText(req).catch(() => '')
    let body: any = {}
    try {
      body = text ? JSON.parse(text) : {}
    } catch {}
    const accountId = body?.account_id || getConfig().default_account || 'default'
    const syncRes = await syncWechatDrafts(getConfig(), accountId)
    if (syncRes.ok && syncRes.drafts) {
      saveWechatDrafts(getConfig(), accountId, syncRes.drafts)
    }
    sendJson(res, 200, syncRes)
    return true
  }

  if (pathname === DRAFTS_DELETE_ROUTE && req.method === 'POST') {
    const text = await readBodyText(req).catch(() => '')
    let body: any = {}
    try {
      body = text ? JSON.parse(text) : {}
    } catch {}
    const accountId = body?.account_id || getConfig().default_account || 'default'
    const appmsgid = String(body?.appmsgid || body?.id || '').trim()
    const articleType = body?.article_type === 'newspic' ? 'newspic' : 'news'
    if (!appmsgid) {
      sendJson(res, 400, { ok: false, error: '缺少必须的 appmsgid 参数' })
      return true
    }
    const delRes = await deleteWechatDraft(getConfig(), accountId, appmsgid, articleType)
    sendJson(res, 200, delRes)
    return true
  }

  if (pathname === DRAFTS_DUPLICATES_SCAN_ROUTE && req.method === 'POST') {
    const text = await readBodyText(req).catch(() => '')
    let body: any = {}
    try {
      body = text ? JSON.parse(text) : {}
    } catch {}
    const accountId = body?.account_id || getConfig().default_account || 'default'
    const strategy = body?.strategy || 'keep_latest'
    const scanRes = scanDuplicateDrafts(getConfig(), accountId, strategy)
    sendJson(res, 200, { ok: true, ...scanRes })
    return true
  }

  if (pathname === DRAFTS_DUPLICATES_CLEAN_ROUTE && req.method === 'POST') {
    const text = await readBodyText(req).catch(() => '')
    let body: any = {}
    try {
      body = text ? JSON.parse(text) : {}
    } catch {}
    const accountId = body?.account_id || getConfig().default_account || 'default'
    const appmsgids = Array.isArray(body?.appmsgids) ? body.appmsgids : []
    if (appmsgids.length === 0) {
      sendJson(res, 400, { ok: false, error: '请提供需要清理的 appmsgids 列表' })
      return true
    }
    const cleanRes = await batchDeleteWechatDrafts(getConfig(), accountId, appmsgids)
    sendJson(res, 200, cleanRes)
    return true
  }

  return false
}
