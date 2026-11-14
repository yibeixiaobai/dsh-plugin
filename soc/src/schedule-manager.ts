import {
  DEFAULT_SCHEDULE_TIMES_ARTICLE,
  DEFAULT_SCHEDULE_TIMES_NEWSPIC,
  DEFAULT_SCHEDULE_CONFLICT_INTERVAL_MINS,
  type Config,
} from './config.ts'
import { resolveAccount } from './config-runtime.ts'
import { normalizeArticleTitle } from './title-normalizer.ts'
import {
  type WechatScheduledArticle,
  type WechatScheduledTask,
  WECHAT_SCHEDULED_TASKS_FILE,
  getWechatScheduledTasksFilePath,
  loadWechatScheduledTasks,
  saveWechatScheduledTasks,
  removeWechatScheduledTask,
} from './schedule-storage.ts'

export type { WechatScheduledArticle, WechatScheduledTask }
export {
  WECHAT_SCHEDULED_TASKS_FILE,
  getWechatScheduledTasksFilePath,
  loadWechatScheduledTasks,
  saveWechatScheduledTasks,
  removeWechatScheduledTask,
}

export function parseScheduleTime(input: string, baseDate: Date = new Date()): { iso: string; timestamp: number } {
  const trimmed = (input || '').trim()

  // 1. 相对时间：+10m, +2h, +1d
  const relMatch = trimmed.match(/^\+(\d+)\s*([mhd])$/i)
  if (relMatch) {
    const val = parseInt(relMatch[1], 10)
    const unit = relMatch[2].toLowerCase()
    const ms = unit === 'm' ? val * 60 * 1000 : unit === 'h' ? val * 3600 * 1000 : val * 86400 * 1000
    const target = new Date(baseDate.getTime() + ms)
    return { iso: target.toISOString(), timestamp: target.getTime() }
  }

  // 2. 当日或次日时间：如 09:30 或 09:30:00
  const timeOnlyMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (timeOnlyMatch) {
    const hour = parseInt(timeOnlyMatch[1], 10)
    const min = parseInt(timeOnlyMatch[2], 10)
    const sec = timeOnlyMatch[3] ? parseInt(timeOnlyMatch[3], 10) : 0
    const target = new Date(baseDate)
    target.setHours(hour, min, sec, 0)
    if (target.getTime() <= baseDate.getTime()) {
      // 若已过今日该时间，顺延至明天
      target.setDate(target.getDate() + 1)
    }
    return { iso: target.toISOString(), timestamp: target.getTime() }
  }

  // 3. 绝对日期时间：2026-10-08 09:30:00 或 ISO 格式
  const parsed = new Date(trimmed)
  if (!isNaN(parsed.getTime())) {
    return { iso: parsed.toISOString(), timestamp: parsed.getTime() }
  }

  // 缺省 1 小时后
  const fallback = new Date(baseDate.getTime() + 3600 * 1000)
  return { iso: fallback.toISOString(), timestamp: fallback.getTime() }
}

export interface ScheduleSlotResolution {
  iso: string
  timestamp: number
  delayed: boolean
  delay_reason?: string
  original_requested_time?: string
  need_notification: boolean
}

export interface ScheduleAllocatedSlot {
  timestamp: number
  article_type: 'news' | 'newspic'
}

export interface ScheduleSlotOptions {
  requireNotification?: boolean
  titles?: string[]
  /** 当前批次前面文章已分配占用的时间戳列表（向后兼容纯数字数组，此时仅用于当前 articleType） */
  allocatedTimestamps?: number[]
  /** 带形态的当前批次已分配槽位列表，严格按形态隔离防撞，彻底杜绝跨形态互相占用 */
  allocatedSlots?: ScheduleAllocatedSlot[]
}

/**
 * 标题归一化清洗函数（去除中英文标点、符号、空格及标签前缀，用于高精度防重比对，复用 title-normalizer）
 */
export function normalizeTitle(s: string): string {
  return normalizeArticleTitle(s)
}

/**
 * 校验待发布标题是否已在微信公众号后台已有定时排期中存在（防重复发布）
 */
export function checkScheduledTitleCollision(
  cfg: Config,
  accountId: string,
  titles: string[],
): { hasCollision: boolean; collidedTitles: string[]; existingTime?: string } {
  const wechatTasks = loadWechatScheduledTasks(cfg, accountId)
  const collidedTitles: string[] = []
  let existingTime: string | undefined

  for (const t of titles) {
    const cleanT = (t || '').trim()
    if (!cleanT) continue
    const normT = normalizeTitle(cleanT)

    for (const wt of wechatTasks) {
      const match = wt.articles.find((a) => {
        const raw = (a.title || '').trim()
        if (raw === cleanT) return true
        const normA = normalizeTitle(raw)
        return normT.length >= 4 && normT === normA
      })
      if (match) {
        if (!collidedTitles.includes(cleanT)) collidedTitles.push(cleanT)
        existingTime = existingTime || wt.display_time || wt.scheduled_time
      }
    }
  }

  return {
    hasCollision: collidedTitles.length > 0,
    collidedTitles,
    existingTime,
  }
}

