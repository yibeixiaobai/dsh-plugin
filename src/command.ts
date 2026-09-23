import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Config, Platform } from './config.ts'
import { resolveAccount } from './config-runtime.ts'

export const PLUGIN_NAME = 'dsh-social-publisher'

function enabledAccountIds(config: Config): string[] {
  const ids = Object.entries(config.accounts)
    .filter(([, profile]) => profile.enabled)
    .map(([id]) => id)
  const pool = ids.length > 0 ? ids : Object.keys(config.accounts)
  // 默认账号排最前，其余按 ID 稳定排序
  return [...pool].sort((left, right) =>
    Number(right === config.default_account) - Number(left === config.default_account) || left.localeCompare(right))
}

function normalizePlatform(profile: { platform?: string }): Platform {
  return profile.platform === 'zhihu' ? 'zhihu' : 'gzh'
}

export function platformLabel(platform: Platform | 'all' | ''): string {
  if (platform === 'zhihu') return '知乎'
  if (platform === 'gzh') return '公众号'
  if (platform === 'all') return '全平台社媒'
  return '社媒'
}

/** 支持以空格分割的平台识别词映射 */
const PLATFORM_KEYWORD_MAP: Record<string, Platform | 'all'> = {
  zhihu: 'zhihu',
  知乎: 'zhihu',
  zh: 'zhihu',
  gzh: 'gzh',
  wechat: 'gzh',
  wx: 'gzh',
  公众号: 'gzh',
  微信: 'gzh',
  微信公众号: 'gzh',
  all: 'all',
  全部: 'all',
  全平台: 'all',
  社媒: 'all',
}

/** 识别一个词是否由一个或多个已知 account_id 组成（支持逗号分隔多账号） */
function matchAccountIds(config: Config, word: string): string[] | null {
  const cleaned = word.replace(/^[,，、]+|[,，、]+$/g, '')
  if (!cleaned) return null
  const ids = cleaned.split(/[,，、]+/).map((id) => id.trim()).filter(Boolean)
  if (ids.length > 0 && ids.every((id) => Boolean(config.accounts[id]))) {
    return ids
  }
  return null
}

export interface ParsedCommand {
  accountIds: string[]
  request: string
  platform: Platform | 'all' | ''
}

/**
 * 严格以空格为识别符的命令参数解析器
 *
 * 语法格式：
 *   /publish [平台|all] [账号] [选题与补充要求...]
 *
 * 解析流程：
 * 1. 将输入按连续空白字符切割成 tokens。
 * 2. 若指定了 fixedPlatform（如调用 /zhihu 或 /gzh），锁定该平台；检查首个 token 是否为账号 ID，其余为 request。
 * 3. 未指定 fixedPlatform 时：
 *    - 检查 token[0] 是否为平台词（zhihu / gzh / all 等）：
 *      - 若是，平台锁定；进一步检查 token[1] 是否为账号 ID：
 *        - 若是账号 ID，目标账号即为该账号，token[2...] 组合为补充要求。
 *        - 若不是账号 ID，目标账号取该平台全部启用账号，token[1...] 组合为补充要求。
 *    - 检查 token[0] 是否为账号 ID：
 *      - 若是，目标账号锁定为该账号，token[1...] 组合为补充要求。
 *    - 若既不是平台词也不是账号 ID：
 *      - 目标账号为全平台所有启用账号，全部输入直接作为补充要求。
 */
