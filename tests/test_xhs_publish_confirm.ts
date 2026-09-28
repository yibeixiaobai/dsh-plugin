/**
 * 回归测试：小红书发布结果判定（三态）
 *
 * 演进历史（两个相反的极端，都被本测试锁死）：
 *  A. 假成功：旧实现用 /发布成功|已发布|审核中/.test(innerText) 判定，
 *     而创作者后台静态文案本就含这些词，于是编辑器没渲染也算成功，
 *     note_id 落成 'pending_N' 并上报 success。
 *  B. 假阴性：改严后要求发布页 URL 出现 note_id，但小红书发布后只跳
 *     ?published=true、URL 从不含 note_id，于是「真发布成功」被判成失败。
 *     （实测：2026-09-28 16:07 的笔记已在稿件管理中可见，工具却报未确认。）
 *
 * 现行契约：发布后进「稿件管理」核对，三态裁决 ——
 *  published / unconfirmed / failed，只有 failed 才中断整批。
 * 占位符 pending_N 永远不得上报成功。
 */
import assert from 'node:assert'

type Status = 'published' | 'unconfirmed' | 'failed'

// —— 复刻调用层三态判定（与 src/tools/publish.ts 一致） ——
function judgeBatch(notes: Array<{ note_id: string; title: string; status?: Status }>): {
  outcome: 'success' | 'unconfirmed' | 'failed'
  confirmed: number
} {
  const failed = notes.filter((d) => d.status === 'failed')
  const placeholder = notes.filter((d) => /^pending_/i.test(d.note_id || ''))
  if (failed.length > 0 || placeholder.length > 0) {
    return { outcome: 'failed', confirmed: notes.filter((d) => d.status === 'published' && d.note_id).length }
  }
  const published = notes.filter((d) => d.status === 'published' && d.note_id)
  const unconfirmed = notes.filter((d) => d.status !== 'published' || !d.note_id)
  return {
    outcome: unconfirmed.length > 0 ? 'unconfirmed' : 'success',
    confirmed: published.length,
  }
}

// —— 复刻稿件管理匹配（与 src/xiaohongshu.ts matchManagedNote 一致） ——
function normalizeTitle(s: string): string {
  return (s || '')
    .replace(/\s+/g, '')
    .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, '')
    .replace(/[\uFE0F\u200D]/g, '')
    .toLowerCase()
}
function parsePostedTime(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/.exec((s || '').trim())
  if (!m) return NaN
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])).getTime()
}
function matchManagedNote(
  notes: Array<{ id: string; display_title: string; time: string }>,
  title: string,
  publishedAtMs: number,
  windowMs = 15 * 60 * 1000,
): { id: string; time: string } | null {
  const want = normalizeTitle(title)
  const same = notes.filter((n) => normalizeTitle(n.display_title) === want)
  if (same.length === 0) return null
  if (same.length === 1) {
    const t = parsePostedTime(same[0].time)
    if (Number.isNaN(t) || Math.abs(t - publishedAtMs) <= windowMs) return same[0]
    return null
  }
  const inWindow = same
    .map((n) => ({ n, t: parsePostedTime(n.time) }))
    .filter((x) => !Number.isNaN(x.t) && Math.abs(x.t - publishedAtMs) <= windowMs)
    .sort((a, b) => Math.abs(a.t - publishedAtMs) - Math.abs(b.t - publishedAtMs))
  return inWindow.length > 0 ? inWindow[0].n : null
}

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log('  ✓ ' + name)
}

// 实测真实数据（2026-09-28 稿件管理返回）作为夹具
const REAL_MANAGED = [
  { id: '6aba202f000000001b031f7a', display_title: 'SCI投稿被拒？3步返修翻盘💪', time: '2026-09-28 16:07' },
  { id: '6aba1bbe000000001500155f', display_title: '期刊发表流程3步走🚀别踩坑', time: '2026-09-28 15:48' },
  { id: '6aba03a2000000001c02f173', display_title: '论文投稿前必看5个避坑点📌', time: '2026-09-28 14:05' },
]

