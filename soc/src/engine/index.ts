// 原生引擎统一导出与命令行参数解析桥接（Native Engine Registry & Bridge）
import fs from 'node:fs'
import path from 'node:path'
import { discoverTopicsNative, type DiscoverTopicsOptions, type TopicDiscoveryResult } from './topicRadar.ts'
import { checkTopicsNative, type TopicCheckerOptions, type TopicCheckReport } from './topicChecker.ts'
import { buildArticleNative, type BuildArticleOptions, type BuildArticleResult } from './articleBuilder.ts'
import { validateArticleContentNative, type ValidateHtmlOptions, type ValidateHtmlResult } from './htmlValidator.ts'
import { generateImagesNative, type ImageJobSpec, type ImageGenerationResult } from './imageGenerator.ts'

export {
  discoverTopicsNative,
  checkTopicsNative,
  buildArticleNative,
  validateArticleContentNative,
  generateImagesNative,
}

export interface NativePipelineExecutionResult<T = unknown> {
  handled: boolean
  data?: T
  error?: string
}

/** 辅助解析形如 ['--key', 'value', '--flag'] 的 argv 数组 */
function parseArgs(args: string[]): Record<string, string | string[]> {
  const parsed: Record<string, string | string[]> = {}
  for (let i = 0; i < args.length; i++) {
    const item = args[i]
    if (item.startsWith('--')) {
      const key = item.slice(2)
      const next = args[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        parsed[key] = next
        i++
      } else {
        parsed[key] = 'true'
      }
    } else if (!parsed._first) {
      parsed._first = item
    }
  }
  return parsed
}