export function parseSpaceSeparatedInput(
  config: Config,
  rawInput: string,
  fixedPlatform?: Platform,
): ParsedCommand {
  const input = rawInput.trim()
  if (!input) {
    if (fixedPlatform) {
      const accountIds = enabledAccountIds(config).filter((id) =>
        config.accounts[id]?.enabled && normalizePlatform(config.accounts[id]) === fixedPlatform)
      return { accountIds, request: '', platform: fixedPlatform }
    }
    return { accountIds: enabledAccountIds(config), request: '', platform: '' }
  }

  const tokens = input.split(/\s+/)

  // 1. 如果是固定平台命令（如 /zhihu 或 /gzh）
  if (fixedPlatform) {
    const matchedAccounts = matchAccountIds(config, tokens[0])
    if (matchedAccounts) {
      return {
        accountIds: matchedAccounts,
        request: tokens.slice(1).join(' ').trim(),
        platform: fixedPlatform,
      }
    }
    // 首词不是账号，则全部 tokens 都是请求要求，账号取该平台全部已启用账号
    const accountIds = enabledAccountIds(config).filter((id) =>
      config.accounts[id]?.enabled && normalizePlatform(config.accounts[id]) === fixedPlatform)
    return {
      accountIds,
      request: tokens.join(' ').trim(),
      platform: fixedPlatform,
    }
  }

  // 2. 通用命令（如 /publish、/post）：以空格检查首词
  const firstWord = tokens[0].toLowerCase()
  const matchedPlatform = PLATFORM_KEYWORD_MAP[firstWord]

  if (matchedPlatform) {
    // 首词是平台词
    if (matchedPlatform === 'all') {
      return {
        accountIds: enabledAccountIds(config),
        request: tokens.slice(1).join(' ').trim(),
        platform: 'all',
      }
    }

    // 针对具体平台（zhihu / gzh），检查第二个词是否指定了账号
    if (tokens.length > 1) {
      const secondWordAccounts = matchAccountIds(config, tokens[1])
      if (secondWordAccounts) {
        return {
          accountIds: secondWordAccounts,
          request: tokens.slice(2).join(' ').trim(),
          platform: matchedPlatform,
        }
      }
    }

    // 第二个词不是账号，取该平台所有启用的账号
    const accountIds = enabledAccountIds(config).filter((id) =>
      config.accounts[id]?.enabled && normalizePlatform(config.accounts[id]) === matchedPlatform)
    return {
      accountIds,
      request: tokens.slice(1).join(' ').trim(),
      platform: matchedPlatform,
    }
  }

  // 3. 首词不是平台词，检查首词是否是账号 ID
  const matchedAccounts = matchAccountIds(config, tokens[0])
  if (matchedAccounts) {
    const firstPlatform = normalizePlatform(config.accounts[matchedAccounts[0]])
    return {
      accountIds: matchedAccounts,
      request: tokens.slice(1).join(' ').trim(),
      platform: matchedAccounts.length === 1 ? firstPlatform : '',
    }
  }

  // 4. 首词既不是平台也不是账号，整句均为补充要求，广播给所有启用账号
  return {
    accountIds: enabledAccountIds(config),
    request: tokens.join(' ').trim(),
    platform: '',
  }
}

/** 兼容旧版调用的别名函数 */
export const parseInput = parseSpaceSeparatedInput

/** 任务范围文案：显式平台 → 平台名；未指定时按所选账号实际平台（单一 → 平台名，混合 → 通用社媒） */
function scopeLabel(config: Config, accountIds: string[], platform: Platform | 'all' | ''): string {
  if (platform && platform !== 'all') return platformLabel(platform)
  const platforms = new Set(accountIds.map((id) => normalizePlatform(config.accounts[id])))
  if (platforms.size === 1) {
    return platformLabel(platforms.values().next().value!)
  }
  return '社媒多平台'
}

