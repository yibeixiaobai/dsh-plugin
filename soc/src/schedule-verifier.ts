import * as cheerio from 'cheerio'
import type { Config } from './config.ts'
import { normalizeArticleTitle } from './title-normalizer.ts'
import {
  type WechatScheduledArticle,
  type WechatScheduledTask,
  saveWechatScheduledTasks,
  loadWechatScheduledTasks,
} from './schedule-storage.ts'

/**
 * 将公众号后台展示的时间文案（如 "明天 09:00"、"星期六 09:00"、"10月11日 09:00"）精确解析为时间戳与 ISO
 */
export function parseWechatDisplayTimeToTimestamp(
  displayTime: string,
  baseDate = new Date(),
): { iso: string; timestamp: number } {
  const trimmed = displayTime.trim()
  const now = new Date(baseDate)

  // 1. "今天 HH:mm"
  const todayMatch = trimmed.match(/^今天\s*(\d{1,2}):(\d{2})$/)
  if (todayMatch) {
    const d = new Date(now)
    d.setHours(parseInt(todayMatch[1], 10), parseInt(todayMatch[2], 10), 0, 0)
    return { iso: d.toISOString(), timestamp: d.getTime() }
  }

  // 2. "明天 HH:mm"
  const tomorrowMatch = trimmed.match(/^明天\s*(\d{1,2}):(\d{2})$/)
  if (tomorrowMatch) {
    const d = new Date(now)
    d.setDate(d.getDate() + 1)
    d.setHours(parseInt(tomorrowMatch[1], 10), parseInt(tomorrowMatch[2], 10), 0, 0)
    return { iso: d.toISOString(), timestamp: d.getTime() }
  }

  // 3. "后天 HH:mm"
  const dayAfterTomorrowMatch = trimmed.match(/^后天\s*(\d{1,2}):(\d{2})$/)
  if (dayAfterTomorrowMatch) {
    const d = new Date(now)
    d.setDate(d.getDate() + 2)
    d.setHours(
      parseInt(dayAfterTomorrowMatch[1], 10),
      parseInt(dayAfterTomorrowMatch[2], 10),
      0,
      0,
    )
    return { iso: d.toISOString(), timestamp: d.getTime() }
  }

  // 4. "星期六 09:00" 或 "周六 09:00"
  const weekdayMatch = trimmed.match(/^(?:星期|周)([一二三四五六天日])\s*(\d{1,2}):(\d{2})$/)
  if (weekdayMatch) {
    const dayMap: Record<string, number> = {
      日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6,
    }
    const targetWeekday = dayMap[weekdayMatch[1]] ?? 0
    const currentWeekday = now.getDay()
    let diff = (targetWeekday - currentWeekday + 7) % 7
    if (diff === 0) diff = 7
    const d = new Date(now)
    d.setDate(d.getDate() + diff)
    d.setHours(parseInt(weekdayMatch[2], 10), parseInt(weekdayMatch[3], 10), 0, 0)
    return { iso: d.toISOString(), timestamp: d.getTime() }
  }

  // 5. "10月11日 09:00" 或 "10-11 09:00"
  const mdMatch =
    trimmed.match(/^(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})$/) ||
    trimmed.match(/^(\d{1,2})-(\d{1,2})\s*(\d{1,2}):(\d{2})$/)
  if (mdMatch) {
    const month = parseInt(mdMatch[1], 10) - 1
    const day = parseInt(mdMatch[2], 10)
    const hour = parseInt(mdMatch[3], 10)
    const min = parseInt(mdMatch[4], 10)
    const d = new Date(now)
    d.setMonth(month, day)
    d.setHours(hour, min, 0, 0)
    if (d.getTime() < now.getTime() - 30 * 86400 * 1000) {
      d.setFullYear(d.getFullYear() + 1)
    }
    return { iso: d.toISOString(), timestamp: d.getTime() }
  }

  // 6. 年月日 "2026-10-12 09:00"
  const ymdMatch = trimmed.match(
    /^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})[日]?\s*(\d{1,2}):(\d{2})$/,
  )
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10)
    const month = parseInt(ymdMatch[2], 10) - 1
    const day = parseInt(ymdMatch[3], 10)
    const hour = parseInt(ymdMatch[4], 10)
    const min = parseInt(ymdMatch[5], 10)
    const d = new Date(year, month, day, hour, min, 0, 0)
    return { iso: d.toISOString(), timestamp: d.getTime() }
  }

  // 7. 绝对时间字符串
  const parsed = new Date(trimmed)
  if (!isNaN(parsed.getTime())) {
    return { iso: parsed.toISOString(), timestamp: parsed.getTime() }
  }

  const fallback = new Date(now.getTime() + 3600 * 1000)
  return { iso: fallback.toISOString(), timestamp: fallback.getTime() }
}

