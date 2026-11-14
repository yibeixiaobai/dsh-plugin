// 微信公众号草稿箱页面高保真 HTML 解析器
// 支持解析微信官方 WeUI Desktop 瀑布流（weui-desktop-masonry-list）中的多图文、单图文及小绿书草稿卡片
import * as cheerio from 'cheerio'

export interface WechatDraftItem {
  title: string
  cover_url: string
  digest?: string
  author?: string
  is_first?: boolean
}

export interface WechatDraftCard {
  id: string
  account_id: string
  appmsgid: string
  article_type: 'news' | 'newspic'
  update_time_str: string
  updated_at: number
  is_complete: boolean
  incomplete_reason?: string
  can_publish: boolean
  articles: WechatDraftItem[]
  synced_at: string
}

/** 从 background-image 提取纯净图片 URL */
function extractBackgroundImageUrl(styleStr?: string): string {
  if (!styleStr) return ''
  const m = styleStr.match(/background-image:\s*url\((?:&quot;|["'])?(.*?)(?:&quot;|["'])?\)/i)
  if (m && m[1]) {
    return m[1].replace(/&amp;/g, '&').trim()
  }
  return ''
}

/** 解析自然语言时间（如 "更新于 04:27", "更新于 昨天 13:23", "更新于 2026-10-08 14:00"）为时间戳 */
export function parseWechatUpdateTime(timeStr: string, referenceDate = new Date()): { timeText: string; timestamp: number } {
  const clean = (timeStr || '').replace(/^更新于\s*/, '').trim()
  const now = new Date(referenceDate)

  // 格式 1：HH:mm（今天时间）
  const todayMatch = clean.match(/^(\d{1,2}):(\d{2})$/)
  if (todayMatch) {
    const d = new Date(now)
    d.setHours(parseInt(todayMatch[1], 10), parseInt(todayMatch[2], 10), 0, 0)
    return { timeText: clean, timestamp: d.getTime() }
  }

  // 格式 2：昨天 HH:mm
  const yesterdayMatch = clean.match(/^昨天\s+(\d{1,2}):(\d{2})$/)
  if (yesterdayMatch) {
    const d = new Date(now)
    d.setDate(d.getDate() - 1)
    d.setHours(parseInt(yesterdayMatch[1], 10), parseInt(yesterdayMatch[2], 10), 0, 0)
    return { timeText: clean, timestamp: d.getTime() }
  }

  // 格式 3：前天 HH:mm
  const beforeYesterdayMatch = clean.match(/^前天\s+(\d{1,2}):(\d{2})$/)
  if (beforeYesterdayMatch) {
    const d = new Date(now)
    d.setDate(d.getDate() - 2)
    d.setHours(parseInt(beforeYesterdayMatch[1], 10), parseInt(beforeYesterdayMatch[2], 10), 0, 0)
    return { timeText: clean, timestamp: d.getTime() }
  }

  // 格式 4：MM月dd日 HH:mm 或 YYYY-MM-DD
  const dateMatch = clean.match(/^(?:(\d{4})[-/年])?(\d{1,2})[-/月](\d{1,2})日?\s*(\d{1,2})?:?(\d{2})?$/)
  if (dateMatch) {
    const year = dateMatch[1] ? parseInt(dateMatch[1], 10) : now.getFullYear()
    const month = parseInt(dateMatch[2], 10) - 1
    const day = parseInt(dateMatch[3], 10)
    const hour = dateMatch[4] ? parseInt(dateMatch[4], 10) : 0
    const minute = dateMatch[5] ? parseInt(dateMatch[5], 10) : 0
    const d = new Date(year, month, day, hour, minute, 0, 0)
    return { timeText: clean, timestamp: d.getTime() }
  }

  return { timeText: clean || '未知时间', timestamp: now.getTime() }
}

/**
 * 高保真解析微信公众号草稿箱页面的 HTML
 * 提取瀑布流中的所有草稿卡片（包括多图文、单图文以及内容不完整状态）
 */
export function parseWechatDraftsHtml(
  html: string,
  accountId = 'default',
  referenceDate = new Date(),
): WechatDraftCard[] {
  if (!html || typeof html !== 'string') return []
  const $ = cheerio.load(html)
  const cards: WechatDraftCard[] = []
  const seenIds = new Set<string>()

  // 微信草稿箱卡片容器
  $('.weui-desktop-card.weui-desktop-publish').each((_, el) => {
    const $card = $(el)
    const appmsgid =
      $card.attr('data-appid') ||
      $card.attr('data-appmsgid') ||
      $card.closest('[data-appid]').attr('data-appid') ||
      $card.closest('[data-appmsgid]').attr('data-appmsgid') ||
      ''

    if (!appmsgid || seenIds.has(appmsgid)) return
    seenIds.add(appmsgid)

    // 1. 解析主头条文章（第 1 篇）
    const articles: WechatDraftItem[] = []
    const $mainCover = $card.find('.weui-desktop-publish__cover-item')
    const mainTitle =
      $mainCover.find('.weui-desktop-publish__cover__title span, .weui-desktop-publish__cover__title_pic span').first().text().trim() ||
      $mainCover.find('.weui-desktop-publish__cover__title, .weui-desktop-publish__cover__title_pic').first().text().trim() ||
      '无标题'

    const mainCoverStyle = $mainCover.find('.weui-desktop-publish__cover__thumb').attr('style') || ''
    const mainCoverUrl = extractBackgroundImageUrl(mainCoverStyle)

    articles.push({
      title: mainTitle,
      cover_url: mainCoverUrl,
      is_first: true,
    })

    // 2. 解析多图文子项列表（第 2 ~ 8 篇）
    $card.find('.sub_card_media').each((__, subEl) => {
      const $sub = $(subEl)
      const subTitle =
        $sub.find('.weui-desktop-publish__title span').first().text().trim() ||
        $sub.find('.weui-desktop-publish__title').first().text().trim() ||
        '无标题'
      const subCoverStyle = $sub.find('.weui-desktop-publish__thumb').attr('style') || ''
      const subCoverUrl = extractBackgroundImageUrl(subCoverStyle)

      articles.push({
        title: subTitle,
        cover_url: subCoverUrl,
        is_first: false,
      })
    })

    // 3. 判断是否可发表及完整性状态
    // 若存在 appmsg_publish_disable 或 publish_disable_button，说明内容不完整无法发表
    const hasDisableBtn = $card.find('.appmsg_publish_disable, .publish_disable_button, .weui-desktop-link_disable').length > 0
    const hasEnableBtn = $card.find('.publish_enable_button').length > 0
    const canPublish = hasEnableBtn && !hasDisableBtn

    let isComplete = true
    let incompleteReason: string | undefined

    if (hasDisableBtn) {
      isComplete = false
      // 提取警告描述
      const warnDesc = $card
        .find('.weui-desktop-tips .weui-desktop-popover__desc, .appmsg_publish_disable .weui-desktop-tooltip')
        .text()
        .trim()
        .replace(/\s+/g, ' ')
      incompleteReason = warnDesc || '图文内容不完整，无法发表'
    }

    // 若主图文封面为空且标题为默认/占位符，进一步确认完整性
    if (!mainCoverUrl && (!mainTitle || mainTitle.includes('TEMPLATE'))) {
      isComplete = false
      if (!incompleteReason) incompleteReason = '请补充封面图或标题'
    }

    // 4. 解析更新时间
    // 微信时间节点形如：<div class="weui-desktop-publish__tips">更新于 04:27</div>
    const tipsText = $card.find('.weui-desktop-publish__tips').clone().children().remove().end().text().trim()
    const { timeText, timestamp } = parseWechatUpdateTime(tipsText, referenceDate)

    // 5. 判断文章类型 (news: 长文/多图文, newspic: 小绿书/贴图)
    // 微信官方特征规则：
    // 贴图特征：
    // - 卡片含有 .weui-desktop-publish__cover-item_pic
    // - 卡片底栏含有 .weui-desktop-card__ft_pic-draft
    // - 标题含有 .weui-desktop-publish__cover__title_pic
    // - 封面具有 3:4 比例类 .is_3_4_cover__thumb 或缩略图包裹层 .vertical_splice
    // - 所在面板当前 Tab 为「贴图」
    const isNewspicByCard =
      $card.find('.weui-desktop-publish__cover-item_pic, .weui-desktop-card__ft_pic-draft, .weui-desktop-publish__cover__title_pic, .is_3_4_cover__thumb, .vertical_splice').length > 0 ||
      $card.hasClass('weui-desktop-publish_newspic') ||
      $card.find('.icon-svg-editor-tietu').length > 0
    const isInPicTab = $card.closest('.weui-desktop-panel').find('.header_button.currentTab').text().includes('贴图')

    const isNewspic = isNewspicByCard || isInPicTab

    cards.push({
      id: appmsgid,
      account_id: accountId,
      appmsgid,
      article_type: isNewspic ? 'newspic' : 'news',
      update_time_str: tipsText || timeText,
      updated_at: timestamp,
      is_complete: isComplete,
      incomplete_reason: incompleteReason,
      can_publish: canPublish,
      articles,
      synced_at: new Date(referenceDate).toISOString(),
    })
  })

  return cards
}