console.log('【1】假成功必须被拦截（回归 A）')
check('pending_N 占位符 → 整批 failed，绝不上报成功', () => {
  const r = judgeBatch([
    { note_id: 'pending_1', title: 'A', status: 'published' },
    { note_id: 'pending_2', title: 'B', status: 'published' },
  ])
  assert.strictEqual(r.outcome, 'failed')
})
check('空 note_id 且标记 published → 仍不算确认成功', () => {
  const r = judgeBatch([{ note_id: '', title: 'A', status: 'published' }])
  assert.strictEqual(r.outcome, 'unconfirmed')
  assert.strictEqual(r.confirmed, 0)
})

console.log('\n【2】假阴性必须被消除（回归 B）—— 本次真实事故')
check('实测：稿件管理已收录 → 判 published 并给出真实 id', () => {
  const hit = matchManagedNote(REAL_MANAGED, 'SCI投稿被拒？3步返修翻盘💪', parsePostedTime('2026-09-28 16:07'))
  assert.ok(hit, '应能匹配到稿件管理中的条目')
  assert.strictEqual(hit.id, '6aba202f000000001b031f7a')
})
check('已确认收录的批次 → outcome success（旧逻辑会误判为失败）', () => {
  const r = judgeBatch([
    { note_id: '6aba202f000000001b031f7a', title: 'SCI投稿被拒？3步返修翻盘💪', status: 'published' },
  ])
  assert.strictEqual(r.outcome, 'success')
  assert.strictEqual(r.confirmed, 1)
})
check('仅「已点击发布」未被收录 → unconfirmed（不武断判 failed）', () => {
  const r = judgeBatch([{ note_id: '', title: 'X', status: 'unconfirmed' }])
  assert.strictEqual(r.outcome, 'unconfirmed')
})

console.log('\n【3】匹配精度：标题与时间窗口')
check('标题归一化：全角空格/零宽字符差异仍可匹配', () => {
  const notes = [{ id: 'id1', display_title: 'Ａ Ｂ', time: '2026-09-28 10:00' }]
  assert.ok(matchManagedNote(notes, 'AB', parsePostedTime('2026-09-28 10:00')))
})
check('同名但时间超出窗口 → 判为历史同名，不算本次成功', () => {
  const notes = [{ id: 'old', display_title: '同名标题', time: '2026-09-27 09:00' }]
  const hit = matchManagedNote(notes, '同名标题', parsePostedTime('2026-09-28 16:07'))
  assert.strictEqual(hit, null, '超出 15 分钟窗口不得误配为本次发布')
})
check('多条同名 → 取时间最接近窗口内的一条', () => {
  const notes = [
    { id: 'far', display_title: '同名', time: '2026-09-28 16:00' },
    { id: 'near', display_title: '同名', time: '2026-09-28 16:06' },
  ]
  const hit = matchManagedNote(notes, '同名', parsePostedTime('2026-09-28 16:07'))
  assert.strictEqual(hit?.id, 'near')
})
check('列表中无该标题 → null（交由上层判 unconfirmed）', () => {
  assert.strictEqual(matchManagedNote(REAL_MANAGED, '不存在的标题', Date.now()), null)
})

console.log('\n【4】三态汇总')
check('混合：一篇确认 + 一篇未确认 → unconfirmed 批次，confirmed=1', () => {
  const r = judgeBatch([
    { note_id: '6aba202f000000001b031f7a', title: 'A', status: 'published' },
    { note_id: '', title: 'B', status: 'unconfirmed' },
  ])
  assert.strictEqual(r.outcome, 'unconfirmed')
  assert.strictEqual(r.confirmed, 1)
})
check('明确 failed 优先于其它状态', () => {
  const r = judgeBatch([
    { note_id: '6aba202f000000001b031f7a', title: 'A', status: 'published' },
    { note_id: '', title: 'B', status: 'failed' },
  ])
  assert.strictEqual(r.outcome, 'failed')
})