/**
 * 微信公众号原生排期槽位决议算法：
 * 1. 严格由微信公众号后台原生托管，零本地执行任务；
 * 2. 备注要求除外（最高优先级）：若任务有备注指定明确时间，直接采用指定时间；
 * 3. 设定时间规则：按图1配置字段分别读取（普通长文 schedule_times_article，小绿书 schedule_times_newspic）；
 * 4. 跨形态并存与同形态互斥：同一时段（±15分钟）允许同时存在1篇长文与1篇小绿书，但严禁存在2篇同类型文章；
 * 5. 群发通知精准规则：只有每天最早的第一个普通长文定时任务需要群发通知，其余后续长文与小绿书均不群发；
 * 6. 优先最近无任务时段：按距离当前时间由近及远探测，优先命中离当前时间最近且无同类型任务的时间段。
 */
export function resolveNextScheduleSlot(
  cfg: Config,
  accountId: string,
  articleType: 'news' | 'newspic' = 'news',
  requestedTime?: string,
  baseDate: Date = new Date(),
  options?: ScheduleSlotOptions,
): ScheduleSlotResolution {
  const account = resolveAccount(cfg, accountId)
  const autoDelay = account.profile.schedule_auto_delay !== false
  const conflictIntervalMins = account.profile.schedule_conflict_interval_mins || DEFAULT_SCHEDULE_CONFLICT_INTERVAL_MINS

  const wechatTasks = loadWechatScheduledTasks(cfg, accountId)

  // 【中文修复依据】：各微信公众号账号为完全独立的运营主体与日历视图，彻底移除 crossAccountTasks 跨账号互斥避让，
  // 杜绝因系统中其他账号在某天占用了时段而导致当前公众号跳过无任务的空闲日期（如 11.5 号）。

  // 1. 同形态互斥排查（同一时刻 ±15 分钟内严禁存在 2 篇同形态文章）
  // 【中文修复依据】：长文（news）与小绿书（newspic）具有正交独立的排期通道，后台任务与批次分配均严格按形态隔离匹配，严禁跨形态互斥或避让
  const isTimeConflictingForType = (ts: number, type: 'news' | 'newspic'): boolean => {
    // 检查微信后台已有当前账号的同形态任务
    const hasExistingSameType = wechatTasks.some((t) => {
      const taskType = t.article_type || 'news'
      return taskType === type && Math.abs(t.scheduled_timestamp - ts) < 15 * 60 * 1000
    })
    if (hasExistingSameType) return true

    // 检查当前批次前面已分配占用的带形态时间槽位（严格按形态隔离匹配）
    if (options?.allocatedSlots && options.allocatedSlots.some((slot) => {
      const slotType = slot.article_type || 'news'
      return slotType === type && Math.abs(slot.timestamp - ts) < 15 * 60 * 1000
    })) {
      return true
    }

    // 检查向后兼容的 allocatedTimestamps（仅对当前正在决议的类型生效，不跨形态阻断）
    if (options?.allocatedTimestamps && options.allocatedTimestamps.some(allocTs => Math.abs(allocTs - ts) < 15 * 60 * 1000)) {
      return true
    }
    return false
  }

  // 2. 针对指定时刻的冲突检测（仅针对当前账号与当前形态）
  const isTimeConflictingForAccount = (ts: number): boolean => {
    return isTimeConflictingForType(ts, articleType)
  }

  // 判断是否是该日期最早的第一个普通长文定时任务（独占群发通知）
  const checkIsFirstNewsTaskOfDay = (candidateTs: number, targetDate: Date): boolean => {
    if (articleType !== 'news') return false
    const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`

    // 检查微信后台当天是否已有任何普通长文排期
    const dayNewsTasks = wechatTasks.filter((t) => {
      const tType = t.article_type || 'news'
      if (tType !== 'news') return false
      const td = new Date(t.scheduled_timestamp)
      const tdStr = `${td.getFullYear()}-${String(td.getMonth() + 1).padStart(2, '0')}-${String(td.getDate()).padStart(2, '0')}`
      return tdStr === dateStr
    })

    // 若当天已有长文开启了群发通知，或已有更早的长文排期，则当前长文不是最早的第一个群发任务
    if (dayNewsTasks.some(t => t.has_notification || t.scheduled_timestamp < candidateTs)) {
      return false
    }
    return true
  }

  const trimmedReq = (requestedTime || '').trim()

  // 情形 1：用户备注要求优先！若任务备注明确指定了时刻（且非 'auto'）
  if (trimmedReq && trimmedReq !== 'auto') {
    const parsed = parseScheduleTime(trimmedReq, baseDate)
    if (!autoDelay || !isTimeConflictingForAccount(parsed.timestamp)) {
      const needNotice = articleType === 'news' && checkIsFirstNewsTaskOfDay(parsed.timestamp, new Date(parsed.timestamp))
      return {
        iso: parsed.iso,
        timestamp: parsed.timestamp,
        delayed: false,
        original_requested_time: trimmedReq,
        need_notification: needNotice,
      }
    }

    // 与微信后台已有同类型任务重叠且开启了顺延：按步长后延至安全空闲时段
    let candidateTs = parsed.timestamp
    let attempts = 0
    while (isTimeConflictingForAccount(candidateTs) && attempts < 48) {
      candidateTs += conflictIntervalMins * 60 * 1000
      attempts++
    }
    const resolvedDate = new Date(candidateTs)
    const needNotice = articleType === 'news' && checkIsFirstNewsTaskOfDay(candidateTs, resolvedDate)
    return {
      iso: resolvedDate.toISOString(),
      timestamp: candidateTs,
      delayed: true,
      delay_reason: `用户备注时间 ${trimmedReq} 与微信后台已有${articleType === 'newspic' ? '小绿书' : '长文'}排期冲突，已自动安全后延 ${attempts * conflictIntervalMins} 分钟`,
      original_requested_time: trimmedReq,
      need_notification: needNotice,
    }
  }

  // 情形 2：无备注要求，按照图1设定时间规则与微信后台已同步排期，优先选择离目前时间最近的无同类型任务时间段
  let rawSlots: string[] = []
  if (articleType === 'newspic') {
    rawSlots = (account.profile.schedule_times_newspic && account.profile.schedule_times_newspic.length > 0)
      ? account.profile.schedule_times_newspic
      : DEFAULT_SCHEDULE_TIMES_NEWSPIC
  } else {
    rawSlots = (account.profile.schedule_times_article && account.profile.schedule_times_article.length > 0)
      ? account.profile.schedule_times_article
      : DEFAULT_SCHEDULE_TIMES_ARTICLE
  }

  // 提取并清洗有效时段 HH:mm
  const parsedSlots: Array<{ hour: number; min: number; sec: number; raw: string }> = []
  for (const s of rawSlots) {
    const match = (s || '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
    if (match) {
      parsedSlots.push({
        hour: parseInt(match[1], 10),
        min: parseInt(match[2], 10),
        sec: match[3] ? parseInt(match[3], 10) : 0,
        raw: s.trim(),
      })
    }
  }

  // 微信公众号官方定时发表窗口为 7 天内
  // 安全缓冲期：距当前时刻至少 10 分钟（预留排版、图片渲染与浏览器交互时间）
  const minBufferMs = 10 * 60 * 1000

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const currentDayDate = new Date(baseDate)
    currentDayDate.setDate(currentDayDate.getDate() + dayOffset)

    // 构造当天全部候选时间戳
    const candidatesForDay: Array<{ date: Date; ts: number; raw: string }> = []
    for (const ps of parsedSlots) {
      const cand = new Date(currentDayDate)
      cand.setHours(ps.hour, ps.min, ps.sec, 0)
      candidatesForDay.push({ date: cand, ts: cand.getTime(), raw: ps.raw })
    }

    // 关键优化：严格按时间戳升序排序（按距离当前时间由近及远）
    candidatesForDay.sort((a, b) => a.ts - b.ts)

    for (const candidate of candidatesForDay) {
      // 必须晚于当前基准时间 + 安全缓冲
      if (candidate.ts <= baseDate.getTime() + minBufferMs) {
        continue
      }

      // 【中文修复依据】：各公众号账号独立排期，并在当前账号内支持跨形态共存（允许 1 篇长文与 1 篇小绿书在同一时段并存，但同形态互斥）
      if (!isTimeConflictingForType(candidate.ts, articleType)) {
        const isDelayed = dayOffset > 0 || candidate.ts > baseDate.getTime() + 4 * 3600 * 1000
        const reason = dayOffset > 0
          ? `今日 ${articleType === 'newspic' ? '小绿书' : '长文'} 候选时段已满或已过，已自动顺延至 ${dayOffset === 1 ? '明天' : `${currentDayDate.getMonth() + 1}月${currentDayDate.getDate()}日`} ${candidate.raw}`
          : undefined

        // 仅当天最早的第一个普通长文需要群发通知，其余长文与所有小绿书均不群发
        const needNotice = articleType === 'news' && checkIsFirstNewsTaskOfDay(candidate.ts, currentDayDate)

        return {
          iso: candidate.date.toISOString(),
          timestamp: candidate.ts,
          delayed: isDelayed,
          delay_reason: reason,
          original_requested_time: requestedTime,
          need_notification: needNotice,
        }
      }
    }
  }

  // 极端兜底（7天内规则时段均满）：顺延至 2 小时后
  const fallback = new Date(baseDate.getTime() + 2 * 3600 * 1000)
  return {
    iso: fallback.toISOString(),
    timestamp: fallback.getTime(),
    delayed: true,
    delay_reason: `预设规则时段均已被微信后台已有${articleType === 'newspic' ? '小绿书' : '长文'}任务占用，已自动保底分配至 2 小时后`,
    original_requested_time: requestedTime,
    need_notification: false,
  }
}
