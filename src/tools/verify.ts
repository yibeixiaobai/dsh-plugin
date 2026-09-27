import fs from 'node:fs'
import path from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from '../config.ts'
import { resolveAccount } from '../config-runtime.ts'
import { zhihuVerifyDrafts } from '../zhihu.ts'
import { xhsVerifyNotes } from '../xiaohongshu.ts'
import { wechatVerifyDrafts } from '../wechat-browser.ts'
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
  return defineTool<{ media_id?: string; account_id?: string; expected_count?: number; article_type?: 'news' | 'newspic' }, VerifyReport>({
    name: 'gzh_verify_draft',
    description:
      '草稿核验：公众号账号走 draft/get（POST）逐篇核对标题长度/作者/摘要长度/图片数量/CDN 域名/品牌引导语/禁词，' +
      'media_id 来自 gzh_publish_draft 的返回（小绿书单篇草稿自动按1篇核对）；知乎账号打开草稿箱逐条核对标题（无 media_id 时以最近一次发布记录为准）。',
    parameters: {
      media_id: { type: 'string', description: '草稿 media_id（公众号必填；知乎可省略）' },
      article_type: {
        type: 'string',
        description: '可选：草稿形态（news=长图文草稿，newspic=小绿书图片消息草稿）；缺省自动识别',
        enum: ['news', 'newspic'],
      },
      account_id: {
        type: 'string',
        description: '账号 ID；缺省使用默认账号',
      },
      expected_count: {
        type: 'number',
        description: '可选：期望篇数（长文缺省为每日文章数，小绿书单篇草稿缺省为 1）',
      },
    },
    output: { schema: { type: 'json' }, render: renderJson },
    async execute(args) {
      const account = resolveAccount(cfg, args.account_id)
      const content = account.profile.content
      const platform = account.profile.platform === 'zhihu' ? 'zhihu' : account.profile.platform === 'xiaohongshu' ? 'xiaohongshu' : 'gzh'
      const isNewspic = platform === 'gzh' && (
        args.article_type === 'newspic' ||
        content.article_type === 'newspic' ||
        (args.expected_count === 1 && (content.article_type === 'both' || content.sync_newspic))
      )
      const expectedCount = args.expected_count ?? (isNewspic ? 1 : content.articles_per_day)
      if (platform === 'zhihu') return verifyZhihu(cfg, account.id, expectedCount)
      if (platform === 'xiaohongshu') return verifyXhs(cfg, account.id, expectedCount)
      if (account.profile.publish_mode === 'browser') {
        return verifyWechatBrowser(cfg, account.id, expectedCount)
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

/** 知乎分支：期望标题与 draft id 取自最近一次发布记录（publish_result.json），逐篇用编辑器回查标题 */
async function verifyZhihu(cfg: Config, accountId: string, expectedCount: number): Promise<VerifyReport> {
  const sdir = accountScriptsDir(cfg, accountId)
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
    titles = Array.isArray(record.articles) ? record.articles.filter((t) => typeof t === 'string') : []
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
      articles: titles.map((title) => ({ title, found: false, problems: ['演练模式：不启动浏览器核验'] })),
    }
  }
  const expected = titles.map((title) => ({
    title,
    draft_id: drafts.find((d) => d.title === title)?.draft_id,
  }))
  const report = await zhihuVerifyDrafts(cfg, accountId, expected)
  return {
    account_id: accountId,
    article_count: report.article_count,
    expected: expectedCount,
    articles: report.articles.map((a) => ({
      ...a,
      problems: a.found ? [] : ['发布记录缺少 draft id（保存响应未捕获），无法远程核验；请在知乎草稿箱人工确认'],
    })),
  }
}

/** 小红书分支：期望标题与 note_id 取自最近一次发布记录（publish_result.json），逐篇访问笔记页面核验 */
async function verifyXhs(cfg: Config, accountId: string, expectedCount: number): Promise<VerifyReport> {
  const sdir = accountScriptsDir(cfg, accountId)
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
    titles = Array.isArray(record.articles) ? record.articles.filter((t) => typeof t === 'string') : []
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
      articles: titles.map((title) => ({ title, found: false, problems: ['演练模式：不启动浏览器核验'] })),
    }
  }
  const expected = titles.map((title) => ({
    title,
    note_id: drafts.find((d) => d.title === title)?.draft_id,
  }))
  const report = await xhsVerifyNotes(cfg, accountId, expected)
  return {
    account_id: accountId,
    article_count: report.note_count,
    expected: expectedCount,
    articles: report.notes.map((a) => ({
      title: a.title,
      found: a.found,
      ...(a.url ? { url: a.url } : {}),
      problems: a.found ? [] : [a.note || '发布记录缺少 note_id，无法远程核验'],
    })),
  }
}

/** 公众号免 API 浏览器分支核验：读取本地发布记录，通过无头浏览器进入草稿箱核对标题匹配状态 */
async function verifyWechatBrowser(cfg: Config, accountId: string, expectedCount: number): Promise<VerifyReport> {
  const sdir = accountScriptsDir(cfg, accountId)
  const base = path.resolve(sdir)
  const resultPath = path.resolve(base, RESULT_FILE)
  let titles: string[] = []
  try {
    if (fs.existsSync(resultPath)) {
      const record = JSON.parse(fs.readFileSync(resultPath, 'utf-8'))
      titles = Array.isArray(record.articles) ? record.articles : []
    }
  } catch {}

  if (titles.length === 0) {
    return {
      account_id: accountId,
      article_count: 0,
      expected: expectedCount,
      articles: [{ title: '未找到发布记录', found: false, problems: ['本地缺少 publish_result.json 或无有效文章标题'] }],
    }
  }

  const verifyRes = await wechatVerifyDrafts(cfg, accountId, titles)
  return {
    account_id: accountId,
    article_count: verifyRes.found,
    expected: expectedCount,
    articles: verifyRes.details.map((d) => ({
      title: d.title,
      found: d.found,
      // 仅在拿到 appmsgid 时输出 url：显式 undefined 不是无损 JSON，
      // 会被宿主工具输出校验拒绝（表现为 "value is not lossless JSON"）。
      ...(d.appmsgid
        ? { url: `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&type=10&appmsgid=${d.appmsgid}&lang=zh_CN` }
        : {}),
      problems: d.found ? [] : ['公众号草稿箱中未匹配到该文章标题'],
    })),
  }
}