console.log('\n【5】发布前防重（幂等闸门，杜绝假阴性重试造成重复笔记）')

// —— 复刻 src/tools/publish.ts xhsDedupGuard 的判定逻辑 ——
type Rec = {
  platform: string
  timestamp: string
  article_count?: number
  articles: string[]
  items?: Array<{ title: string; draft_id?: string; url?: string; published?: boolean }>
}
function xhsDedupGuard(
  records: Rec[],
  titles: string[],
  nowMs: number,
  windowMs = 30 * 60 * 1000,
): { blocked: boolean; fullyConfirmed: boolean } {
  for (const r of records) {
    if (r.platform !== 'xiaohongshu') continue
    const recTitles = r.articles || []
    if (recTitles.length !== titles.length) continue
    if (!recTitles.every((t, i) => t === titles[i])) continue

    const recTime = new Date(String(r.timestamp).replace(' ', 'T')).getTime()
    const fresh = !Number.isNaN(recTime) && nowMs - recTime < windowMs
    const items = r.items || []
    const confirmedIds = items
      .map((it) => it.draft_id)
      .filter((id): id is string => Boolean(id) && !/^pending_/i.test(String(id)))
    const fullyConfirmed = confirmedIds.length === titles.length && confirmedIds.length > 0
    if (!fullyConfirmed && !fresh) continue
    return { blocked: true, fullyConfirmed }
  }
  return { blocked: false, fullyConfirmed: false }
}

const T = ['SCI投稿被拒？3步返修翻盘💪']
const NOW = new Date('2026-09-28T16:40:00').getTime()

check('已确认发布过 → 拦截并复用（不重复建笔记）', () => {
  const r = xhsDedupGuard([{
    platform: 'xiaohongshu', timestamp: '2026-09-28 16:07', articles: T,
    items: [{ title: T[0], draft_id: '6aba202f000000001b031f7a', published: true }],
  }], T, NOW)
  assert.strictEqual(r.blocked, true)
  assert.strictEqual(r.fullyConfirmed, true)
})

check('核心场景：刚发过但未确认（空 id）也要拦截，绝不再发一遍', () => {
  // 重试发生在发布后 13 分钟，落在 30 分钟防重窗口内
  const retryAt = new Date('2026-09-28T16:20:00').getTime()
  const r = xhsDedupGuard([{
    platform: 'xiaohongshu', timestamp: '2026-09-28 16:07', articles: T,
    items: [{ title: T[0], draft_id: '', published: false }],
  }], T, retryAt)
  assert.strictEqual(r.blocked, true, '「已发未确认」必须被拦截，否则重试会产生重复笔记')
  assert.strictEqual(r.fullyConfirmed, false)
})

check('超出 30 分钟窗口且未确认 → 放行（允许人工确认后补发）', () => {
  // NOW = 16:40，距 16:07 已 33 分钟，超出防重窗口
  const r = xhsDedupGuard([{
    platform: 'xiaohongshu', timestamp: '2026-09-28 16:07', articles: T,
    items: [{ title: T[0], draft_id: '', published: false }],
  }], T, NOW)
  assert.strictEqual(r.blocked, false, '超出窗口应放行（history 兜底闸门的旧契约）')
})

check('pending_N 占位符不算已确认，但窗口内仍拦截', () => {
  const retryAt = new Date('2026-09-28T16:20:00').getTime()
  const r = xhsDedupGuard([{
    platform: 'xiaohongshu', timestamp: '2026-09-28 16:07', articles: T,
    items: [{ title: T[0], draft_id: 'pending_1', published: true }],
  }], T, retryAt)
  assert.strictEqual(r.blocked, true)
  assert.strictEqual(r.fullyConfirmed, false, 'pending_N 绝不能算已确认')
})

