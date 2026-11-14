import { taskSandboxRootDir } from '../sandbox/taskSandbox.ts'
import fs from 'node:fs'
import path from 'node:path'
import { defineTool } from '../tool-compat.ts'
import { normalizePlatform, type Config } from '../config.ts'
import { resolveAccount } from '../config-runtime.ts'
import { zhihuVerifyDrafts } from '../zhihu.ts'
import { baijiahaoVerifyDrafts } from '../baijiahao.ts'
import { toutiaoVerifyDrafts } from '../toutiao.ts'
import { xhsVerifyNotes } from '../xiaohongshu.ts'
import { wechatVerifyDrafts } from '../wechat-browser.ts'
import { readAccountPublishRecords } from '../publish-history.ts'
import {
  RESULT_FILE, accountScriptsDir, assertWechatCreds, expectedArticleImageCount, renderJson, runPipeline, runtimeResourceDir,
} from './shared.ts'

export interface VerifyArticle {
  index: number
  title: string
  author: string
  digest: string
  digest_len: number
  plain_chars: number
  img_count: number
  all_cdn: boolean
  problems: string[]
}

export interface VerifyReport {
  account_id: string
  article_count: number
  expected: number
  articles: Array<VerifyArticle | { title: string; found: boolean; url?: string; problems: string[] }>
}

export function verifyTool(cfg: Config) {
  return defineTool<{ media_id?: string; account_id?: string; platform?: string; expected_count?: number; article_type?: 'news' | 'newspic' }, VerifyReport>({
    name: 'gzh_verify_draft',
    description:
      '草稿核验：公众号账号走 draft/get（POST）逐篇核对标题长度/作者/摘要长度/图片数量/CDN 域名/品牌引导语/禁词，' +
      'media_id 来自 gzh_publish_draft 的返回（小绿书单篇草稿自动按1篇核对）；知乎/百家号/头条号/小红书账号回查平台内容列表逐条核对标题（无 media_id 时以最近一次发布记录为准）。',
    parameters: {
      media_id: { type: 'string', description: '草稿 media_id（公众号必填；知乎/小红书可省略）' },
      platform: {
        type: 'string',
        description: '可选：指定社媒平台（gzh / zhihu / xiaohongshu / baijiahao / toutiao），缺省结合账号或默认账号确定',
        enum: ['gzh', 'zhihu', 'xiaohongshu', 'baijiahao', 'toutiao'],
      },
      article_type: {
        type: 'string',
        description: '可选：草稿形态（news=长图文草稿，newspic=小绿书图片消息草稿）；缺省自动识别',
        enum: ['news', 'newspic'],
      },
      account_id: {
        type: 'string',
        description: '账号 ID；缺省结合 platform 自动寻找启用账号，或回退至默认账号',
      },
      expected_count: {
        type: 'number',
        description: '可选：期望篇数（长文缺省为每日文章数，小绿书单篇草稿缺省为 1）',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
      },
      render: renderJson,
    },
    async execute(args) {
      const account = resolveAccount(cfg, args.account_id, args.platform)
      const content = account.profile.content
      const platform = normalizePlatform(account.profile.platform)
      const isNewspic = platform === 'gzh' && (
        args.article_type === 'newspic' ||
        content.article_type === 'newspic' ||
        (args.expected_count === 1 && (content.article_type === 'both' || content.sync_newspic))
      )
      const expectedCount = args.expected_count ?? (isNewspic ? 1 : content.articles_per_day)
      if (platform === 'zhihu') return verifyZhihu(cfg, account.id, expectedCount)
      if (platform === 'baijiahao') return verifyBaijiahao(cfg, account.id, expectedCount)
      if (platform === 'toutiao') return verifyToutiao(cfg, account.id, expectedCount)
      if (platform === 'xiaohongshu') return verifyXhs(cfg, account.id, expectedCount)
      if (account.profile.publish_mode === 'browser') {
        return verifyWechatBrowser(cfg, account.id, expectedCount, {
          mediaId: args.media_id,
          isNewspic,
          articleType: args.article_type,
        })
      }
      if (!args.media_id || typeof args.media_id !== 'string') {
        if (cfg.runtime.dry_run) {
          return {
            account_id: account.id,
            article_count: expectedCount,
            expected: expectedCount,
            articles: [],
          }
        }
        throw new Error('media_id 不能为空')
      }
      if (!cfg.runtime.dry_run) assertWechatCreds(cfg, account.id)
      const expectedImgCount = isNewspic
        ? (content.newspic_images_per_article || 4)
        : expectedArticleImageCount(cfg, account.profile)
      const minWords = isNewspic
        ? (content.newspic_min_words || 100)
        : content.min_words

      const report = await runPipeline<Omit<VerifyReport, 'account_id'>>(
        cfg,
        'verify_draft.py',
        [
          '--media-id', args.media_id,
          '--account-id', account.id,
          '--scripts-dir', accountScriptsDir(cfg, account.id),
          '--resource-dir', runtimeResourceDir(),
          '--expected-count', String(expectedCount),
          '--author', account.profile.author_name,
          '--brand-name', account.profile.brand_name,
          '--expected-img-count', String(expectedImgCount),
          '--min-words', String(minWords),
          '--forbidden', JSON.stringify(content.forbidden_words),
        ],
        120000,
      )
      return { account_id: account.id, ...report }
    },
  })
}