/**
 * 从元素样式、href 或 src 中清洗并提取封面图片 URL
 */
export function extractCoverUrlFromThumb(styleOrAttr?: string | null): string | undefined {
  if (!styleOrAttr) return undefined
  const cleaned = styleOrAttr.replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  const bgMatch = cleaned.match(/url\(\s*["']?(https?:\/\/[^"')]+)["']?\s*\)/i)
  if (bgMatch && bgMatch[1]) {
    return bgMatch[1]
  }
  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
    return cleaned
  }
  return undefined
}

/**
 * 精准解析微信公众号后台「定时发表」区域的完整 HTML 片段。
 */
export function parseWechatScheduledTasksHtml(
  html: string,
  baseDate = new Date(),
  accountId = 'default',
): WechatScheduledTask[] {
  if (!html || !html.trim()) return []
  const $ = cheerio.load(html)
  const tasks: WechatScheduledTask[] = []

  let listItems = $('#timer_send_main ul.js_send_list > li')
  if (listItems.length === 0) {
    listItems = $('ul.js_send_list > li, ul.weui-desktop-timer__list > li')
  }
  if (listItems.length === 0) {
    listItems = $('li:has(.weui-desktop-mass__content)')
  }

  listItems.each((idx, liElem) => {
    const $li = $(liElem)

    let displayTime = $li.find('.weui-desktop-mass__time').first().text().trim()
    if (!displayTime) {
      const rawText = $li.find('.weui-desktop-mass__overview').text() || $li.text()
      const tm = rawText.match(
        /(今天|明天|后天|(?:星期|周)[一二三四五六天日]|\d{1,2}月\d{1,2}日|\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?)\s*(\d{1,2}:\d{2})/,
      )
      displayTime = tm ? tm[0] : '已排期'
    }

    const statusText = $li
      .find('.weui-desktop-mass__status, .weui-desktop-mass__status_text')
      .first()
      .text()
      .trim()
    const hasNotification = statusText.includes('已开启群发通知')

    const canCancel =
      $li.find('.weui-desktop-timer__cancel_pop, .global_link_opr').length > 0 ||
      $li.text().includes('取消发表')

    const isNewspic = $li.find('.weui-desktop-mass-img').length > 0 || statusText.includes('贴图')

    const articles: WechatScheduledArticle[] = []
    let contentBlocks = $li.find('.publish_hover_content')
    if (contentBlocks.length === 0) {
      contentBlocks = $li.find('.weui-desktop-mass-media')
    }

    contentBlocks.each((_, blockElem) => {
      const $block = $(blockElem)
      const titleLink = $block.find('.weui-desktop-mass-appmsg__title')
      if (titleLink.length === 0) return

      const rawTitle = titleLink.text().replace(/\s+/g, ' ').trim()
      if (!rawTitle || rawTitle.length < 2) return

      const rawHref = titleLink.attr('href')
      const url = rawHref && !rawHref.startsWith('javascript:') ? rawHref : undefined

      const thumb = $block.find('.weui-desktop-mass-appmsg__thumb')
      const styleAttr = thumb.attr('style')
      const hrefAttr = thumb.attr('href')
      const imgAttr = $block.find('img').attr('src')
      const coverUrl =
        extractCoverUrlFromThumb(styleAttr) ||
        extractCoverUrlFromThumb(hrefAttr) ||
        extractCoverUrlFromThumb(imgAttr)

      const blockIsNewspic =
        $block.hasClass('weui-desktop-mass-img') ||
        $block.find('.weui-desktop-mass-img').length > 0 ||
        isNewspic

      articles.push({
        title: rawTitle,
        cover_url: coverUrl,
        url,
        article_type: blockIsNewspic ? 'newspic' : 'news',
      })
    })

    if (articles.length === 0) return

    const timeRes = parseWechatDisplayTimeToTimestamp(displayTime, baseDate)
    const firstTitleHash = Buffer.from(articles[0].title).toString('hex').slice(0, 8)
    const taskId = `wechat_${timeRes.timestamp}_${idx}_${firstTitleHash}`

    tasks.push({
      id: taskId,
      account_id: accountId,
      display_time: displayTime,
      scheduled_time: timeRes.iso,
      scheduled_timestamp: timeRes.timestamp,
      has_notification: hasNotification,
      article_type: isNewspic ? 'newspic' : 'news',
      articles,
      can_cancel: canCancel,
      synced_at: new Date(baseDate).toISOString(),
    })
  })

  return tasks
}

/**
 * 在排期任务列表中精准匹配目标文章（支持多标题、归一化去标点比对与时段比对）
 */