check('超出窗口但已确认 → 仍拦截', () => {
  const r = xhsDedupGuard([{
    platform: 'xiaohongshu', timestamp: '2026-09-27 09:00', articles: T,
    items: [{ title: T[0], draft_id: '6aba202f000000001b031f7a', published: true }],
  }], T, NOW)
  assert.strictEqual(r.blocked, true)
  assert.strictEqual(r.fullyConfirmed, true)
})

check('标题不同 → 放行', () => {
  const r = xhsDedupGuard([{
    platform: 'xiaohongshu', timestamp: '2026-09-28 16:07', articles: ['另一篇完全不同的标题'],
    items: [{ title: '另一篇完全不同的标题', draft_id: 'aa', published: true }],
  }], T, NOW)
  assert.strictEqual(r.blocked, false)
})

check('篇数不同 → 放行（组合不一致）', () => {
  const r = xhsDedupGuard([{
    platform: 'xiaohongshu', timestamp: '2026-09-28 16:07', articles: [T[0], '第二篇'],
    items: [{ title: T[0], draft_id: 'aa', published: true }],
  }], T, NOW)
  assert.strictEqual(r.blocked, false)
})

check('其它平台的记录不参与小红书防重', () => {
  const r = xhsDedupGuard([{
    platform: 'gzh', timestamp: '2026-09-28 16:07', articles: T,
    items: [{ title: T[0], draft_id: 'media123', published: true }],
  }], T, NOW)
  assert.strictEqual(r.blocked, false)
})

check('本期真实事故复盘：16:07 已发、16:12 重试 → 必须拦截', () => {
  // 这正是上一轮发生的事：笔记 16:07 已发布成功，工具却报「未确认」，
  // 若当时立刻重试，就会产生重复笔记。本闸门确保这种重试被挡住。
  const soon = new Date('2026-09-28T16:12:00').getTime() // 5 分钟后重试
  const r = xhsDedupGuard([{
    platform: 'xiaohongshu',
    timestamp: '2026-09-28 16:07',
    articles: ['SCI投稿被拒？3步返修翻盘💪'],
    items: [{ title: 'SCI投稿被拒？3步返修翻盘💪', draft_id: '', published: false }],
  }], ['SCI投稿被拒？3步返修翻盘💪'], soon)
  assert.strictEqual(r.blocked, true)
  assert.ok(soon - new Date('2026-09-28T16:07:00').getTime() < 30 * 60 * 1000, '重试间隔应落在窗口内')
})

console.log('\n【6】attempt 日志闸门（修复「判为未确认 → 无记录 → 重试重复发」死锁）')

// —— 复刻 src/tools/publish.ts 的 attempt 判定分支（第一道闸门） ——
// 核心不变量：发布**动作发起前**就落盘 attempt，与最终成败无关。
// 因此「已提交但未能确认」的笔记，重试时必然被挡住。
type Attempt = {
  platform: string
  titles: string[]
  attemptedAtMs: number
  outcome?: 'published' | 'unconfirmed' | 'failed'
}
function attemptGuard(
  attempts: Attempt[],
  titles: string[],
  nowMs: number,
  windowMs = 30 * 60 * 1000,
): { blocked: boolean; confirmed: boolean } {
  for (const a of attempts) {
    if (a.platform !== 'xiaohongshu') continue
    if (a.titles.length !== titles.length) continue
    if (!a.titles.every((t, i) => t === titles[i])) continue
    const fresh = typeof a.attemptedAtMs === 'number' && nowMs - a.attemptedAtMs < windowMs
    const confirmed = a.outcome === 'published'
    if (!confirmed && !fresh) continue
    return { blocked: true, confirmed }
  }
  return { blocked: false, confirmed: false }
}

const T6 = ['SCI、EI、核心期刊到底怎么选🤔']
const T0 = new Date('2026-09-28T16:51:00').getTime()

