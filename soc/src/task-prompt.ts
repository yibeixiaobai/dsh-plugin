import { PLATFORM_LABELS, normalizePlatform, type Config, type Platform } from './config.ts'

export function platformLabel(platform: Platform | 'all' | ''): string {
  if (platform === 'all') return '全平台社媒'
  if (platform && PLATFORM_LABELS[platform]) return PLATFORM_LABELS[platform]
  return '社媒'
}

/** 任务范围文案：显式平台 → 平台名；未指定时按所选账号实际平台（单一 → 平台名，混合 → 通用社媒） */
export function scopeLabel(config: Config, accountIds: string[], platform: Platform | 'all' | ''): string {
  if (platform && platform !== 'all') return platformLabel(platform)
  const platforms = new Set(accountIds.map(id => normalizePlatform(config.accounts[id].platform)))
  if (platforms.size === 1) {
    return platformLabel(platforms.values().next().value!)
  }
  return '社媒多平台'
}

/** 任务调度提示词：保持高阶流程调度与安全隔离，补充要求为第一最高优先级，排版与校验基础规范由 gzh_get_style_guide 统一提供 */
export function taskPrompt(config: Config, accountIds: string[], request: string, attachmentCount = 0): string {
  const isMultiAccount = accountIds.length > 1
  const scope = scopeLabel(config, accountIds, '') + '生产与发布任务'
  // 严格遵守用户铁律：演练模式唯一且必须以系统设置中心配置为准，严禁通过对话文本模糊推断演练
  const isDryRun = Boolean(config.runtime?.dry_run)

  const lines: string[] = [
    '立即执行' + scope +
      '（严格在当前主 Agent 流程中串行推进，社媒发布模式严禁使用多 Agent 并行或派生子智能体，切勿涉及其它无关账号）' +
      (isDryRun ? '【当前为演练模式 (Dry Run)】' : '') + '。',
    '目标账号列表：' + accountIds.map(id => `${config.accounts[id]?.name || id}（${platformLabel(normalizePlatform(config.accounts[id]?.platform))}，account_id: ${id}）`).join('、') + '。',
    '调用所有支持 account_id 的工具时必须显式传入当前账号的 account_id。',
  ]

  if (isDryRun) {
    lines.push('')
    lines.push('------------------------------------------------------------')
    lines.push('【演练模式生效中 (Dry Run 核心铁律)】')
    lines.push('当前任务处于演练模式！全流程市场搜索、选题分析、正文构建与排版校验正常推进，但必须遵守演练铁律：')
    lines.push('1. 调用 gzh_generate_images 时必须显式传入参数 dry_run: true，系统将生成演练占位图，绝不联网发起扣费生图；')
    lines.push('2. 调用 gzh_publish_draft 时必须显式传入参数 dry_run: true，系统将执行全部本地合规验证，绝不向平台接口或浏览器模拟发起真实发布/草稿创建；')
    lines.push('3. 最终汇总表格中明确标注【演练模式 (Dry Run)：已完成全链路格式与数据校验，未向官方平台真实推送】。')
    lines.push('------------------------------------------------------------')
  } else {
    lines.push('【正式生产发布铁律】：当前系统设置未开启演练模式，任务全流程必须以真实线上生产标准推进！若遇到配图失败、配额不足或接口超时，必须直接向用户汇报真实问题，绝对严禁擅自调用 dry_run: true 伪造占位物料！')
  }

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
  lines.push('【核心红线纪律与执行流程】')
  lines.push('0.0 【核心红线·禁止调用模块文件与禁用多 Agent 并行】：')
  lines.push('   - 本任务属于纯粹的社交媒体内容生产与发布业务，非代码工程或系统调试任务！')
  lines.push('   - 严禁调用终端命令行工具（run_command、find、grep、dir 等），严禁在磁盘上搜索或读取系统代码模块文件（如 packages/、apps/ 下的 .ts/.js 源码与配置文件）；')
  lines.push('   - 严禁启动任何子智能体（如 Explore、subagent 等），社媒发布模式严格禁用多 Agent 并行模式，所有流程必须由当前主 Agent 串行完成；')
  lines.push('   - 严禁进入 Planning 规划模式进行代码调研，必须严格按照下方固定业务流程推进。')
  lines.push('0.1 【核心流程·登录态与环境预检】：')
  lines.push('   - 在开始任何选题分析、撰写与生图前，首先调用 social_publisher(action: "detect_login", account_id: acc.id) 工具检测本次所有目标账号的登录就绪状态；')
  lines.push('   - 若检测到账号未就绪，立即在回复中友好提示用户前往设置中心完成扫码授权，待授权后继续推进。')
  if (isMultiAccount) {
    lines.push('1. 多账号串行阶段调度：当前任务包含多个账号，按账号顺序逐个串行推进。查重后自主智能锁定最优选题组合，无需向用户请求定题确认，直接启动图文撰写与生图流水线；全部生成完毕后呈现全局图文审校预览卡片，等待用户确认后执行草稿推送。')
  } else {
    lines.push('1. 单账号专属执行：当前会话为该账号专属的一级会话，流程针对本账号端到端推进，严禁涉及其它账号。')
  }
  lines.push(
    '2. 规范驱动与优先级：每个账号首先调用 social_publisher(action: "get_content_rules", account_id: acc.id) 获取该账号生效的基础配置与排版规范。若本次任务包含补充要求或用户附件，补充要求与附件具有第一最高优先级。',
    '3. 极简两阶段闭环核心纪律与唯一统一门面工具铁律（全自动闭环，单轮直达）：',
    '   - 【唯一门面工具铁律】：全流程生产、排期与发布必须且只能调用 social_publisher 统一门面工具！',
    '   - 阶段一：选题与全自动批量物料闭环（单轮产出全量图文）：',
    '     * 结合用户要求与账号领域确定最优选题，自主星标决策无需停顿确认；',
    '     * 根据账号所需篇数（如 3 篇或 6 篇长文，若有小绿书同步产出小绿书卡片），一次性撰写全量深度正文草案；',
    '     * 一次性调用唯一生产工具：social_publisher(action: "produce", account_id: acc.id, articles: [{ title: "...", content: "..." }, ...])；',
    '     * 底层管线全自动完成沙箱分配、微信单行 HTML 排版、动静混排配图（封面 2.35:1/1:1 + 正文插图 16:9 + 遇阻秒级降级保底）、机器合规校验与签名计算；',
    '   - 阶段二：图文审校与人机确认门禁（强制停顿等待用户审校）：',
    '     * 物料生成完毕后，中央画布会自动展开高保真预览；',
    '     * Agent 必须立即终止调用发布工具，结束当前回复！严禁在同一回复内擅自调用发布！',
    '     * 在对话中汇报各账号图文概况与审校卡片，提示用户：「全部图文与配图已生成完毕并通过合规校验！您可在中央画布中审校图文与微调排版；确认无误后点击下方按钮【推送到官方草稿箱】或在对话中发出确认指令，我才会为您推送到官方平台。」',
    '   - 阶段三：终局发布与定时排期（收到确认指令直通）：',
    '     * 收到用户的【发布确认】指令后，立即调用统一发布入口：social_publisher(action: "publish", account_id: acc.id, task_id: ..., user_confirmed: true)；',
    '     * 底层自动依据账号默认配置执行微信后台原生定时发表（自动避让槽位）或仅存草稿箱，若用户有明确要求则用户指令最高优先级覆盖；',
    '     * 多篇长文自动作为单一多图文合辑草稿原子提交；若账号开启小绿书双发，底层自动紧接着完成小绿书发布，零漏发；',
    '     * 回查核验草稿状态，沙箱原子归档，输出全量 Markdown 汇总表格。',
    '4. 定时排期管理与长文/小绿书独立排期核心铁律：',
    '   - 【长文与小绿书排期通道绝对正交独立】：长文（news）与小绿书（newspic）为两种完全独立的内容形态，各自拥有正交独立的规则时段池（长文 schedule_times_article，小绿书 schedule_times_newspic），排期互不干涉、互不避让！',
    '     * 长文排期绝对不受小绿书影响！即使当天已排期小绿书（如 10:00），只要长文时段（如 09:00）无长文任务，长文必须优先命中最早空闲时段；',
    '     * 严禁 Agent 主观臆测或在回复中编造所谓的「同日双发错开」、「防轰炸保护」、「极短时间扎堆打扰读者」、「间隔 4 小时」等虚假避让逻辑！微信平台完全支持同日多时段并存发表；',
    '     * 严禁 Agent 自行计算或在 schedule_time 中擅自填入避让时间！除用户在指令/备注中显式提出具体时间要求外，Agent 必须保持 schedule_time 为空或 "auto"，由底层算法依据各自独立的时段池自动匹配最近空闲槽位！',
    '   - 若任务涉及定时排期或排期调整，必须首先调用 social_publisher(action: "manage_schedule", action_type: "sync", account_id: acc.id) 同步微信后台最新排期列表；',
    '   - 取消挤压排期直接调用 social_publisher(action: "manage_schedule", action_type: "cancel", account_id: acc.id, task_id: ...)；',
    '   - 任务完成后输出清晰的 Markdown 排期汇总对照表。',
  )

  return lines.join('\n')
}
