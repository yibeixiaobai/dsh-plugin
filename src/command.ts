import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Config } from './config.ts'
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

/** 首个词支持逗号分隔多账号（/gzh a,b 补充要求）；未指定账号时遍历全部启用账号 */
function parseInput(config: Config, rawInput: string): { accountIds: string[]; request: string } {
  const input = rawInput.trim()
  if (!input) return { accountIds: enabledAccountIds(config), request: '' }
  const [first, ...rest] = input.split(/\s+/)
  const ids = first.split(/[,，、]+/).map((id) => id.trim()).filter(Boolean)
  if (ids.length > 0 && ids.every((id) => Boolean(config.accounts[id]))) {
    return { accountIds: ids, request: rest.join(' ') }
  }
  return { accountIds: enabledAccountIds(config), request: input }
}

/** 把每个账号生效的插件配置直接注入任务提示词，执行 agent 无需猜默认值 */
function taskPrompt(config: Config, accountIds: string[], request: string): string {
  const lines: string[] = [
    '立即执行公众号日常生产任务' +
      (accountIds.length > 1 ? '（多账号批量：按顺序逐账号完成全部流程后再进入下一个账号）' : '') + '。',
    '调用所有支持 account_id 的工具时必须显式传入当前账号的 account_id。',
    '',
    '硬性约束（任何时候不得偏离，与你的其它判断冲突时一律以本约束为准）：',
    '- 数量铁律：每个账号文章数正好等于其「每日文章数」，不多不少；每篇正好 1 张封面；每篇正文配图正好等于设置的配图数（为 0 则不生成）。',
    '- 选题铁律：候选选题只能取自该账号的「选题方向」列表，禁止自拟、扩展或混搭；仅当补充要求中用户明确给出主题时才可替代，且仍须查重通过。',
    '- 主题铁律：每篇文章主题严格按 gzh_get_style_guide 返回的 theme_plan 执行，构建时会按设置强制覆盖，不要自选或更换主题。',
    '- 不变量：作者名、品牌名、排版字号、主题色板、封面比例、禁词表均以设置为准，任务中禁止修改、另创或「优化」。',
    '- 禁止自由发挥：不要添加配置之外的栏目、系列名、活动、二维码或任何多余元素。',
    '',
  ]
  accountIds.forEach((id, index) => {
    const profile = config.accounts[id]
    const content = profile.content
    lines.push('【账号 ' + (index + 1) + '/' + accountIds.length + '】account_id：' + id + '（' + profile.name + '）')
    lines.push('- 每日文章数：' + content.articles_per_day + ' 篇（组合为 1 个多图文草稿）；每篇纯文字 ≥ ' + content.min_words + ' 字')
    lines.push('- 选题方向（候选选题的唯一来源）：' + (content.topics.length > 0 ? content.topics.join('、') : '（为空时按查重通过的自拟选题，其余铁律不变）'))
    lines.push('- 主题：头条 ' + config.typography.headline_theme + '，次条 ' + config.typography.secondary_theme + '；每篇以 theme_plan 为准')
    lines.push('- 封面比例：头条 ' + config.image_api.headline_cover_ratio + ' / 次条 ' + config.image_api.secondary_cover_ratio +
      '；每篇正文配图 ' + config.image_api.content_images_per_article + ' 张')
    lines.push('- 作者名 ' + profile.author_name + '；结尾自然引导关注品牌「' + profile.brand_name + '」')
    lines.push('')
  })
  lines.push(...[
    '每个账号按以下顺序自主推进，不要只给计划：',
    '1. 使用 gzh_check_topics 完成选题查重：候选选题不得与该账号历史、其它账号历史、以及本批次其它账号已确定的选题/标题重复；高风险选题必须替换，替换后仍须取自选题方向列表。',
    '2. 使用 gzh_get_style_guide 获取该账号规范；文章数、配图数、主题分配（theme_plan）、禁词全部以返回值为准。',
    '3. 按该账号的每日文章数撰写并用 gzh_build_article 逐篇构建文章。',
    '4. 使用 gzh_generate_images 生成封面和正文配图；数量必须与配置一致，不要多生成。',
    '5. 使用 gzh_validate_html 校验全部文章，发现问题先修复再复检；修复只允许改正错误，不得改动数量、主题与品牌要素。',
    '6. 使用 gzh_publish_draft 创建公众号草稿；若当前是演练模式，则完成演练校验即可。',
    '7. 正式发布草稿后使用 gzh_verify_draft 核验。',
    '在需要用户提供主题或业务判断之前，先完成所有能够自主完成的步骤。',
    '全部账号完成后按账号汇总：选题/标题、草稿 media_id（或演练结果）与遗留问题。',
  ])
  if (request) {
    lines.push('本次补充要求：' + request)
    lines.push('补充要求仅在与上述硬性约束不冲突时生效；冲突时以约束为准并在汇总中说明。')
  } else {
    lines.push('本次未指定主题：从各账号的选题方向列表中提出候选选题并完成查重后继续。')
  }
  return lines.join('\n')
}

export function registerQuickCommand(ctx: Context, config: Config): void {
  ctx.commands.register({
    name: 'gzh',
    description: '启动公众号完整生产任务（可指定一个或多个账号和补充要求；缺省遍历全部启用账号）',
    input: { hint: '[account_id[,account_id2]] [补充要求]' },
    handler(invocation) {
      const parsed = parseInput(config, invocation.rawInput)
      const accounts = []
      try {
        for (const id of parsed.accountIds) accounts.push(resolveAccount(config, id))
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      }
      invocation.agent.followup(createUserMessage({
        content: [{ type: 'text', text: taskPrompt(config, accounts.map((account) => account.id), parsed.request) }],
        source: { kind: 'user' },
      }))
      return {
        kind: 'success',
        text: '已启动公众号任务：' + accounts.map((account) => account.profile.name + '（' + account.id + '）').join('、') +
          (parsed.request ? `\n补充要求：${parsed.request}` : '\n将按各账号配置自动选题并执行完整流程。'),
      }
    },
  })
}