/** 任务调度提示词：保持高阶流程调度与安全隔离，补充要求为第一最高优先级，排版与校验基础规范由 gzh_get_style_guide 统一提供 */
export function taskPrompt(config: Config, accountIds: string[], request: string, attachmentCount = 0): string {
  const isMultiAccount = accountIds.length > 1
  const scope = scopeLabel(config, accountIds, '') + '日常生产与发布任务'
  const lines: string[] = [
    '立即执行' + scope +
      (isMultiAccount ? '（多账号/多平台任务：支持多 Agent 并行或隔离独立推进）' : '') + '。',
    '目标账号列表：' + accountIds.map((id) => `${config.accounts[id]?.name || id}（${platformLabel(normalizePlatform(config.accounts[id]))}，account_id: ${id}）`).join('、') + '。',
    '调用所有支持 account_id 的工具时必须显式传入当前账号的 account_id。',
  ]

  if (request || attachmentCount > 0) {
    lines.push('')
    lines.push('============================================================')
    lines.push('【本次任务补充要求与参考附件（第一最高优先级）】')
    if (request) {
      lines.push('【文字补充要求】：' + request)
    }
    if (attachmentCount > 0) {
      lines.push(`【用户上传附件】：本次任务随指令上传了 ${attachmentCount} 个附件（参考文档/图片/素材等）。`)
    }
    lines.push('【最高第一优先级执行原则】：本次补充要求与用户上传附件拥有最高裁决权，绝不能被账号默认配置要求覆盖！当补充要求与账号默认配置（如预设业务关键词 topics、默认篇数 articles_per_day、默认主题 theme、字数下限、文章形态、配图要求等）存在冲突或差异时，必须无条件以本次补充要求及附件内容为最高准则执行！未在补充要求中提及的通用底层技术规范（如发布前查重防重复发布、禁词合规、图片尺寸比例、单行 HTML 零换行等）继续严格遵循。')
    lines.push('============================================================')
  }

  lines.push('')
  lines.push('【调度纪律与执行流程】')
  if (isMultiAccount) {
    lines.push('1. 多账号并行隔离：检测到当前任务包含多个账号，系统已提供 subagent 工具时，主 Agent 必须优先调用 subagent 工具，分别为每个账号独立派生 1 个子 Agent 并行执行完整流水线（查重 → 获取规范 → 写文构建 → 生图 → 校验 → 发布），以保持上下文隔离并大幅提速。主 Agent 负责汇总各账号结果。')
  }
  lines.push(
    '2. 规范驱动与优先级：每个账号必须首先调用 gzh_get_style_guide 获取该账号生效的基础配置与排版规范。注意：若本次任务包含补充要求或用户附件，补充要求与附件具有第一最高优先级，优先覆盖对应配置（例如：用户指定了特定选题或提供了参考材料则必须写对应内容，不再从默认 topics 抽取；用户指定了篇数或形态则按补充要求执行；用户指定了特定主题则按指定主题撰写）；未冲突的基础排版与安全规范（单行HTML、禁词、生图比例等）严格按返回值执行。',
    '3. 标准流水线步骤：',
    '   - 查重：调用 gzh_check_topics 围绕选题查重。若用户在补充要求中已指定特定选题，查重旨在排查是否与历史已发草稿完全重复（防历史重复发同一篇）；若仅为关键词重合或前缀告警，因属于用户明确指定的补充要求，以用户要求为准，切勿擅自篡改或替换用户的选题方向。',
    '   - 构建：根据规范、补充要求及附件材料撰写充实内容，调用 gzh_build_article 构建（公众号产出单行 HTML，知乎专栏产出富文本与封面）。',
    '   - 强制生图：必须完整调用 gzh_generate_images 生成全新图片（长文封面与配图、小绿书 3:4 竖版卡片），严禁复用旧图或跳过生图。',
    '   - 校验：调用 gzh_validate_html 进行合规校验，发现问题修复后复检。',
    '   - 草稿发布：调用 gzh_publish_draft 创建草稿（每个形态严格仅需调用 1 次，返回 media_id 或链接即代表完成）。',
    '4. 纯工具流与结果汇总：严禁在会话回复中打印文章正文草稿、Markdown 文本、单行 HTML 或生图提示词全文，以避免泄露内容与浪费 Token。仅输出单行进度提示，全部账号执行完毕后输出包含选题/标题、草稿 media_id 或链接、执行状态的 Markdown 汇总表格。',
  )

  return lines.join('\n')
}

interface CommandExecutionOptions {
  fixedPlatform?: Platform
  commandName: string
}

