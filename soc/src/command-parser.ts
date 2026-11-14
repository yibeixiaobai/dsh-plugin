import { normalizePlatform, type Config, type Platform } from './config.ts'

export function enabledAccountIds(config: Config): string[] {
  const ids = Object.entries(config.accounts)
    .filter(([, profile]) => profile.enabled)
    .map(([id]) => id)
  // 严禁 fallback 到未开启账号；若无启用账号则返回空数组
  return [...ids].sort((left, right) =>
    Number(right === config.default_account) - Number(left === config.default_account) || left.localeCompare(right))
}

/** 支持以空格分割的平台识别词映射 */
export const PLATFORM_KEYWORD_MAP: Record<string, Platform | 'all'> = {
  zhihu: 'zhihu',
  知乎: 'zhihu',
  zh: 'zhihu',
  xiaohongshu: 'xiaohongshu',
  小红书: 'xiaohongshu',
  xhs: 'xiaohongshu',
  red: 'xiaohongshu',
  baijiahao: 'baijiahao',
  百家号: 'baijiahao',
  bjh: 'baijiahao',
  baidu: 'baijiahao',
  toutiao: 'toutiao',
  头条号: 'toutiao',
  今日头条: 'toutiao',
  tt: 'toutiao',
  gzh: 'gzh',
  wechat: 'gzh',
  wx: 'gzh',
  公众号: 'gzh',
  微信: 'gzh',
  微信公众号: 'gzh',
  all: 'all',
  全部: 'all',
  全平台: 'all',
  全量: 'all',
  社媒: 'all',
}

/**
 * 识别一个词是否指定了已知账号
 * 支持：
 * 1. 账号 ID（如 default, default-copy, baijiahao）
 * 2. 账号显示名称（如 前沿科技视界, 科技前沿2, 百家号）
 * 3. 逗号分隔的多个账号 ID 或名称（如 default,default-copy）
 */
export function matchAccountIds(config: Config, word: string): string[] | null {
  const cleaned = word.replace(/^[,，、]+|[,，、]+$/g, '').trim()
  if (!cleaned) return null

  const parts = cleaned.split(/[,，、]+/).map((item) => item.trim()).filter(Boolean)
  if (parts.length === 0) return null

  const resolvedIds: string[] = []
  for (const part of parts) {
    // 1. 按 ID 精确匹配
    if (config.accounts[part]) {
      resolvedIds.push(part)
      continue
    }
    // 2. 按 ID 忽略大小写匹配
    const matchedById = Object.keys(config.accounts).find((id) => id.toLowerCase() === part.toLowerCase())
    if (matchedById) {
      resolvedIds.push(matchedById)
      continue
    }
    // 3. 按账号显示名称 profile.name 精确或忽略大小写匹配
    const matchedByName = Object.entries(config.accounts).find(
      ([, profile]) => profile.name && (profile.name === part || profile.name.toLowerCase() === part.toLowerCase()),
    )
    if (matchedByName) {
      resolvedIds.push(matchedByName[0])
      continue
    }
    // 只要有一个 token 无法匹配为账号，则判定整体不是账号列表
    return null
  }

  return resolvedIds.length > 0 ? Array.from(new Set(resolvedIds)) : null
}

export interface ParsedCommand {
  accountIds: string[]
  request: string
  platform: Platform | 'all' | ''
}

/**
 * 严格以空格为识别符的命令参数解析器
 */