/** 安全解析 JSON 或回退默认值 */
function safeJsonParse<T>(raw: string | string[] | undefined, fallback: T): T {
  if (typeof raw !== 'string') return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/**
 * 核心调度桥接：拦截原向 Python pipeline 分发的执行请求，优先由 Native TypeScript 引擎零依赖承接
 */
export async function tryExecuteNativePipeline<T = unknown>(
  scriptName: string,
  args: string[],
): Promise<NativePipelineExecutionResult<T>> {
  const baseName = path.basename(scriptName)
  const kv = parseArgs(args)

  // 1. discover_topics.py -> 原生热点雷达
  if (baseName === 'discover_topics.py') {
    try {
      const opts: DiscoverTopicsOptions = {
        keywords: safeJsonParse<string[]>(kv.keywords, []),
        scriptsDir: typeof kv['scripts-dir'] === 'string' ? kv['scripts-dir'] : undefined,
        searchSnippets: safeJsonParse<any[]>(kv['search-snippets'], []),
        angle: typeof kv.angle === 'string' ? kv.angle : 'all',
        count: kv.count ? Number(kv.count) : 6,
        platform: typeof kv.platform === 'string' ? kv.platform : 'zhihu',
        brandName: typeof kv['brand-name'] === 'string' ? kv['brand-name'] : undefined,
        forbidden: safeJsonParse<string[]>(kv.forbidden, []),
      }
      const data = await discoverTopicsNative(opts)
      return { handled: true, data: data as T }
    } catch (err: any) {
      return { handled: true, error: `原生热点雷达执行异常: ${err.message}` }
    }
  }

  // 2. check_topics.py -> 原生选题查重
  if (baseName === 'check_topics.py') {
    try {
      const opts: TopicCheckerOptions = {
        topics: safeJsonParse<string[]>(kv.topics, []),
        scriptsDir: typeof kv['scripts-dir'] === 'string' ? kv['scripts-dir'] : '',
        forbidden: safeJsonParse<string[]>(kv.forbidden, []),
        crossDirs: safeJsonParse<string[]>(kv['cross-dirs'], []),
        historyDirs: safeJsonParse<string[]>(kv['history-dirs'], []),
        thresholdHigh: kv['threshold-high'] ? Number(kv['threshold-high']) : 0.55,
        thresholdMedium: kv['threshold-medium'] ? Number(kv['threshold-medium']) : 0.40,
      }
      const data = checkTopicsNative(opts)
      return { handled: true, data: data as T }
    } catch (err: any) {
      return { handled: true, error: `原生选题查重执行异常: ${err.message}` }
    }
  }

  // 3. build_article.py -> 原生文章/Markdown/HTML构建
  if (baseName === 'build_article.py') {
    try {
      let docSpec: any = {}
      if (kv['doc-json']) {
        docSpec = safeJsonParse(kv['doc-json'], {})
      } else if (kv.doc && typeof kv.doc === 'string' && fs.existsSync(kv.doc)) {
        docSpec = safeJsonParse(fs.readFileSync(kv.doc, 'utf-8'), {})
      }

      const opts: BuildArticleOptions = {
        doc: docSpec,
        platform: typeof kv.platform === 'string' ? kv.platform : 'zhihu',
        articleType: kv['article-type'] === 'newspic' || docSpec.article_type === 'newspic' ? 'newspic' : 'news',
        contentImgCount: kv['content-img-count'] ? Number(kv['content-img-count']) : 2,
        minWords: kv['min-words'] ? Number(kv['min-words']) : 2000,
        brandName: typeof kv['brand-name'] === 'string' ? kv['brand-name'] : '',
        requireBrand: kv['require-brand'] === 'true',
        forbidden: safeJsonParse<string[]>(kv.forbidden, []),
        theme: typeof kv.theme === 'string' ? kv.theme : 'wenying',
      }
      const res = buildArticleNative(opts)
      return {
        handled: true,
        data: {
          ok: res.problems.length === 0,
          ...res,
        } as T,
      }
    } catch (err: any) {
      return { handled: true, error: `原生文章构建执行异常: ${err.message}` }
    }
  }

  // 4. check_html.py -> 原生合规与违禁词校验 (输出契约: { passed, results: [{ file, plain_chars, img_count, problems }] })
  if (baseName === 'check_html.py') {
    try {
      const sdir = typeof kv['scripts-dir'] === 'string' ? kv['scripts-dir'] : ''
      const files: string[] = []
      if (kv.files) {
        files.push(...safeJsonParse<string[]>(kv.files, []))
      } else if (typeof kv._first === 'string') {
        files.push(kv._first)
      }

      const forbidden = safeJsonParse<string[]>(kv.forbidden, [])
      const minWords = kv['min-words'] ? Number(kv['min-words']) : 1500
      const brandName = typeof kv['brand-name'] === 'string' ? kv['brand-name'] : ''
      const requireBrand = kv['require-brand'] === 'true'
      const platform = typeof kv.platform === 'string' ? kv.platform : 'zhihu'
      const expectedImgCount = kv['content-img-count'] ? Number(kv['content-img-count']) : 2

      const results = files.map((f) => {
        const fullPath = path.isAbsolute(f) ? f : (sdir ? path.join(sdir, f) : f)
        const checkRes = validateArticleContentNative({
          filePath: fullPath,
          platform,
          minWords,
          brandName,
          requireBrand,
          forbidden,
          expectedImgCount,
        })
        return {
          file: fullPath,
          plain_chars: checkRes.plain_chars,
          img_count: checkRes.img_count,
          problems: [...checkRes.errors],
        }
      })

      const passed = results.every(r => r.problems.length === 0)
      return {
        handled: true,
        data: {
          passed,
          results,
        } as T,
      }
    } catch (err: any) {
      return { handled: true, error: `原生排版校验执行异常: ${err.message}` }
    }
  }

  // 5. gen_images_pipeline.py -> 原生配图流水线
  if (baseName === 'gen_images_pipeline.py') {
    try {
      let jobSpec: ImageJobSpec = { items: [] }
      const rawScriptsDir = kv['scripts-dir'] || kv.scripts_dir
      const scriptsDir = typeof rawScriptsDir === 'string' ? rawScriptsDir : process.cwd()
      let resolvedJobPath = typeof kv.job === 'string' ? kv.job : undefined

      // [中文修复依据]：对 --job 传入的路径做健壮的多级定位（绝对路径 > 脚本沙箱目录拼合 > 当前 cwd 探测）
      if (resolvedJobPath && typeof resolvedJobPath === 'string') {
        if (!fs.existsSync(resolvedJobPath)) {
          const candidateInScriptsDir = path.join(scriptsDir, resolvedJobPath)
          if (fs.existsSync(candidateInScriptsDir)) {
            resolvedJobPath = candidateInScriptsDir
          } else {
            const candidateInCwd = path.resolve(process.cwd(), resolvedJobPath)
            if (fs.existsSync(candidateInCwd)) {
              resolvedJobPath = candidateInCwd
            }
          }
        }
      }

      if (resolvedJobPath && fs.existsSync(resolvedJobPath)) {
        jobSpec = safeJsonParse<ImageJobSpec>(fs.readFileSync(resolvedJobPath, 'utf-8'), { items: [] })
      } else if (resolvedJobPath || kv.job) {
        throw new Error(`【原生生图拦截失败】：无法定位任务文件 "${resolvedJobPath || String(kv.job)}"（沙箱探测目录: ${scriptsDir}）`)
      }

      if (!jobSpec.scripts_dir && scriptsDir) {
        jobSpec.scripts_dir = scriptsDir
      }

      const res = await generateImagesNative(jobSpec)
      return { handled: true, data: res as T }
    } catch (err: any) {
      return { handled: true, error: `原生生图执行异常: ${err.message}` }
    }
  }

  // 未匹配到 Native 引擎的脚本
  return { handled: false }
}