function resolveVerifyScriptsDir(cfg: Config, accountId: string, platform: string, taskId?: string): string {
  if (taskId && typeof taskId === 'string' && taskId.trim()) {
    try {
      const root = taskSandboxRootDir(cfg, taskId.trim())
      const targetDir = path.join(root, `${platform}_${accountId}`)
      if (fs.existsSync(targetDir)) return targetDir
      if (fs.existsSync(root)) return root
    } catch {}
  }
  return accountScriptsDir(cfg, accountId)
}

/** 知乎分支：期望标题与 draft id 取自最近一次发布记录（publish_result.json），逐篇用编辑器回查标题 */
async function verifyZhihu(cfg: Config, accountId: string, expectedCount: number, customSdir?: string): Promise<VerifyReport> {
  const sdir = customSdir || accountScriptsDir(cfg, accountId)
  // 读取发布记录：文件名为模块常量（无外部输入），沿用 writeTextFile 同款目录边界守卫
  const base = path.resolve(sdir)
  const resultPath = path.resolve(base, RESULT_FILE)
  if (!resultPath.startsWith(base + path.sep)) throw new Error('路径越界: ' + RESULT_FILE)
  let titles: string[] = []
  let drafts: Array<{ draft_id?: string; title?: string }> = []
  try {
    const record = JSON.parse(fs.readFileSync(resultPath, 'utf-8')) as {
      articles?: string[]
      drafts?: Array<{ draft_id?: string; title?: string }>
    }
    titles = Array.isArray(record.articles) ? record.articles.filter(t => typeof t === 'string') : []
    drafts = Array.isArray(record.drafts) ? record.drafts : []
  } catch {
    throw new Error('没有可核验的发布记录（先运行 gzh_publish_draft）：' + resultPath)
  }
  if (titles.length === 0) throw new Error('发布记录中没有标题可核验: ' + resultPath)
  if (cfg.runtime.dry_run) {
    return {
      account_id: accountId,
      article_count: titles.length,
      expected: expectedCount,
      articles: titles.map(title => ({ title, found: false, problems: ['演练模式：不启动浏览器核验'] })),
    }
  }
  const expected = titles.map(title => ({
    title,
    draft_id: drafts.find(d => d.title === title)?.draft_id,
  }))
  const report = await zhihuVerifyDrafts(cfg, accountId, expected)
  return {
    account_id: accountId,
    article_count: report.article_count,
    expected: expectedCount,
    articles: report.articles.map(a => ({
      ...a,
      problems: a.found ? [] : ['发布记录缺少 draft id（保存响应未捕获），无法远程核验；请在知乎草稿箱人工确认'],
    })),
  }
}

/** 百家号分支：期望标题与文章 id 取自最近一次发布记录（publish_result.json），回查内容管理页按标题匹配 */
async function verifyBaijiahao(cfg: Config, accountId: string, expectedCount: number, customSdir?: string): Promise<VerifyReport> {
  const sdir = customSdir || accountScriptsDir(cfg, accountId)
  // 读取发布记录：文件名为模块常量（无外部输入），沿用 writeTextFile 同款目录边界守卫
  const base = path.resolve(sdir)
  const resultPath = path.resolve(base, RESULT_FILE)
  if (!resultPath.startsWith(base + path.sep)) throw new Error('路径越界: ' + RESULT_FILE)
  let titles: string[] = []
  let drafts: Array<{ draft_id?: string; title?: string }> = []
  try {
    const record = JSON.parse(fs.readFileSync(resultPath, 'utf-8')) as {
      articles?: string[]
      drafts?: Array<{ draft_id?: string; title?: string }>
    }
    titles = Array.isArray(record.articles) ? record.articles.filter(t => typeof t === 'string') : []
    drafts = Array.isArray(record.drafts) ? record.drafts : []
  } catch {
    throw new Error('没有可核验的发布记录（先运行 gzh_publish_draft）：' + resultPath)
  }
  if (titles.length === 0) throw new Error('发布记录中没有标题可核验: ' + resultPath)
  if (cfg.runtime.dry_run) {
    return {
      account_id: accountId,
      article_count: titles.length,
      expected: expectedCount,
      articles: titles.map(title => ({ title, found: false, problems: ['演练模式：不启动浏览器核验'] })),
    }
  }
  const expected = titles.map(title => ({
    title,
    draft_id: drafts.find(d => d.title === title)?.draft_id,
  }))
  const report = await baijiahaoVerifyDrafts(cfg, accountId, expected)
  return {
    account_id: accountId,
    article_count: report.article_count,
    expected: expectedCount,
    articles: report.articles.map(a => ({
      title: a.title,
      found: a.found,
      ...(a.url ? { url: a.url } : {}),
      ...(a.status ? { status: a.status } : {}),
      problems: a.found ? [] : [a.note || '百家号内容管理页未匹配到该标题；请在百家号后台人工确认'],
    })),
  }
}