function handleCommandInvocation(
  config: Config,
  invocation: { rawInput: string; attachments?: readonly unknown[]; agent: { followup: (msg: unknown) => void } },
  options: CommandExecutionOptions,
): { kind: 'success'; text: string } | { kind: 'error'; text: string } {
  const parsed = parseSpaceSeparatedInput(config, invocation.rawInput, options.fixedPlatform)
  if (parsed.platform && parsed.platform !== 'all' && parsed.accountIds.length === 0) {
    const enabledCount = (p: Platform) => Object.values(config.accounts)
      .filter((profile) => profile.enabled && normalizePlatform(profile) === p).length
    return {
      kind: 'error',
      text: '没有启用中的' + platformLabel(parsed.platform) + '账号（当前启用：公众号 ' + enabledCount('gzh') +
        ' 个、知乎 ' + enabledCount('zhihu') + ' 个）。请先在社媒设置中启用对应平台的账号。',
    }
  }

  if (parsed.accountIds.length === 0) {
    return {
      kind: 'error',
      text: '当前没有启用任何社媒账号，请先在插件设置中添加并启用至少一个账号（公众号或知乎）。',
    }
  }

  const accounts = []
  try {
    for (const id of parsed.accountIds) accounts.push(resolveAccount(config, id))
  } catch (error) {
    return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
  }

  const rawAttachments = (Array.isArray(invocation.attachments) ? invocation.attachments : []) as Array<{ type: string; [key: string]: unknown }>
  const attachmentCount = rawAttachments.length
  const scope = scopeLabel(config, accounts.map((account) => account.id), parsed.platform)
  const promptText = taskPrompt(config, accounts.map((account) => account.id), parsed.request, attachmentCount)

  const contentBlocks: Array<{ type: string; [key: string]: unknown }> = [
    { type: 'text', text: promptText },
    ...rawAttachments,
  ]

  const attachmentNotice = attachmentCount > 0 ? ` [含 ${attachmentCount} 个附件]` : ''
  invocation.agent.followup(createUserMessage({
    content: contentBlocks,
    source: {
      kind: 'plugin',
      plugin: PLUGIN_NAME,
      form: 'notice',
      summary: '已启动' + scope + '任务（' + accounts.map((account) => account.profile.name).join('、') + '）' + attachmentNotice,
    },
  }))
  return {
    kind: 'success',
    text: '已启动' + scope + '生产发布任务：' + accounts.map((account) => `${account.profile.name}（${platformLabel(normalizePlatform(account.profile))} / ${account.id}）`).join('、') +
      (parsed.request ? `\n补充要求：${parsed.request}` : '') +
      (attachmentCount > 0 ? `\n已接收附件：${attachmentCount} 个文件/图片` : '') +
      '\n流水线将在后台自动化执行，请稍候查看产出汇总。',
  }
}

/** 注册社媒通用更新指令集（以空格为识别符） */
export function registerQuickCommand(ctx: Context, config: Config): void {
  // 1. 通用主发布指令：/publish
  ctx.commands.register({
    name: 'publish',
    description: '启动社媒更新发布任务（以空格分割参数：[平台|all] [账号] [补充要求]，支持上传参考附件）',
    input: {
      hint: '[zhihu|gzh|all] [account_id] [补充要求/选题]',
      attachments: true,
    },
    handler(invocation) {
      return handleCommandInvocation(config, invocation, { commandName: 'publish' })
    },
  })

  // 2. 通用发布简写别名：/post
  ctx.commands.register({
    name: 'post',
    description: '启动社媒更新发布任务（以空格分割参数：[平台|all] [账号] [补充要求]）',
    input: {
      hint: '[zhihu|gzh|all] [account_id] [补充要求/选题]',
      attachments: true,
    },
    handler(invocation) {
      return handleCommandInvocation(config, invocation, { commandName: 'post' })
    },
  })

  // 3. 知乎专属快捷指令：/zhihu
  ctx.commands.register({
    name: 'zhihu',
    description: '启动知乎专栏内容生成与发布任务（以空格分割参数：[账号ID] [补充要求/选题]）',
    input: {
      hint: '[account_id] [补充要求/选题]',
      attachments: true,
    },
    handler(invocation) {
      return handleCommandInvocation(config, invocation, { fixedPlatform: 'zhihu', commandName: 'zhihu' })
    },
  })

  // 4. 微信公众号快捷与兼容指令：/gzh
  ctx.commands.register({
    name: 'gzh',
    description: '启动微信公众号内容生成与发布任务（以空格分割参数：[账号ID] [补充要求/选题]）',
    input: {
      hint: '[account_id] [补充要求/选题]',
      attachments: true,
    },
    handler(invocation) {
      return handleCommandInvocation(config, invocation, { fixedPlatform: 'gzh', commandName: 'gzh' })
    },
  })
}
