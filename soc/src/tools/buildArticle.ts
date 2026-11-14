import { defineTool } from '../tool-compat.ts'
import { existsSync, readFileSync } from 'node:fs'
import { THEME_NAMES, normalizePlatform, type Config, type ThemeKey } from '../config.ts'
import { resolveAccount } from '../config-runtime.ts'
import type { SocialWorkflowEvent } from '../adapters/types.ts'
import {
  calculateManifestFingerprint,
  resolveTaskSandbox,
  writeSandboxedArticle,
  writeTaskManifest,
} from '../sandbox/taskSandbox.ts'
import {
  contentImagesPerArticle, expectedArticleImageCount, expectedBrandImageCount, getActiveWorkspace, getStrictImageQuota, recordActiveWorkspace, renderJson, resolveTheme, resolveTypography, runPipeline,
  runtimeResourceDir, writeTextFile,
} from './shared.ts'
import { sanitizeGhostEmptySections } from '../engine/htmlValidator.ts'
import {
  assertBuildArticleOrder,
  recordArticleWritten,
} from '../sandbox/taskSandbox.ts'
import { resolveArticleVisualBlueprint } from './buildArticleVisualBlueprint.ts'

interface BuiltArticle {
  index: number
  theme: string
  html?: string
  markdown?: string
  text?: string
  title?: string
  platform?: string
  plain_chars: number
  img_count: number
  problems?: string[]
}

interface CheckReport {
  passed: boolean
  results: Array<{ file: string; plain_chars: number; img_count: number; problems: string[]; lint?: { exit: number; output: string } | null }>
}

export interface BuildOk {
  account_id: string
  file: string
  index: number
  theme: string
  plain_chars: number
  img_count: number
  title?: string
  content?: string
  html?: string
  markdown?: string
  text?: string
  platform?: string
  task_id?: string
  content_hash?: string
  manifest_fingerprint?: string
  _social_event?: SocialWorkflowEvent
}


import { isInvalidPlaceholderTitle } from '../title-adapter.ts'
import { resolveSafeArticleTitle } from './buildArticleTitleResolver.ts'
export { isInvalidPlaceholderTitle, resolveSafeArticleTitle }

export function buildArticleTool(cfg: Config) {
  return defineTool<{ doc_json: string; account_id?: string; platform?: string; topic_confirmed?: boolean; task_id?: string; workspace?: string }, BuildOk>({
    name: 'gzh_build_article',
    description:
      '把文章内容按 doc spec 构建为平台合规产物并落盘：公众号账号产出单行 HTML（gzh_components 融合版组件），' +
      '知乎/百家号/头条号账号产出标准 Markdown（article_v2_{index}.md），小红书账号产出纯文本笔记（article_v2_{index}_xhs.txt）。' +
      '优先支持补充要求在 doc spec 中指定的 theme/min_words/content_img_count；' +
      '未指定时采用账号设置与轮换规则。自动断言字数/图片数/品牌引导语/禁词，随后跑平台对应的机器校验。' +
      '【产物路径规则与免检原则】：本工具内部自动按照确定性规则生成产物路径文件夹并落盘，每次调用均为全新任务写入，调用者严禁在磁盘检查已有产物或扫描旧文件夹内容。',
    parameters: {
      doc_json: {
        type: 'string',
        required: true,
        description: 'doc spec JSON 字符串（格式见 gzh_get_style_guide 返回的 doc_spec 字段）',
      },
      platform: {
        type: 'string',
        description: '可选：指定社媒平台（gzh / zhihu / xiaohongshu / baijiahao / toutiao），缺省结合账号或默认账号确定',
        enum: ['gzh', 'zhihu', 'xiaohongshu', 'baijiahao', 'toutiao'],
      },
      account_id: {
        type: 'string',
        description: '账号 ID；缺省结合 platform 自动寻找启用账号，或回退至默认账号',
      },
      task_id: {
        type: 'string',
        description: '可选：任务批次 ID（如 task_YYYYMMDD_xxxx）；用于沙箱物理隔离，缺省自动分配或沿用当前活跃沙箱',
      },
      topic_confirmed: {
        type: 'boolean',
        description: '可选：选题确认标志（支持全自动智能定题与用户指定选题，缺省 true）',
      },
      workspace: {
        type: 'string',
        description: '可选：执行该任务会话所属的项目文件夹绝对路径（确保产物落盘于当前项目工作区）',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
      },
      render: renderJson,
    },
    async execute(args, toolContext) {
      if (!(args as any).from_unified_tool && !(args as any).force) {
        throw new Error(
          '❌ 【社媒工具统一收敛拦截】：系统已全面升级为极简确定性流水线！\n' +
          '严禁直接调用散装工具 gzh_build_article。\n' +
          '请改用社媒发布插件唯一指定的统一门面工具：\n' +
          '👉 创作阶段：social_publisher(action: "produce", account_id: "...", articles: [...] 或 title/content)\n' +
          '👉 发布阶段：social_publisher(action: "publish", account_id: "...", task_id: "...", user_confirmed: true)',
        )
      }
      return executeSingleArticleBuild(cfg, args, toolContext)
    },
  })
}