/** 头条号分支：期望标题与文章 id 取自最近一次发布记录（publish_result.json），回查内容管理页按标题匹配 */
async function verifyToutiao(cfg: Config, accountId: string, expectedCount: number, customSdir?: string): Promise<VerifyReport> {
  const sdir = customSdir || accountScriptsDir(cfg, accountId)
  // 读取发布记录：文件名为模块常量（无外部输入），沿用 writeTextFile 同款目录边界守卫
  const base = path.resolve(sdir)
  const resultPath = path.resolve(base, RESULT_FILE)
  if (!resultPath.startsWith(base + path.sep)) throw new Error('路径越界: ' + RESULT_FILE)
  let titles: string[] = []
  let drafts: Array<{ draft_id?: string; title?: string }> = []
  try {
    const record = JSON.parse(fs.readFileSync(resultPath, 'utf-8')) as {
      articles?: string[]
      drafts?: Array<{ draft_id?: string; title?: string }>
    }
    titles = Array.isArray(record.articles) ? record.articles.filter(t => typeof t === 'string') : []
    drafts = Array.isArray(record.drafts) ? record.drafts : []
  } catch {
    throw new Error('没有可核验的发布记录（先运行 gzh_publish_draft）：' + resultPath)
  }
  if (titles.length === 0) throw new Error('发布记录中没有标题可核验: ' + resultPath)
  if (cfg.runtime.dry_run) {
    return {
      account_id: accountId,
      article_count: titles.length,
      expected: expectedCount,
      articles: titles.map(title => ({ title, found: false, problems: ['演练模式：不启动浏览器核验'] })),
    }
  }
  const expected = titles.map(title => ({
    title,
    draft_id: drafts.find(d => d.title === title)?.draft_id,
  }))
  const report = await toutiaoVerifyDrafts(cfg, accountId, expected)
  return {
    account_id: accountId,
    article_count: report.article_count,
    expected: expectedCount,
    articles: report.articles.map(a => ({
      title: a.title,
      found: a.found,
      ...(a.url ? { url: a.url } : {}),
      ...(a.status ? { status: a.status } : {}),
      problems: a.found ? [] : [a.note || '头条号内容管理页未匹配到该标题；请在头条号后台人工确认'],
    })),
  }
}

/** 小红书分支：期望标题与 note_id 取自最近一次发布记录（publish_result.json），逐篇访问笔记页面核验 */
async function verifyXhs(cfg: Config, accountId: string, expectedCount: number, customSdir?: string): Promise<VerifyReport> {
  const sdir = customSdir || accountScriptsDir(cfg, accountId)
  const base = path.resolve(sdir)
  const resultPath = path.resolve(base, RESULT_FILE)
  if (!resultPath.startsWith(base + path.sep)) throw new Error('路径越界: ' + RESULT_FILE)
  let titles: string[] = []
  let drafts: Array<{ draft_id?: string; title?: string }> = []
  try {
    const record = JSON.parse(fs.readFileSync(resultPath, 'utf-8')) as {
      articles?: string[]
      drafts?: Array<{ draft_id?: string; title?: string }>
    }
    titles = Array.isArray(record.articles) ? record.articles.filter(t => typeof t === 'string') : []
    drafts = Array.isArray(record.drafts) ? record.drafts : []
  } catch {
    throw new Error('没有可核验的发布记录（先运行 gzh_publish_draft）：' + resultPath)
  }
  if (titles.length === 0) throw new Error('发布记录中没有标题可核验: ' + resultPath)
  if (cfg.runtime.dry_run) {
    return {
      account_id: accountId,
      article_count: titles.length,
      expected: expectedCount,
      articles: titles.map(title => ({ title, found: false, problems: ['演练模式：不启动浏览器核验'] })),
    }
  }
  const expected = titles.map(title => ({
    title,
    note_id: drafts.find(d => d.title === title)?.draft_id,
  }))
  const report = await xhsVerifyNotes(cfg, accountId, expected)
  return {
    account_id: accountId,
    article_count: report.note_count,
    expected: expectedCount,
    articles: report.notes.map(a => ({
      title: a.title,
      found: a.found,
      ...(a.url ? { url: a.url } : {}),
      problems: a.found ? [] : [a.note || '发布记录缺少 note_id，无法远程核验'],
    })),
  }
}

