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
  return profile.platform === 'zhihu' ? 'zhihu' : profile.platform === 'xiaohongshu' ? 'xiaohongshu' : 'gzh'
}

export function platformLabel(platform: Platform | 'all' | ''): string {
  if (platform === 'zhihu') return '知乎'
  if (platform === 'xiaohongshu') return '小红书'
  if (platform === 'gzh') return '公众号'
  if (platform === 'all') return '全平台社媒'
  return '社媒'
}

/** 支持以空格分割的平台识别词映射 */
const PLATFORM_KEYWORD_MAP: Record<string, Platform | 'all'> = {
  zhihu: 'zhihu',
  知乎: 'zhihu',
  zh: 'zhihu',
  xiaohongshu: 'xiaohongshu',
  小红书: 'xiaohongshu',
  xhs: 'xiaohongshu',
  red: 'xiaohongshu',
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
 * 2. 账号显示名称（如 文映千秋学术网, 文映学术2, 百家号）
 * 3. 逗号分隔的多个账号 ID 或名称（如 default,default-copy）
 */
function matchAccountIds(config: Config, word: string): string[] | null {
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
 *
 * 核心调度原则：
 * 1. 默认行为：执行对应范围内的【全部已启用账号】（未指定范围则全平台全部启用，指定了社媒类型则该社媒全部启用）；
 * 2. 支持灵活指定：
 *    - 支持指定单独社媒类型（如 /publish zhihu、/publish gzh）：严格仅执行该平台的已启用账号，绝不跨平台执行；
 *    - 支持指定单独账号（账号名或账号ID，如 /publish 文映学术2、/publish default-copy）：严格仅执行该指定账号；
 *    - 支持指定社媒类型 + 指定账号（如 /publish gzh 文映学术2）：精确双重限定；
 *    - 支持指定多个特定账号（逗号分隔，如 /publish default,default-copy）；
 *    - 平台快捷指令（如 /gzh、/zhihu）：默认执行该平台全部已启用账号；若指定账号则严格仅执行该账号。
 */
export function parseSpaceSeparatedInput(
  config: Config,
  rawInput: string,
  fixedPlatform?: Platform,
): ParsedCommand {
  const input = rawInput.trim()

  // -------------------------------------------------------------
  // 1. 平台专属快捷命令（如 /zhihu 或 /gzh）
  // -------------------------------------------------------------
  if (fixedPlatform) {
    const allInPlatform = enabledAccountIds(config).filter((id) =>
      config.accounts[id]?.enabled && normalizePlatform(config.accounts[id]) === fixedPlatform)

    if (!input) {
      // 没输入内容，默认执行该平台全部已启用账号
      return {
        accountIds: allInPlatform,
        request: '',
        platform: fixedPlatform,
      }
    }

    const tokens = input.split(/\s+/)
    const firstWord = tokens[0].toLowerCase()

    // 显式 all 标识
    if (firstWord === 'all' || firstWord === '全部' || firstWord === '全量' || firstWord === '--all') {
      return {
        accountIds: allInPlatform,
        request: tokens.slice(1).join(' ').trim(),
        platform: fixedPlatform,
      }
    }

    // 检查首词是否是指定账号（账号 ID 或 中文名称）
    const matchedAccounts = matchAccountIds(config, tokens[0])
    if (matchedAccounts) {
      // 指定了具体账号，严格仅执行该指定账号！
      return {
        accountIds: matchedAccounts,
        request: tokens.slice(1).join(' ').trim(),
        platform: fixedPlatform,
      }
    }

    // 首词不是账号，说明整句都是选题/补充要求！
    // 默认执行该平台全部已启用的账号！
    return {
      accountIds: allInPlatform,
      request: tokens.join(' ').trim(),
      platform: fixedPlatform,
    }
  }

  // -------------------------------------------------------------
  // 2. 通用发布命令（如 /publish、/post）
  // -------------------------------------------------------------
  const allEnabledAccounts = enabledAccountIds(config)

  if (!input) {
    // 没输入任何参数，默认执行全平台全部已启用账号
    return {
      accountIds: allEnabledAccounts,
      request: '',
      platform: 'all',
    }
  }

  const tokens = input.split(/\s+/)
  const firstWord = tokens[0].toLowerCase()

  // 2.1 显式要求全平台广播执行：/publish all [选题要求]
  if (firstWord === 'all' || firstWord === '全部' || firstWord === '全平台' || firstWord === '全量' || firstWord === '--all') {
    return {
      accountIds: allEnabledAccounts,
      request: tokens.slice(1).join(' ').trim(),
      platform: 'all',
    }
  }

  // 2.2 检查首词是否是社媒平台词（如 zhihu / gzh / wechat 等）
  const matchedPlatform = PLATFORM_KEYWORD_MAP[firstWord]
  if (matchedPlatform && matchedPlatform !== 'all') {
    const allInPlatform = enabledAccountIds(config).filter((id) =>
      config.accounts[id]?.enabled && normalizePlatform(config.accounts[id]) === matchedPlatform)

    if (tokens.length > 1) {
      const secondWord = tokens[1].toLowerCase()
      // 第二词是 all：/publish gzh all [选题要求]
      if (secondWord === 'all' || secondWord === '全部' || secondWord === '全量' || secondWord === '--all') {
        return {
          accountIds: allInPlatform,
          request: tokens.slice(2).join(' ').trim(),
          platform: matchedPlatform,
        }
      }
      // 第二词是指定账号（账号 ID 或 中文名称）：/publish gzh 文映学术2 [选题要求]
      const secondAccounts = matchAccountIds(config, tokens[1])
      if (secondAccounts) {
        // 指定了具体账号，严格仅执行该指定账号！
        return {
          accountIds: secondAccounts,
          request: tokens.slice(2).join(' ').trim(),
          platform: matchedPlatform,
        }
      }
    }

    // 第二词不是账号，说明已指定单独社媒类型，选题从 token[1...] 开始！
    // 默认执行该社媒类型下全部已启用的账号（绝不跨平台执行）！
    return {
      accountIds: allInPlatform,
      request: tokens.slice(1).join(' ').trim(),
      platform: matchedPlatform,
    }
  }

  // 2.3 检查首词是否直接指定了账号（账号 ID 或 中文名称）：/publish 文映学术2 [选题要求]
  const matchedAccounts = matchAccountIds(config, tokens[0])
  if (matchedAccounts) {
    const firstPlatform = normalizePlatform(config.accounts[matchedAccounts[0]])
    // 指定了具体账号，严格仅执行该指定账号！
    return {
      accountIds: matchedAccounts,
      request: tokens.slice(1).join(' ').trim(),
      platform: matchedAccounts.length === 1 ? firstPlatform : '',
    }
  }

  // 2.4 首词既不是平台也不是账号，整句均为选题/补充要求！
  // 默认执行全平台全部已启用账号！
  return {
    accountIds: allEnabledAccounts,
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
  const scope = scopeLabel(config, accountIds, '') + '生产与发布任务'
  const lines: string[] = [
    '立即执行' + scope +
      (isMultiAccount ? '（多账号批量任务：支持多 Agent 并行或隔离独立推进）' : '（单账号专属执行：严格仅针对目标账号进行查重、撰写、配图与发布，切勿涉及其它无关账号）') + '。',
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
  } else {
    lines.push('1. 单账号专属执行：当前为单个指定账号执行任务，流程仅针对本账号推进，严禁擅自切换或涉及其它账号。')
  }
  lines.push(
    '2. 规范驱动与优先级：每个账号必须首先调用 gzh_get_style_guide 获取该账号生效的基础配置与排版规范。注意：若本次任务包含补充要求或用户附件，补充要求与附件具有第一最高优先级，优先覆盖对应配置（例如：用户指定了特定选题或提供了参考材料则必须写对应内容，不再从默认 topics 抽取；用户指定了篇数或形态则按补充要求执行；用户指定了特定主题则按指定主题撰写）；未冲突的基础排版与安全规范（单行HTML、禁词、生图比例等）严格按返回值执行。',
    '3. 标准流水线步骤：',
    '   - 搜索与热点选题（动态雷达）：确立选题是内容生产的第一步！',
    '     * 若用户在补充要求中已明确指定选题，则直接使用用户指定的选题；亦可调用 gzh_discover_topics 拓展该选题下的最佳爆款切角；',
    '     * 若用户未指定具体选题，宿主环境具备网络搜索工具（如 search_web）时，可先围绕账号关键词搜索当前最新的行业政策通知、预警动态或热搜事件；随后必须调用 gzh_discover_topics（可传入搜索摘要 search_snippets）综合全网搜索下拉、行业时令日历与5大爆款切角（政策解读/痛点避坑/保姆清单/认知反转/实用工具），智能获取高评分候选选题；',
    '   - 查重与句式把关：将确立的候选选题提交 gzh_check_topics 进行历史相似度与同批次句式查重，若遇 high 风险重复或冒号前缀违规，根据提示自愈更换；',
    '   - 构建：根据规范、补充要求及附件材料撰写充实内容，调用 gzh_build_article 构建（公众号产出单行 HTML，知乎专栏产出富文本与封面，小红书产出原生合规文案）。',
    '   - 强制生图：必须完整调用 gzh_generate_images 生成全新图片（长文封面与配图、小绿书 3:4 竖版卡片），严禁复用旧图或跳过生图。',
    '   - 校验：调用 gzh_validate_html 进行合规校验，发现问题修复后复检。',
    '   - 草稿发布：调用 gzh_publish_draft 创建草稿（每个形态严格仅需调用 1 次，返回 media_id 或链接即代表完成）。若账号配置了 auto_enable_original=true，发布工具会自动通过浏览器模拟开启文字原创声明并保存草稿，无需额外操作。',
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
      text: '没有可用的' + platformLabel(parsed.platform) + '账号（当前启用：公众号 ' + enabledCount('gzh') +
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

  const isSingle = accounts.length === 1
  const modeTag = isSingle ? `[单账号专属]` : `[批量执行(${accounts.length}个账号)]`
  const attachmentNotice = attachmentCount > 0 ? ` [含 ${attachmentCount} 个附件]` : ''

  invocation.agent.followup(createUserMessage({
    content: contentBlocks,
    source: {
      kind: 'producer',
      plugin: PLUGIN_NAME,
      form: 'notice',
      summary: `${modeTag} 已启动${scope}任务（${accounts.map((account) => account.profile.name).join('、')}）${attachmentNotice}`,
    },
  }))

  const targetListText = accounts
    .map((account) => `${account.profile.name}（平台: ${platformLabel(normalizePlatform(account.profile))} | 账号ID: ${account.id}）`)
    .join('\n  • ')

  const hintTip = isSingle
    ? '\n提示：当前已锁定指定账号执行。如需执行全部启用账号，请直接使用缺省命令（如 /publish [要求] 或 /gzh [要求]）。'
    : '\n提示：当前默认执行范围内的全部已启用账号。如需指定单独社媒类型或单独账号，可在命令中指定（例如：/publish gzh [要求] 或 /publish ' + accounts[0].profile.name + ' [要求]）。'

  return {
    kind: 'success',
    text: `已启动${scope}生产发布任务 ${modeTag}：\n  • ${targetListText}` +
      (parsed.request ? `\n补充要求：${parsed.request}` : '') +
      (attachmentCount > 0 ? `\n已接收附件：${attachmentCount} 个文件/图片` : '') +
      hintTip +
      '\n流水线将在后台自动化执行，请稍候查看产出汇总。',
  }
}

/** 注册社媒通用更新指令集（以空格为识别符） */
export function registerQuickCommand(ctx: Context, config: Config): void {
  // 1. 通用主发布指令：/publish
  ctx.commands.register({
    name: 'publish',
    description: '启动社媒发布任务（默认执行全部已启用；支持指定社媒类型、账号名/ID，空格分割）',
    input: {
      hint: '[社媒类型|账号名|账号ID] [选题/补充要求]',
      attachments: true,
    },
    handler(invocation) {
      return handleCommandInvocation(config, invocation, { commandName: 'publish' })
    },
  })

  // 2. 通用发布简写别名：/post
  ctx.commands.register({
    name: 'post',
    description: '启动社媒发布任务（默认执行全部已启用；支持指定社媒类型、账号名/ID，空格分割）',
    input: {
      hint: '[社媒类型|账号名|账号ID] [选题/补充要求]',
      attachments: true,
    },
    handler(invocation) {
      return handleCommandInvocation(config, invocation, { commandName: 'post' })
    },
  })

  // 3. 知乎专属快捷指令：/zhihu
  ctx.commands.register({
    name: 'zhihu',
    description: '知乎专栏发布任务（默认执行全部知乎已启用账号；可指定账号名/ID，空格分割）',
    input: {
      hint: '[账号名|账号ID] [选题/补充要求]',
      attachments: true,
    },
    handler(invocation) {
      return handleCommandInvocation(config, invocation, { fixedPlatform: 'zhihu', commandName: 'zhihu' })
    },
  })

  // 4. 微信公众号快捷与兼容指令：/gzh
  ctx.commands.register({
    name: 'gzh',
    description: '微信公众号发布任务（默认执行全部公众号已启用账号；可指定账号名/ID，空格分割）',
    input: {
      hint: '[账号名|账号ID] [选题/补充要求]',
      attachments: true,
    },
    handler(invocation) {
      return handleCommandInvocation(config, invocation, { fixedPlatform: 'gzh', commandName: 'gzh' })
    },
  })

  // 5. 小红书快捷指令：/xiaohongshu
  ctx.commands.register({
    name: 'xiaohongshu',
    description: '小红书发布任务（默认执行全部小红书已启用账号；可指定账号名/ID，空格分割）',
    input: {
      hint: '[账号名|账号ID] [选题/补充要求]',
      attachments: true,
    },
    handler(invocation) {
      return handleCommandInvocation(config, invocation, { fixedPlatform: 'xiaohongshu', commandName: 'xiaohongshu' })
    },
  })

  // 6. 社媒发布工作台卡片入口指令：/publish-config
  ctx.commands.register({
    name: 'publish-config',
    description: '查看社媒发布工作台卡片入口与使用指引',
    handler() {
      return {
        kind: 'success',
        text: '### 社媒发布控制台卡片\n\n' +
          '当前配置已脱离 DSH 全局设置弹窗，升级为独立的页面卡片模式。\n\n' +
          '**入口方式：**\n' +
          '- **左侧边栏底部**：点击底栏「社媒发布」常驻按钮；\n' +
          '- **会话窗口顶部**：点击顶部栏「社媒发布」快捷按钮；\n' +
          '- **插件管理页**：进入「插件」列表中点击本插件卡片即可展开完整配置界面。\n\n' +
          '模块涵盖：发表批次记录、微信与知乎多账号矩阵、视觉排版规则、生图接口池与配置导入导出。',
      }
    },
  })
}