export interface SingleArticleBuildInput {
  doc_json?: string
  doc?: Record<string, unknown>
  account_id?: string
  platform?: string
  topic_confirmed?: boolean
  task_id?: string
  workspace?: string
  isBatch?: boolean
}

export async function executeSingleArticleBuild(
  cfg: Config,
  args: SingleArticleBuildInput,
  toolContext?: any,
): Promise<BuildOk> {

  const sessionId = (toolContext as any)?.sessionId
  const effectiveWs = args.workspace || (toolContext as any)?.workspacePath || (toolContext as any)?.cwd || getActiveWorkspace()
  if (effectiveWs) {
    recordActiveWorkspace(effectiveWs)
  }
  const account = resolveAccount(cfg, args.account_id, args.platform)
  const content = account.profile.content
  const platform = normalizePlatform(account.profile.platform)
  let doc: Record<string, unknown>
  let rawDoc = args.doc ? JSON.stringify(args.doc) : String(args.doc_json || '')
  // 支持以 @path 或绝对路径传入 doc spec 文件（长 JSON 无法内联传递时使用）
  const maybePath = rawDoc.startsWith('@') ? rawDoc.slice(1) : rawDoc
  if (/^[A-Za-z]:[\\/]/.test(maybePath) || maybePath.startsWith('/')) {
    try {
      rawDoc = readFileSync(maybePath, 'utf-8')
    } catch {
      throw new Error('doc_json 文件读取失败：' + maybePath)
    }
  }
  try {
    doc = JSON.parse(rawDoc) as Record<string, unknown>
  } catch {
    throw new Error('doc_json 不是合法 JSON：' + String(rawDoc).slice(0, 120))
  }
  const isNewspic = platform === 'gzh' && (doc.article_type === 'newspic' || content?.article_type === 'newspic')
  const idx = Number(doc.index)
  if (!Number.isInteger(idx) || idx < 1 || idx > 99) {
    throw new Error('index 必须是 1~99')
  }
  const sandbox = resolveTaskSandbox(cfg, args.task_id, platform, account.id, isNewspic ? 'newspic' : 'news', sessionId, effectiveWs)
  const existingArticles = sandbox.targetGroup?.articles || []
  const isAlreadyFinished = sandbox.manifest.stage === 'reviewed' || sandbox.manifest.stage === 'published'
  const hasTargetArticle = existingArticles.some((a: any) => a.index === idx && a.filePath && existsSync(a.filePath))
  if ((sandbox.manifest.sealed || isAlreadyFinished) && hasTargetArticle) {
    throw new Error(
      `【发布版本只读保护】：任务沙箱 [${sandbox.taskId}] 的第 ${idx} 篇文章已完成构建并通过审校（阶段: ${sandbox.manifest.stage}），发布流程严禁反向重新构建或修改已完成稿件！`,
    )
  }
  // 【中文修复依据】：多篇任务流水线顺序硬性门禁拦截
  const totalArticles = account.profile.content?.articles_per_day || 1
  assertBuildArticleOrder({
    sandbox,
    index: idx,
    totalArticles,
    isBatch: args.isBatch,
  })

  // 【中文修复依据】：严格按照账号在设置中的单独配置执行配图设计
  const strictQuota = getStrictImageQuota(cfg, account.profile, isNewspic ? 'newspic' : 'news')
  const targetImgCount = isNewspic || platform === 'xiaohongshu'
    ? strictQuota.cardImageCount
    : strictQuota.contentImageCount

  const effectiveTitle = resolveSafeArticleTitle((doc as any).title, doc, idx, platform)
  const targetSlots = resolveArticleVisualBlueprint({
    doc,
    idx,
    platform,
    isNewspic,
    targetImgCount,
    effectiveTitle,
  })

  // 保留任务沙箱中其他篇目的槽位，合并当前篇目槽位并持久化
  const existingSlots = (sandbox.manifest.visualSlots || []).filter((s: any) => s.index !== idx)
  sandbox.manifest.visualSlots = [...existingSlots, ...targetSlots];
  (doc as any).visual_blueprint = targetSlots
  writeTaskManifest(cfg, sandbox.manifest)
  const sdir = sandbox.targetGroup.targetDir
  // 主题优先支持 doc.theme（用户补充要求指定时生效）；未指定或非法时回退到默认设置轮换 resolveTheme
  const docTheme = typeof doc.theme === 'string' && doc.theme in THEME_NAMES ? (doc.theme as ThemeKey) : undefined
  const theme = platform === 'zhihu' || platform === 'baijiahao' || platform === 'toutiao' ? 'markdown' : platform === 'xiaohongshu' ? 'xhs' : isNewspic ? 'newspic' : (docTheme ?? resolveTheme(cfg, idx, account.profile))

  // 字数与正文配图数：支持 doc spec 中用户补充要求自定义，缺省采用账号配置
  const docMinWords = typeof doc.min_words === 'number' && doc.min_words > 0 ? doc.min_words : undefined
  const minWords = isNewspic
    ? (docMinWords ?? content.newspic_min_words ?? 100)
    : platform === 'xiaohongshu'
      ? (docMinWords ?? content.xhs_min_words ?? 200)
      : (docMinWords ?? content.min_words)


  const built = await runPipeline<BuiltArticle>(
    cfg,
    'build_article.py',
    [
      '--doc-json', JSON.stringify({ ...doc, index: idx, theme: platform === 'zhihu' || platform === 'baijiahao' || platform === 'toutiao' ? 'wenying' : theme }),
      '--scripts-dir', sdir,
      '--resource-dir', runtimeResourceDir(),
      '--min-words', String(minWords),
      '--forbidden', JSON.stringify(content.forbidden_words),
      '--platform', platform,
      '--article-type', isNewspic ? 'newspic' : 'news',
      '--content-img-count', String(targetImgCount),
      ...(isNewspic
        ? [
          '--brand-name', account.profile.brand_name,
          ...(content.ending_guide_required ? ['--require-brand'] : []),
        ]
        : platform === 'zhihu' || platform === 'baijiahao' || platform === 'toutiao'
          ? [
            ...(content.ending_guide_required ? ['--require-brand'] : []),
            '--brand-name', account.profile.brand_name,
            '--brand-images', JSON.stringify(account.profile.brand_images),
          ]
          : platform === 'xiaohongshu'
            ? [
              '--brand-name', account.profile.brand_name,
              ...(content.ending_guide_required ? ['--require-brand'] : []),
            ]
            : [
              '--brand-name', account.profile.brand_name,
              '--brand-images', JSON.stringify(account.profile.brand_images),
              '--typography', JSON.stringify(resolveTypography(cfg, account.profile)),
            ]),
    ],
    180000,
  )

  // Python 纯构建返回产物，TS 侧落盘（文件名白名单 + 目录守卫）
  const ext = platform === 'zhihu' || platform === 'baijiahao' || platform === 'toutiao' ? '.md' : platform === 'xiaohongshu' ? '_xhs.txt' : isNewspic ? '_pic.json' : '.html'
  const name = 'article_v2_' + idx + ext
  const titleStr = resolveSafeArticleTitle(built.title, doc, idx, platform)
  let payload = isNewspic
    ? JSON.stringify(built, null, 2) + '\n'
    : platform === 'zhihu' || platform === 'baijiahao' || platform === 'toutiao'
      ? built.markdown
      : platform === 'xiaohongshu'
        ? (titleStr ? '<!-- TITLE: ' + titleStr + ' -->\n\n' : '') + ((built as unknown as Record<string, unknown>).text as string)
        : built.html
  if (payload === undefined) throw new Error('构建结果缺少' + (platform === 'zhihu' || platform === 'baijiahao' || platform === 'toutiao' ? 'markdown' : platform === 'xiaohongshu' ? 'text' : 'html') + '字段')
  // 【中文修复依据】：落盘前对公众号 HTML 执行幽灵空白卡片终极保底净化，杜绝任何空卡片文件落盘
  if (platform === 'gzh' && !isNewspic && typeof payload === 'string') {
    const { cleanHtml } = sanitizeGhostEmptySections(payload)
    payload = cleanHtml
  }
  const format = built.html ? 'html' : built.markdown ? 'markdown' : 'text'
  const { contentHash } = writeSandboxedArticle(
    sandbox,
    idx,
    titleStr,
    String(doc.digest || ''),
    format,
    payload,
    name,
  )
  const file = writeTextFile(sdir, name, payload)

  // 完整发布级校验（占位符阶段）；gzh-design lint 仅对公众号 HTML 有意义
  const expectedImgs = isNewspic
    ? built.img_count
    : platform === 'zhihu'
      ? contentImagesPerArticle(cfg, account.profile)
      : platform === 'baijiahao' || platform === 'toutiao'
        ? contentImagesPerArticle(cfg, account.profile) + expectedBrandImageCount(account.profile)
        : platform === 'xiaohongshu'
          ? built.img_count
          : expectedArticleImageCount(cfg, account.profile)
  const check = await runPipeline<CheckReport>(
    cfg,
    'check_html.py',
    [
      '--files', JSON.stringify([name]),
      '--scripts-dir', sdir,
      '--resource-dir', runtimeResourceDir(),
      '--min-words', String(isNewspic ? (content.newspic_min_words ?? 100) : platform === 'xiaohongshu' ? (content.xhs_min_words ?? 200) : content.min_words),
      '--forbidden', JSON.stringify(content.forbidden_words),
      '--brand-name', account.profile.brand_name,
      '--img-count', String(expectedImgs),
      '--allow-placeholders',
      '--platform', platform,
      '--article-type', isNewspic ? 'newspic' : 'news',
      ...((platform === 'zhihu' || platform === 'baijiahao' || platform === 'toutiao' || platform === 'xiaohongshu' || isNewspic) && content.ending_guide_required ? ['--require-brand'] : []),
      ...(platform === 'gzh' && !isNewspic ? ['--lint'] : []),
    ],
    180000,
  )

  const problems = [...(built.problems ?? [])]
  for (const r of check.results) problems.push(...r.problems)
  if (problems.length > 0 || !check.passed) {
    const lintTail = check.results
      .map(r => r.lint?.output ?? '')
      .filter(Boolean)
      .join('\n')
      .slice(-1500)
    throw new Error('文章已生成（' + file + '）但校验未通过：\n' + problems.join('\n') +
          (lintTail ? '\n--- lint ---\n' + lintTail : ''))
  }
  // 复用前文已确定的 format
  const socialEvent: SocialWorkflowEvent = {
    v: 1,
    stage: 'review',
    platform,
    accountId: account.id,
    accountName: account.profile.name,
    articles: [
      {
        index: idx,
        title: titleStr || file,
        format,
        content: payload,
        articleFile: file,
      },
    ],
    step: {
      id: `build_article_${idx}`,
      label: `生成第 ${idx} 篇文章`,
      status: 'completed',
    },
  }

  recordArticleWritten(sandbox, idx, cfg)

  return {
    account_id: account.id,
    file,
    index: idx,
    theme,
    plain_chars: built.plain_chars,
    img_count: built.img_count,
    platform,
    content: payload,
    ...(built.html ? { html: built.html } : {}),
    ...(built.markdown ? { markdown: built.markdown } : {}),
    ...((built as unknown as Record<string, unknown>).text ? { text: (built as unknown as Record<string, unknown>).text as string } : {}),
    ...(titleStr ? { title: titleStr } : {}),
    task_id: sandbox.taskId,
    content_hash: contentHash,
    manifest_fingerprint: calculateManifestFingerprint(sandbox.manifest),
    _social_event: socialEvent,
  }

}