export function matchScheduledTaskByTitles(
  tasks: WechatScheduledTask[],
  targetTitles: string[],
  expectedTimestamp?: number,
): WechatScheduledTask | null {
  if (!tasks || tasks.length === 0 || !targetTitles || targetTitles.length === 0) {
    return null
  }

  const cleanTargets = targetTitles
    .map(t => (t || '').trim())
    .filter(t => Boolean(t))
  if (cleanTargets.length === 0) return null

  const normalizedTargets = cleanTargets.map(t => ({
    raw: t,
    norm: normalizeArticleTitle(t),
  }))

  for (const task of tasks) {
    for (const art of task.articles || []) {
      const artRaw = (art.title || '').trim()
      if (!artRaw) continue
      const artNorm = normalizeArticleTitle(artRaw)

      for (const target of normalizedTargets) {
        // 1. 完全精确比对
        if (artRaw === target.raw) return task

        // 2. 归一化去标点符号高精度比对（长度不低于 4 字符）
        if (
          target.norm.length >= 4 &&
          (target.norm === artNorm ||
            artNorm.includes(target.norm) ||
            target.norm.includes(artNorm))
        ) {
          return task
        }
      }
    }
  }

  // 3. 辅助按排期时间槽精确匹配（当只排了 1 个任务且时间戳完全一致时）
  if (expectedTimestamp && tasks.length > 0) {
    const timeMatched = tasks.find(
      t => Math.abs(t.scheduled_timestamp - expectedTimestamp) < 3 * 60 * 1000,
    )
    if (timeMatched) return timeMatched
  }

  return null
}

export interface PollAndVerifyResult {
  ok: boolean
  matchedTask?: WechatScheduledTask
  tasks: WechatScheduledTask[]
  error?: string
  attempts: number
}

/**
 * 闭环验证核心：向微信后台发起梯度轮询抓取排期列表并精准核验目标文章。
 * 只有在返回的列表中实际检索到该任务才判定为成功，并自动原子持久化到本地。
 */
export async function pollAndVerifyScheduledTask(
  page: any,
  cfg: Config,
  accountId: string,
  targetTitles: string[],
  expectedTimestamp?: number,
  maxAttempts = 3,
): Promise<PollAndVerifyResult> {
  const delays = [1500, 2000, 2500]
  let lastTasks: WechatScheduledTask[] = []

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, delays[attempt - 1] || 2000))

    try {
      let html = ''
      if (page && !page.isClosed()) {
        html = await page.evaluate(async () => {
          const panel = document.getElementById('timer_send_main')
          if (panel && panel.querySelectorAll('li').length > 0) {
            return panel.outerHTML
          }
          const token = new URL(location.href).searchParams.get('token') || ''
          if (!token) return ''
          try {
            const res = await fetch(
              `/cgi-bin/home?t=home/index&lang=zh_CN&token=${token}&t=${Math.random()}`,
              { credentials: 'include' },
            )
            return await res.text()
          } catch {
            return ''
          }
        })
      }

      if (html) {
        lastTasks = parseWechatScheduledTasksHtml(html, new Date(), accountId)
      }

      // 若成功解析到排期列表，立即落盘持久化保存最新数据
      if (lastTasks.length > 0) {
        saveWechatScheduledTasks(cfg, accountId, lastTasks)
      }

      // 在拉取到的列表中检索匹配当前目标文章
      const matched = matchScheduledTaskByTitles(lastTasks, targetTitles, expectedTimestamp)
      if (matched) {
        console.log(
          `[social-publisher] 账号 ${accountId} 定时排期闭环核验成功（第 ${attempt} 次轮询）：已在微信后台列表中匹配到「${matched.articles[0]?.title}」[${matched.display_time}]`,
        )
        return {
          ok: true,
          matchedTask: matched,
          tasks: lastTasks,
          attempts: attempt,
        }
      }
    } catch (err: any) {
      console.warn(`[social-publisher] 轮询微信后台排期列表第 ${attempt} 次异常:`, err?.message || err)
    }
  }

  // 兜底查一次本地排期缓存
  const fallbackTasks = lastTasks.length > 0 ? lastTasks : loadWechatScheduledTasks(cfg, accountId)
  const matched = matchScheduledTaskByTitles(fallbackTasks, targetTitles, expectedTimestamp)
  if (matched) {
    return { ok: true, matchedTask: matched, tasks: fallbackTasks, attempts: maxAttempts }
  }

  return {
    ok: false,
    tasks: fallbackTasks,
    error: `微信后台排期列表未检索到目标任务「${targetTitles[0]}」（可能被后台频控拦截或时间冲突拒绝），未进入排期列表`,
    attempts: maxAttempts,
  }
}
