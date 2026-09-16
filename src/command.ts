import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Config, Platform } from './config.ts'
import { resolveAccount } from './config-runtime.ts'

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

function platformLabel(platform: Platform): string {
  return platform === 'zhihu' ? '知乎' : '公众号'
}

// 平台过滤词：/gzh 知乎 [补充要求] 只跑该平台的启用账号；账号 ID 优先于平台词（账号可以叫 gzh/zhihu）
const PLATFORM_WORDS: Array<[RegExp, Platform]> = [
  [/^(?:知乎|zhihu)$/i, 'zhihu'],
  [/^(?:公众号|微信公众号|微信|gzh|wechat)$/i, 'gzh'],
]
// 无空格写法的中文平台词前缀（"知乎：聚焦xxx"、"[知乎]xxx" 去包裹后同理）；只认紧跟闭括号/标点或结尾，
// "公众号文章…"这类以平台词开头的普通句子不会误判；账号 ID 是 ASCII，中文前缀不会误伤账号
const PLATFORM_PREFIX_RE = /^(知乎|微信公众号|微信|公众号)([：:，,。；;、！!？?）\])】」』》〉"']+.*)?$/

/** 去掉首词两侧的包裹符与标点：[知乎] → 知乎，"default"、（gzh）、知乎： 同理 */
function unwrapWord(word: string): string {
  return word
    .replace(/^[[({（\[【「『《〈“‘'"`.，。、；：！？!?.,;:\s]+/, '')
    .replace(/[\])}）\]】」』》〉”’'"`.，。、；：！？!?.,;:\s]+$/, '')
}

/** 识别首词中的平台词；返回平台与首词内平台词之后残留的请求文字（无空格写法） */
function matchPlatformWord(first: string): { platform: Platform; remainder: string } | null {
  const bare = unwrapWord(first)
  if (!bare) return null
  for (const [pattern, platform] of PLATFORM_WORDS) {
    if (pattern.test(bare)) return { platform, remainder: '' }
  }
  const prefix = bare.match(PLATFORM_PREFIX_RE)
  if (prefix) {
    return { platform: prefix[1] === '知乎' ? 'zhihu' : 'gzh', remainder: (prefix[2] ?? '').replace(/^[：:，,。；;、！!？?）\])】」』》〉"']+,?/, '') }
  }
  return null
}

/** 首词支持逗号分隔多账号（/gzh a,b 补充要求）或平台词（/gzh 知乎 补充要求，容忍 [知乎]、知乎： 等写法）；未指定时遍历全部启用账号 */
export function parseInput(config: Config, rawInput: string): { accountIds: string[]; request: string; platform: Platform | '' } {
  const input = rawInput.trim()
  if (!input) return { accountIds: enabledAccountIds(config), request: '', platform: '' }
  const [first, ...rest] = input.split(/\s+/)
  const ids = unwrapWord(first).split(/[,，、]+/).map((id) => id.trim()).filter(Boolean)
  if (ids.length > 0 && ids.every((id) => Boolean(config.accounts[id]))) {
    return { accountIds: ids, request: rest.join(' '), platform: '' }
  }
  const matched = matchPlatformWord(first)
  if (matched) {
    // 显式指定平台时只取启用账号，不做"全部停用则回退全部账号"的兜底；零匹配由 handler 报错
    const accountIds = enabledAccountIds(config).filter((id) => config.accounts[id].enabled && normalizePlatform(config.accounts[id]) === matched.platform)
    return { accountIds, request: [matched.remainder, ...rest].join(' ').trim(), platform: matched.platform }
  }
  return { accountIds: enabledAccountIds(config), request: input, platform: '' }
}

/** 任务范围文案：显式平台 → 平台名；未指定时按所选账号实际平台（单一 → 平台名，混合 → 社媒） */
function scopeLabel(config: Config, accountIds: string[], platform: Platform | ''): string {
  if (platform) return platformLabel(platform)
  const platforms = new Set(accountIds.map((id) => normalizePlatform(config.accounts[id])))
  return platforms.size === 1 ? platformLabel(platforms.values().next().value!) : '社媒'
}

/** 把每个账号生效的插件配置直接注入任务提示词，执行 agent 无需猜默认值 */
function taskPrompt(config: Config, accountIds: string[], request: string): string {
  const scope = scopeLabel(config, accountIds, '') + '日常生产任务'
  const lines: string[] = [
    '立即执行' + scope +
      (accountIds.length > 1 ? '（多账号批量：按顺序逐账号完成全部流程后再进入下一个账号）' : '') + '。',
    '调用所有支持 account_id 的工具时必须显式传入当前账号的 account_id。',
    '',
    '硬性约束（任何时候不得偏离，与你的其它判断冲突时一律以本约束为准）：',
    '- 数量铁律：每个账号文章数正好等于其「每日文章数」，不多不少；每篇正好 1 张封面；每篇正文配图正好等于设置的配图数（为 0 则不生成）。',
    '- 选题铁律（全账号统一严格生效）：候选选题必须围绕该账号「核心业务关键词」深度检索并拓展强相关联的优质选题（如直击读者痛点、实操避坑、政策解读、流程指南等）；严禁机械式将关键词直接作为标题开头词语或前缀（严禁出现「关键词：...」、「【关键词】...」等任何冒号或括号前缀形式，如严禁“北大核心：...”、“SCI：...”）；所有账号（无论账号1还是账号2、账号3等后续所有账号）标题必须是自然吸睛、语意完整的陈述句或疑问句；仅当补充要求中明确给出特定主题时才可替代，拟定后必须全量提交 gzh_check_topics 查重通过。',
    '- 主题铁律：每篇文章主题严格按 gzh_get_style_guide 返回的 theme_plan 执行，构建时会按设置强制覆盖，不要自选或更换主题。',
    '- 不变量：作者名、品牌名、排版字号、主题色板、封面比例、禁词表均以设置为准，任务中禁止修改、另创或「优化」。',
    '- 禁止自由发挥：不要添加配置之外的栏目、系列名、活动、二维码或任何多余元素。',
    '',
    '执行纪律（同等效力，违反会成倍增加 token 消耗）：',
    '- 单线程顺序执行：禁止派生 subagent、后台任务或 job 并行写作——每个分身都要重读全部规范与文件，token 成倍增加。',
    '- 规范自包含：gzh_get_style_guide 返回值已含写文所需全部信息（doc_spec 示例、parts_format、硬性规则、theme_plan、禁词表），不要读源码、参考文档或历史文章；references 路径仅在工具报错且提示需要时才查阅。',
    '- 只走工具，不走 shell：禁止用 pwsh/python 直接执行 pipeline 脚本或手工校验、修补产物文件；构建、校验、发布、核验一律调用 gzh_* 工具。',
    '- 不复述产物：不要在回复里粘贴文章全文或 HTML，也不要 read 已构建的文章文件复查——构建工具返回的 plain_chars/img_count 就是校验结论。',
    '- 批量调用：gzh_check_topics 每账号一次提交全部候选选题；gzh_generate_images 一次提交该账号全部图片项；不要一项一调。',
    '',
  ]
  accountIds.forEach((id, index) => {
    const profile = config.accounts[id]
    const content = profile.content
    const platform = profile.platform === 'zhihu' ? 'zhihu' : 'gzh'
    const exampleWord = content.topics[0] || '核心词'
    lines.push('【账号 ' + (index + 1) + '/' + accountIds.length + '】account_id：' + id + '（' + profile.name + '）')
    lines.push('- 核心业务关键词（选题检索关联依据）：' + (content.topics.length > 0 ? content.topics.join('、') : '（为空时按查重通过的自拟选题，其余铁律不变）') + '；必须围绕这些关键词检索关联深度选题，严禁直接作为标题开头词或前缀（严禁“' + exampleWord + '：...”格式）')
    const targetWords = Math.max(content.min_words + 400, Math.ceil(content.min_words * 1.2))
    lines.push('- 每日文章数：' + content.articles_per_day + ' 篇；每篇纯文字下限 ≥ ' + content.min_words +
      ' 字（撰写目标务必按 ' + targetWords + ' 字以上充分展开，规划 4~6 个长章节、每章 3~5 个长段落并搭配 card 展开，杜绝因字数不足触发断言导致重写返工）；每篇正文配图 ' +
      config.image_api.content_images_per_article + ' 张')
    if (platform === 'zhihu') {
      lines.push('- 平台：知乎专栏（标准 Markdown 形态；浏览器自动化发布，默认只存知乎草稿箱' +
        (profile.publish_immediately ? '，该账号已开启保存后直接发布' : '') + '）；封面比例统一 16:9')
      lines.push('- 作者名 ' + profile.author_name + (content.ending_guide_required
        ? '；结尾自然引导关注「' + profile.brand_name + '」'
        : '；结尾引导语可选'))
    } else {
      const isNewspicOnly = content.article_type === 'newspic'
      const isBoth = content.article_type === 'both' || content.sync_newspic === true
      if (isNewspicOnly) {
        lines.push('- 平台：微信公众号（小绿书形态：纯图片消息轮播卡片，单篇独立发布草稿，不合并）')
        lines.push('- 篇数要求：' + (content.newspic_articles_per_day || 1) + ' 篇小绿书独立草稿')
        lines.push('- 卡片规范：每篇 ' + (content.newspic_images_per_article || 4) + ' 张卡片，比例统一 3:4 竖版（第1张自动作为封面）')
        lines.push('- 文案要求：纯文字文案 ≥ ' + (content.newspic_min_words || 100) + ' 字（支持 emoji 与 #话题标签，严禁 HTML）')
        lines.push('- 作者名 ' + profile.author_name + '；结尾自然引导关注品牌「' + profile.brand_name + '」')
      } else if (isBoth) {
        lines.push('- 平台：微信公众号（【长文 + 小绿书】联动同步更新，一文双发）')
        lines.push('- 长文：' + content.articles_per_day + ' 篇经典多图文，组合为 1 个多图文草稿，字数 ≥ ' + content.min_words + ' 字，主题以 theme_plan 为准')
        lines.push('- 小绿书同步执行：同步提炼生成 ' + (content.newspic_articles_per_day || 1) + ' 篇独立小绿书卡片草稿（每篇 ' + (content.newspic_images_per_article || 4) + ' 张 3:4 竖版卡片，标题≤32字，逐篇单独发布草稿，绝不合并）')
        lines.push('- 封面比例：头条 ' + config.image_api.headline_cover_ratio + ' / 次条 ' + config.image_api.secondary_cover_ratio)
        lines.push('- 作者名 ' + profile.author_name + '；结尾自然引导关注品牌「' + profile.brand_name + '」')
      } else {
        lines.push('- 平台：微信公众号（' + content.articles_per_day + ' 篇组合为 1 个多图文草稿）')
        lines.push('- 主题：头条 ' + config.typography.headline_theme + '，次条 ' + config.typography.secondary_theme + '；每篇以 theme_plan 为准')
        lines.push('- 封面比例：头条 ' + config.image_api.headline_cover_ratio + ' / 次条 ' + config.image_api.secondary_cover_ratio)
        lines.push('- 作者名 ' + profile.author_name + '；结尾自然引导关注品牌「' + profile.brand_name + '」')
      }
    }
    lines.push('')
  })
  lines.push(...[
    '每个账号按以下顺序自主推进，不要只给计划：',
    '1. 使用 gzh_check_topics 完成选题查重：以核心业务关键词为依据检索发掘关联选题，严禁使用任何「关键词：...」或「【关键词】...」前缀格式（工具已内置前缀拦截，违规将直接判为 high 风险）；候选选题不得与该账号历史、其它账号历史、以及本批次其它账号已确定的选题重复；高风险选题必须替换。',
    '2. 使用 gzh_get_style_guide 获取该账号规范（按账号平台返回公众号 HTML、小绿书或知乎 Markdown 规范）；文章数、配图数、主题分配（theme_plan）、禁词全部以返回值为准。',
    '3. 撰写并构建：' +
      '长文按目标字数充实展开各章节并用 gzh_build_article 构建；' +
      '若开启了小绿书同步更新（both 模式或 sync_newspic 开关），紧接着基于长文核心要点，调用 gzh_build_article 传入 article_type="newspic" 构建设有 3~6 张卡片的小绿书文案与生图规划（article_v2_{index}_pic.json）；' +
      '纯小绿书账号直接构建小绿书文案与卡片规划。',
    '4. 使用 gzh_generate_images 生成图片：一次性提交该账号全部图片；长文提交 cover 与 content 图，小绿书提交 3:4 竖版 pic 卡片图（kind="pic"）。',
    '5. 使用 gzh_validate_html 校验全部文章（自动识别长文 HTML 或小绿书 JSON 文件并执行对应校验），发现问题先修复再复检。',
    '6. 使用 gzh_publish_draft 创建草稿：长文合并为 1 个多图文草稿；小绿书则逐篇单独发布为独立草稿（微信官方小绿书不支持多图文合并，单篇发布）；知乎为逐篇独立草稿。',
    '7. 正式发布草稿后使用 gzh_verify_draft 核验。',
    '在需要用户提供主题或业务判断之前，先完成所有能够自主完成的步骤。',
    '全部账号完成后按账号汇总：选题/标题、草稿 media_id 或知乎草稿链接（或演练结果）与遗留问题。',
  ])
  if (request) {
    lines.push('本次补充要求：' + request)
    lines.push('补充要求仅在与上述硬性约束不冲突时生效；冲突时以约束为准并在汇总中说明。')
  } else {
    lines.push('本次未指定主题：围绕各账号的核心业务关键词检索关联选题（所有账号均严禁使用任何关键词冒号或括号前缀），提出候选选题并完成查重后继续。')
  }
  return lines.join('\n')
}

export function registerQuickCommand(ctx: Context, config: Config): void {
  ctx.commands.register({
    name: 'gzh',
    description: '启动社媒日常生产任务（可限定平台：知乎/公众号，可指定一个或多个账号和补充要求；缺省遍历全部启用账号）',
    input: { hint: '[知乎|公众号|account_id[,account_id2]] [补充要求]' },
    handler(invocation) {
      const parsed = parseInput(config, invocation.rawInput)
      if (parsed.platform && parsed.accountIds.length === 0) {
        const enabledCount = (platform: Platform) => Object.values(config.accounts)
          .filter((profile) => profile.enabled && normalizePlatform(profile) === platform).length
        return {
          kind: 'error',
          text: '没有启用中的' + platformLabel(parsed.platform) + '账号（当前启用：公众号 ' + enabledCount('gzh') +
            ' 个、知乎 ' + enabledCount('zhihu') + ' 个）。请先在设置「公众号账号」启用对应平台的账号，或改用其它平台词。',
        }
      }
      const accounts = []
      try {
        for (const id of parsed.accountIds) accounts.push(resolveAccount(config, id))
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      }
      const scope = scopeLabel(config, accounts.map((account) => account.id), parsed.platform)
      invocation.agent.followup(createUserMessage({
        content: [{ type: 'text', text: taskPrompt(config, accounts.map((account) => account.id), parsed.request) }],
        source: { kind: 'user' },
      }))
      return {
        kind: 'success',
        text: '已启动' + scope + '任务：' + accounts.map((account) => account.profile.name + '（' + account.id + '）').join('、') +
          (parsed.request ? `\n补充要求：${parsed.request}` : '\n将按各账号配置自动选题并执行完整流程。'),
      }
    },
  })
}