export function parseSpaceSeparatedInput(
  config: Config,
  rawInput: string,
  fixedPlatform?: Platform,
): ParsedCommand {
  const input = rawInput.trim()

  // 0. 富文本结构化 Prompt 解析支持（支持来自 UI Composer 卡片、选题确认卡片与发布审校卡片）
  if (
    input.includes('【发布平台】') ||
    input.includes('【执行账号】') ||
    input.includes('【执行账号ID列表】') ||
    input.includes('【定制要求') ||
    input.includes('【定题确认】') ||
    input.includes('【发布确认】')
  ) {
    let resolvedPlatform: Platform | 'all' | '' = fixedPlatform || ''
    const platformMatch = input.match(/【发布平台】[:：]?\s*([^\n\r]+)/)
    if (platformMatch) {
      const pText = platformMatch[1].trim()
      const pParts = pText.split(/[,，、\s/]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
      const mapped = pParts.map((p) => PLATFORM_KEYWORD_MAP[p]).filter(Boolean) as Array<Platform | 'all'>
      if (mapped.length === 1) {
        resolvedPlatform = mapped[0]
      } else if (mapped.length > 1) {
        resolvedPlatform = mapped.includes('all') ? 'all' : (mapped.every((p) => p === mapped[0]) ? mapped[0] : 'all')
      }
    }

    let parsedAccountIds: string[] = []
    // 优先从显式的【执行账号ID列表】提取
    const idListMatch = input.match(/【执行账号ID列表】[:：]?\s*([^\n\r]+)/)
    if (idListMatch) {
      const ids = idListMatch[1].split(/[,，、\s]+/).map((s) => s.trim()).filter(Boolean)
      for (const id of ids) {
        const matched = matchAccountIds(config, id)
        if (matched) parsedAccountIds.push(...matched)
      }
    }

    // 若未提取到，再尝试从【执行账号】提取类似 (ID: xxx) 或直接账号名
    if (parsedAccountIds.length === 0) {
      const accountNoticeMatch = input.match(/【执行账号】[:：]?\s*([^\n\r]+)/)
      if (accountNoticeMatch) {
        const text = accountNoticeMatch[1]
        // 匹配所有形如 [ID: xxx] 或 (ID: xxx)
        const idMatches = Array.from(text.matchAll(/(?:\[|\(|ID:|\s)\s*ID[:：\s]*([a-zA-Z0-9_-]+)/gi))
        for (const m of idMatches) {
          const matched = matchAccountIds(config, m[1])
          if (matched) parsedAccountIds.push(...matched)
        }
        // 如果依然为空且包含“全部已启用”，则按平台提取全部启用账号
        if (parsedAccountIds.length === 0 && (text.includes('全部') || text.includes('全选'))) {
          const pool = enabledAccountIds(config)
          parsedAccountIds = resolvedPlatform && resolvedPlatform !== 'all'
            ? pool.filter((id) => config.accounts[id]?.enabled && normalizePlatform(config.accounts[id].platform) === resolvedPlatform)
            : pool
        }
      }
    }

    // 针对【定题确认】与【发布确认】门禁交互指令的识别与账号匹配
    if (parsedAccountIds.length === 0 && (input.includes('【定题确认】') || input.includes('【发布确认】'))) {
      // 1. 优先从形如 【账号名称】 或 [ID: xxx] 提取精准账号
      const bracketMatches = Array.from(input.matchAll(/【([^】]+)】/g))
      for (const m of bracketMatches) {
        const textInBracket = m[1].trim()
        if (textInBracket === '定题确认' || textInBracket === '发布确认') continue
        const matched = matchAccountIds(config, textInBracket)
        if (matched) parsedAccountIds.push(...matched)
      }
      // 2. 若未提取到，匹配显式的账号 ID 与非平台泛称的真实名称
      if (parsedAccountIds.length === 0) {
        for (const [id, acc] of Object.entries(config.accounts)) {
          const idRegex = new RegExp(`\\b${id}\\b`, 'i')
          if (idRegex.test(input) || (acc.name && !PLATFORM_KEYWORD_MAP[acc.name.toLowerCase()] && input.includes(acc.name))) {
            parsedAccountIds.push(id)
          }
        }
      }
      for (const [kw, p] of Object.entries(PLATFORM_KEYWORD_MAP)) {
        if (p !== 'all' && input.toLowerCase().includes(kw.toLowerCase())) {
          resolvedPlatform = p
          break
        }
      }
    }

    parsedAccountIds = Array.from(new Set(parsedAccountIds))

    // 提取定制要求或门禁确认正文
    let requestText = ''
    const reqMatch = input.match(/【定制要求(?:与备注)?】[:：]?\s*([^\n\r]+)/)
    if (reqMatch) {
      const candidateReq = reqMatch[1].trim()
      if (!candidateReq.startsWith('（未指定特定要求') && !candidateReq.startsWith('(未指定特定要求')) {
        requestText = candidateReq
      }
    } else if (input.includes('【定题确认】') || input.includes('【发布确认】')) {
      requestText = input
    }

    if (parsedAccountIds.length > 0 || resolvedPlatform) {
      if (parsedAccountIds.length === 0) {
        const pool = enabledAccountIds(config)
        parsedAccountIds = resolvedPlatform && resolvedPlatform !== 'all'
          ? pool.filter((id) => config.accounts[id]?.enabled && normalizePlatform(config.accounts[id].platform) === resolvedPlatform)
          : pool
      }
      return {
        accountIds: parsedAccountIds,
        request: requestText,
        platform: resolvedPlatform,
      }
    }
  }

  // 1. 快捷指令（固定平台，如 /gzh、/zhihu 等）
  if (fixedPlatform) {
    const allInPlatform = enabledAccountIds(config).filter((id) =>
      config.accounts[id]?.enabled && normalizePlatform(config.accounts[id].platform) === fixedPlatform)

    if (!input) {
      return {
        accountIds: allInPlatform,
        request: '',
        platform: fixedPlatform,
      }
    }

    const tokens = input.split(/\s+/)
    const firstWord = tokens[0].toLowerCase()

    if (firstWord === 'all' || firstWord === '全部' || firstWord === '全量' || firstWord === '--all') {
      return {
        accountIds: allInPlatform,
        request: tokens.slice(1).join(' ').trim(),
        platform: fixedPlatform,
      }
    }

    const accList: string[] = []
    let tokenIdx = 0
    while (tokenIdx < tokens.length) {
      const matched = matchAccountIds(config, tokens[tokenIdx])
      if (matched) {
        accList.push(...matched)
        tokenIdx++
      } else {
        break
      }
    }
    if (accList.length > 0) {
      return {
        accountIds: Array.from(new Set(accList)),
        request: tokens.slice(tokenIdx).join(' ').trim(),
        platform: fixedPlatform,
      }
    }

    return {
      accountIds: allInPlatform,
      request: tokens.join(' ').trim(),
      platform: fixedPlatform,
    }
  }

  // 2. 通用发布命令（如 /publish）
  const allEnabledAccounts = enabledAccountIds(config)

  if (!input) {
    return {
      accountIds: allEnabledAccounts,
      request: '',
      platform: 'all',
    }
  }

  const tokens = input.split(/\s+/)
  const firstWord = tokens[0].toLowerCase()

  if (firstWord === 'all' || firstWord === '全部' || firstWord === '全平台' || firstWord === '全量' || firstWord === '--all') {
    return {
      accountIds: allEnabledAccounts,
      request: tokens.slice(1).join(' ').trim(),
      platform: 'all',
    }
  }

  const matchedPlatform = PLATFORM_KEYWORD_MAP[firstWord]
  if (matchedPlatform && matchedPlatform !== 'all') {
    const allInPlatform = enabledAccountIds(config).filter((id) =>
      config.accounts[id]?.enabled && normalizePlatform(config.accounts[id].platform) === matchedPlatform)

    if (tokens.length > 1) {
      const secondWord = tokens[1].toLowerCase()
      if (secondWord === 'all' || secondWord === '全部' || secondWord === '全量' || secondWord === '--all') {
        return {
          accountIds: allInPlatform,
          request: tokens.slice(2).join(' ').trim(),
          platform: matchedPlatform,
        }
      }
      const accList: string[] = []
      let tokenIdx = 1
      while (tokenIdx < tokens.length) {
        const matched = matchAccountIds(config, tokens[tokenIdx])
        if (matched) {
          accList.push(...matched)
          tokenIdx++
        } else {
          break
        }
      }
      if (accList.length > 0) {
        return {
          accountIds: Array.from(new Set(accList)),
          request: tokens.slice(tokenIdx).join(' ').trim(),
          platform: matchedPlatform,
        }
      }
    }

    return {
      accountIds: allInPlatform,
      request: tokens.slice(1).join(' ').trim(),
      platform: matchedPlatform,
    }
  }

  const accList: string[] = []
  let tokenIdx = 0
  while (tokenIdx < tokens.length) {
    const matched = matchAccountIds(config, tokens[tokenIdx])
    if (matched) {
      accList.push(...matched)
      tokenIdx++
    } else {
      break
    }
  }
  if (accList.length > 0) {
    const matchedPlatforms = accList.map((id) => config.accounts[id]?.platform).filter(Boolean)
    const firstPlatform = matchedPlatforms[0] as Platform | undefined
    const allSamePlatform = firstPlatform && matchedPlatforms.every((p) => p === firstPlatform)
    return {
      accountIds: Array.from(new Set(accList)),
      request: tokens.slice(tokenIdx).join(' ').trim(),
      platform: allSamePlatform ? firstPlatform : '',
    }
  }

  return {
    accountIds: allEnabledAccounts,
    request: tokens.join(' ').trim(),
    platform: '',
  }
}

/** 兼容旧版调用的别名函数 */
export const parseInput = parseSpaceSeparatedInput