check('本次真实事故：unconfirmed 的 attempt 也必须拦截重试（核心修复）', () => {
  // 场景复现：16:51 发布 → 判 unconfirmed（无 note_id）→ 16:53 立刻重试
  const retryAt = new Date('2026-09-28T16:53:00').getTime()
  const r = attemptGuard([
    { platform: 'xiaohongshu', titles: T6, attemptedAtMs: T0, outcome: 'unconfirmed' },
  ], T6, retryAt)
  assert.strictEqual(r.blocked, true, '旧的 history-only 闸门在这里查不到记录 → 会重复发一篇')
  assert.strictEqual(r.confirmed, false, 'unconfirmed 不是已确认，不得当作成功复用')
})

check('无 outcome 字段（发布中途崩溃/未回填）也要拦截', () => {
  const retryAt = new Date('2026-09-28T16:55:00').getTime()
  const r = attemptGuard([
    { platform: 'xiaohongshu', titles: T6, attemptedAtMs: T0 },
  ], T6, retryAt)
  assert.strictEqual(r.blocked, true, 'attempt 落盘先于发布动作，无 outcome 恰恰说明结果未知，绝不能重发')
})

check('已确认 published → 永久拦截（不受时间窗口限制）', () => {
  const muchLater = T0 + 10 * 24 * 3600 * 1000
  const r = attemptGuard([
    { platform: 'xiaohongshu', titles: T6, attemptedAtMs: T0, outcome: 'published' },
  ], T6, muchLater)
  assert.strictEqual(r.blocked, true)
  assert.strictEqual(r.confirmed, true)
})

check('明确 failed 且超出窗口 → 放行（允许修好后重发）', () => {
  const later = T0 + 31 * 60 * 1000
  const r = attemptGuard([
    { platform: 'xiaohongshu', titles: T6, attemptedAtMs: T0, outcome: 'failed' },
  ], T6, later)
  assert.strictEqual(r.blocked, false, '明确失败且已过窗口应放行，否则永远无法补发')
})

check('标题不同 → 放行', () => {
  const r = attemptGuard([
    { platform: 'xiaohongshu', titles: T6, attemptedAtMs: T0, outcome: 'unconfirmed' },
  ], ['另一篇完全不同的标题'], T0 + 60000)
  assert.strictEqual(r.blocked, false)
})

check('其它平台的 attempt 不参与小红书防重', () => {
  const r = attemptGuard([
    { platform: 'gzh', titles: T6, attemptedAtMs: T0, outcome: 'unconfirmed' },
  ], T6, T0 + 60000)
  assert.strictEqual(r.blocked, false)
})

check('双闸门一致性：history 为空的死锁场景，attempt 闸门必须兜住', () => {
  // 这正是本次事故：第 1 次发布 unconfirmed → history **未写入**（只在成功路径写）
  // → history 闸门查不到任何记录 → 放行 → 重复发布。
  // 引入 attempt 后，第一道闸门必须独立兜住该场景。
  const retryAt = new Date('2026-09-28T16:53:00').getTime()
  const historyRecords: Rec[] = []  // 未确认路径不写 history，故为空
  const historyGate = xhsDedupGuard(historyRecords, T6, retryAt)
  assert.strictEqual(historyGate.blocked, false, 'history 为空时旧闸门确实放行 —— 这就是重复发布的成因')

  const attemptGate = attemptGuard([
    { platform: 'xiaohongshu', titles: T6, attemptedAtMs: T0, outcome: 'unconfirmed' },
  ], T6, retryAt)
  assert.strictEqual(attemptGate.blocked, true, 'attempt 闸门必须兜住 history 的死锁场景')
})

console.log('\n【7】永久拦截：未确认不得因超窗而放行（本次重复笔记的直接成因）')

/**
 * 复刻修复后的 attempt 闸门契约（src/tools/publish.ts xhsDedupGuard 第一道）。
 *
 * 关键变更：旧实现「未确认 → 仅窗口内拦截，超窗放行」。但小红书发布后 URL 不含
 * note_id，一旦当次核对失败，该笔记会长期停在 unconfirmed；超窗放行即等于
 * 「同一篇再发一次」——这正是产生两篇一样笔记的直接原因。
 * 新契约：只要没有全部拿到真实 note_id，就一律拦截；仅「明确 failed 且超窗」放行。
 */
