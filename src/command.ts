import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Config } from './config.ts'
import { resolveAccount } from './config-runtime.ts'

function parseInput(config: Config, rawInput: string): { accountId: string; request: string } {
  const input = rawInput.trim()
  if (!input) return { accountId: config.default_account, request: '' }
  const [first, ...rest] = input.split(/\s+/)
  if (config.accounts[first]) return { accountId: first, request: rest.join(' ') }
  return { accountId: config.default_account, request: input }
}

function taskPrompt(accountId: string, request: string): string {
  const extra = request
    ? `\n本次补充要求：${request}`
    : '\n本次未指定主题，请根据该账号的内容规则和历史选题，自主提出候选选题并完成查重后继续。'
  return [
    '立即执行公众号日常生产任务。',
    `目标账号 account_id：${accountId}。调用所有支持 account_id 的工具时必须显式传入该值。`,
    '按以下顺序自主推进，不要只给计划：',
    '1. 使用 gzh_check_topics 完成选题查重，高风险选题必须替换。',
    '2. 使用 gzh_get_style_guide 获取该账号规范。',
    '3. 按账号配置的每日文章数撰写并用 gzh_build_article 构建文章。',
    '4. 使用 gzh_generate_images 生成封面和正文配图。',
    '5. 使用 gzh_validate_html 校验全部文章，发现问题先修复再复检。',
    '6. 使用 gzh_publish_draft 创建公众号草稿；若当前是演练模式，则完成演练校验即可。',
    '7. 正式发布草稿后使用 gzh_verify_draft 核验，并汇总标题、草稿 media_id 和问题。',
    '在需要用户提供主题或业务判断之前，先完成所有能够自主完成的步骤。',
    extra,
  ].join('\n')
}

export function registerQuickCommand(ctx: Context, config: Config): void {
  ctx.commands.register({
    name: 'gzh',
    description: '启动公众号完整生产任务（可指定账号和补充要求）',
    input: { hint: '[account_id] [补充要求]' },
    handler(invocation) {
      const parsed = parseInput(config, invocation.rawInput)
      let account
      try {
        account = resolveAccount(config, parsed.accountId)
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      }
      invocation.agent.followup(createUserMessage({
        content: [{ type: 'text', text: taskPrompt(account.id, parsed.request) }],
        source: { kind: 'user' },
      }))
      return {
        kind: 'success',
        text: `已启动公众号任务：${account.profile.name}（${account.id}）` +
          (parsed.request ? `\n补充要求：${parsed.request}` : '\n将自动选题并执行完整流程。'),
      }
    },
  })
}