interface VerifyWechatOptions {
  mediaId?: string
  isNewspic?: boolean
  articleType?: 'news' | 'newspic'
}

/** 公众号免 API 浏览器分支核验：结合 media_id、发布历史与本地结果，通过无头浏览器进入草稿箱核对标题匹配状态 */
async function verifyWechatBrowser(
  cfg: Config,
  accountId: string,
  expectedCount: number,
  options?: VerifyWechatOptions,
): Promise<VerifyReport> {
  const sdir = accountScriptsDir(cfg, accountId)
  const base = path.resolve(sdir)

  let titles: string[] = []

  // 1. 如果指定了 mediaId，优先从历史发布记录中获取该批次的标题集合
  if (options?.mediaId) {
    try {
      const records = readAccountPublishRecords(cfg, accountId)
      const matchedRecord = records.find(
        r =>
          r.draft_media_id === options.mediaId ||
          r.draft_media_ids?.includes(options.mediaId!) ||
          r.items?.some(i => i.draft_id === options.mediaId) ||
          r.id === options.mediaId,
      )
      if (matchedRecord && Array.isArray(matchedRecord.articles) && matchedRecord.articles.length > 0) {
        titles = matchedRecord.articles.filter(t => typeof t === 'string' && t.trim())
      }
    } catch {}

    // 若历史记录未查到，检查分类结果文件是否匹配该 mediaId
    if (titles.length === 0) {
      const candidateFiles = ['publish_result_news.json', 'publish_result_newspic.json', RESULT_FILE]
      for (const fname of candidateFiles) {
        const fpath = path.resolve(base, fname)
        if (fs.existsSync(fpath)) {
          try {
            const raw = JSON.parse(fs.readFileSync(fpath, 'utf-8'))
            if (raw.media_id === options.mediaId || raw.draft_media_id === options.mediaId) {
              if (Array.isArray(raw.articles) && raw.articles.length > 0) {
                titles = raw.articles.filter((t: any) => typeof t === 'string' && t.trim())
                break
              }
            }
          } catch {}
        }
      }
    }
  }

  // 2. 如果无 mediaId 或上述未找到标题，根据形态优先级读取对应的本地结果文件
  if (titles.length === 0) {
    const isPic = options?.isNewspic || options?.articleType === 'newspic'
    const primaryFile = isPic ? 'publish_result_newspic.json' : 'publish_result_news.json'
    const filesToTry = [primaryFile, RESULT_FILE]

    for (const fname of filesToTry) {
      const fpath = path.resolve(base, fname)
      if (fs.existsSync(fpath)) {
        try {
          const raw = JSON.parse(fs.readFileSync(fpath, 'utf-8'))
          if (Array.isArray(raw.articles) && raw.articles.length > 0) {
            titles = raw.articles.filter((t: any) => typeof t === 'string' && t.trim())
            if (titles.length > 0) break
          }
        } catch {}
      }
    }
  }

  // 3. 若依然没有找到本地标题，且没有传入 media_id，返回明确提示
  if (titles.length === 0 && !options?.mediaId) {
    return {
      account_id: accountId,
      article_count: 0,
      expected: expectedCount,
      articles: [
        {
          title: '未找到发布记录',
          found: false,
          problems: ['本地缺少 publish_result.json / publish_result_news.json 且未提供有效 media_id'],
        },
      ],
    }
  }

  const verifyRes = await wechatVerifyDrafts(cfg, accountId, titles, {
    mediaId: options?.mediaId,
    isNewspic: options?.isNewspic,
  })

  const isPicType = options?.isNewspic || options?.articleType === 'newspic'
  return {
    account_id: accountId,
    article_count: verifyRes.found,
    expected: expectedCount,
    articles: verifyRes.details.map(d => ({
      title: d.title,
      found: d.found,
      // 仅在拿到 appmsgid 时输出 url：显式 undefined 不是无损 JSON
      ...(d.appmsgid
        ? {
          url: isPicType
            ? `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=0&type=77&createType=8&appmsgid=${d.appmsgid}&lang=zh_CN`
            : `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&type=10&appmsgid=${d.appmsgid}&lang=zh_CN`,
        }
        : {}),
      problems: d.found ? [] : ['公众号草稿箱中未匹配到该文章标题'],
    })),
  }
}