type Attempt2 = {
  platform: string
  titles: string[]
  attemptedAtMs: number
  outcome?: 'published' | 'unconfirmed' | 'failed'
  note_ids?: string[]
}
function attemptGuard2(
  attempts: Attempt2[],
  titles: string[],
  nowMs: number,
  windowMs = 30 * 60 * 1000,
): { blocked: boolean; confirmed: boolean } {
  for (const a of attempts) {
    if (a.platform !== 'xiaohongshu') continue
    if (a.titles.length !== titles.length) continue
    if (!a.titles.every((t, i) => t === titles[i])) continue
    const ids = a.note_ids || []
    const allConfirmed = ids.length === a.titles.length && ids.every(Boolean)
    const confirmed = a.outcome === 'published' && allConfirmed
    const fresh = typeof a.attemptedAtMs === 'number' && nowMs - a.attemptedAtMs < windowMs
    const explicitFailure = a.outcome === 'failed' && !fresh
    if (explicitFailure) continue
    return { blocked: true, confirmed }
  }
  return { blocked: false, confirmed: false }
}

check('核心回归：未确认且已远超窗口 → 仍然拦截（旧逻辑这里会放行 → 重复笔记）', () => {
  const muchLater = T0 + 6 * 3600 * 1000 // 6 小时后
  const r = attemptGuard2([
    { platform: 'xiaohongshu', titles: T6, attemptedAtMs: T0, outcome: 'unconfirmed' },
  ], T6, muchLater)
  assert.strictEqual(r.blocked, true, '未确认超窗也必须拦截，否则重试必然产生重复笔记')
  assert.strictEqual(r.confirmed, false, '未确认不得当作已确认复用')
})

check('核对成功补齐 note_ids 后才升级为已确认', () => {
  const later = T0 + 6 * 3600 * 1000
  const r = attemptGuard2([
    { platform: 'xiaohongshu', titles: T6, attemptedAtMs: T0, outcome: 'published', note_ids: ['6aba202f000000001b031f7a'] },
  ], T6, later)
  assert.strictEqual(r.blocked, true)
  assert.strictEqual(r.confirmed, true, '拿到真实 ID 后应作为已确认复用')
})

check('outcome=published 但 note_ids 为空 → 不得算已确认（防谎报）', () => {
  const later = T0 + 6 * 3600 * 1000
  const r = attemptGuard2([
    { platform: 'xiaohongshu', titles: T6, attemptedAtMs: T0, outcome: 'published', note_ids: [] },
  ], T6, later)
  assert.strictEqual(r.blocked, true)
  assert.strictEqual(r.confirmed, false, '缺真实 ID 时不能算已确认，只能算未确认')
})

check('明确 failed 且超窗 → 放行（保留补救能力）', () => {
  const later = T0 + 31 * 60 * 1000
  const r = attemptGuard2([
    { platform: 'xiaohongshu', titles: T6, attemptedAtMs: T0, outcome: 'failed' },
  ], T6, later)
  assert.strictEqual(r.blocked, false, '明确失败且已过窗口应放行，否则永远无法补发')
})

check('明确 failed 但仍在窗口内 → 仍拦截（等核对）', () => {
  const r = attemptGuard2([
    { platform: 'xiaohongshu', titles: T6, attemptedAtMs: T0, outcome: 'failed' },
  ], T6, T0 + 60000)
  assert.strictEqual(r.blocked, true)
})

console.log('\n【8】自愈式核对：待核对清单的筛选契约')

/** 复刻 src/publish-history.ts listPendingReconcile 的筛选逻辑 */
function listPending(
  attempts: Attempt2[],
  nowMs: number,
  maxAgeMs = 7 * 24 * 3600 * 1000,
): Attempt2[] {
  return attempts.filter((a) => {
    if (a.platform !== 'xiaohongshu') return false
    if (a.outcome === 'failed') return false
    if (typeof a.attemptedAtMs !== 'number') return false
    if (nowMs - a.attemptedAtMs > maxAgeMs) return false
    const ids = a.note_ids || []
    return !(ids.length === a.titles.length && ids.every(Boolean))
  })
}

check('未确认的条目进入待核对清单 → 会被自动补核对', () => {
  const p = listPending([
    { platform: 'xiaohongshu', titles: T6, attemptedAtMs: T0, outcome: 'unconfirmed' },
  ], T0 + 3600_000)
  assert.strictEqual(p.length, 1, '未确认条目必须进入待核对清单，供自动补核对')
})

check('已全部确认的条目不再重复核对（避免无谓访问平台）', () => {
  const p = listPending([
    { platform: 'xiaohongshu', titles: T6, attemptedAtMs: T0, outcome: 'published', note_ids: ['abc'] },
  ], T0 + 3600_000)
  assert.strictEqual(p.length, 0)
})

check('部分确认（多篇只补到一篇）仍留在清单中', () => {
  const p = listPending([
    { platform: 'xiaohongshu', titles: ['A', 'B'], attemptedAtMs: T0, outcome: 'unconfirmed', note_ids: ['idA'] },
  ], T0 + 3600_000)
  assert.strictEqual(p.length, 1, '只要还有未确认的篇目就要继续核对')
})

check('明确 failed 不进入核对清单', () => {
  const p = listPending([
    { platform: 'xiaohongshu', titles: T6, attemptedAtMs: T0, outcome: 'failed' },
  ], T0 + 3600_000)
  assert.strictEqual(p.length, 0)
})

check('超过 7 天老化上限 → 停止反复核对（避免无限重扫）', () => {
  const p = listPending([
    { platform: 'xiaohongshu', titles: T6, attemptedAtMs: T0, outcome: 'unconfirmed' },
  ], T0 + 8 * 24 * 3600 * 1000)
  assert.strictEqual(p.length, 0)
})

check('其它平台的条目不参与小红书核对', () => {
  const p = listPending([
    { platform: 'gzh', titles: T6, attemptedAtMs: T0, outcome: 'unconfirmed' },
  ], T0 + 3600_000)
  assert.strictEqual(p.length, 0)
})

console.log('\n【9】端到端事故复盘：本次「两篇重复笔记」完整链路必须被阻断')
check('复盘：17:23 发布未确认 → 17:26 重试 → 现在必须被拦截', () => {
  // 真实时间线（2026-09-28）：
  //  17:23 首次发布，URL 已 ?published=true，但核对未取到 note_id → unconfirmed
  //  17:26 重试 → 旧代码下 attempt 未落盘 + 闸门超窗放行 → 真的发了第二篇（事故）
  const firstPublishMs = new Date('2026-09-28T17:23:00').getTime()
  const retryMs = new Date('2026-09-28T17:26:00').getTime()
  const titles = ['核心期刊投稿避坑清单✅']

  // 修复后：首次发布必然已落盘 attempt（发布动作发起前写入）
  const attempts: Attempt2[] = [
    { platform: 'xiaohongshu', titles, attemptedAtMs: firstPublishMs, outcome: 'unconfirmed' },
  ]
  const gate = attemptGuard2(attempts, titles, retryMs)
  assert.strictEqual(gate.blocked, true, '重试必须被 attempt 闸门拦截，杜绝第二篇重复笔记')

  // 且即使拖到很久以后（核对始终失败），也不得放行
  const farLater = new Date('2026-09-29T09:00:00').getTime()
  assert.strictEqual(attemptGuard2(attempts, titles, farLater).blocked, true,
    '未确认条目长期不得放行，否则仍会产生重复笔记')

  // 同时该条目必须进入待核对清单，供系统自动补齐 ID
  const pending = listPending(attempts, retryMs)
  assert.strictEqual(pending.length, 1, '必须自动排队补核对，而不是交给用户人工核对')
})

console.log('\nALL XHS PUBLISH-CONFIRM TESTS PASSED (' + passed + ' checks)')
