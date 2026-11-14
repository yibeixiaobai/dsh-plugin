import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { mdToPasteHtml } from '../src/zhihu.ts'

console.log('=== 开始测试百家号平台构建与合规管线 ===')

// 1. 测试 pipeline/build_article.py 百家号分支（Markdown 形态，复用 zhihu_components）
const scriptsDir = path.resolve('scratch')
fs.mkdirSync(scriptsDir, { recursive: true })
const docFile = 'doc_baijiahao_1.json'
const doc = {
  index: 1,
  intro: { pre: '论文投稿从来不是碰运气', hl: '选刊匹配度', post: '才是录用的关键变量' },
  toc: ['看懂刊物定位', '避开预警期刊', '投稿流程要点'],
  sections: [
    {
      h2: '01',
      text: '选刊先看收录体系与办刊方向',
      blocks: [
        { p: ['选择期刊的第一步是判断收录体系与办刊方向是否与自己的研究方向匹配，', ['kw', '选刊匹配度'], '越高，审稿人对文章价值的判断就越快，录用周期也越可控。'] },
        { card: '先查刊物近三年的收稿方向，再决定是否投稿' },
        { img: { src: 'IMG_A1_1', caption: '选刊流程示意图' } },
      ],
    },
    {
      h2: '02',
      text: '投稿前的三步自查清单',
      blocks: [
        { p: ['投稿前完成格式规范、查重预检与单位信息核对三步自查，可以显著降低因形式问题被退修的概率，把精力留给真正的学术内容打磨。'] },
        { card_ul: { title: '自查要点', items: ['格式符合投稿须知', '重复率符合要求', '作者信息完整'] } },
      ],
    },
  ],
  sign_off: '欢迎关注「文映千秋学术网」，获取更多期刊投稿干货。',
}
fs.writeFileSync(path.join(scriptsDir, docFile), JSON.stringify(doc), 'utf-8')

const buildOut = execFileSync('python', [
  'pipeline/build_article.py',
  '--doc', docFile,
  '--scripts-dir', scriptsDir,
  '--resource-dir', 'runtime',
  '--min-words', '80',
  '--forbidden', '["代写","代发"]',
  '--brand-name', '文映千秋学术网',
  '--require-brand',
  '--platform', 'baijiahao',
  '--content-img-count', '1',
], { encoding: 'utf-8' })
const buildLine = buildOut.split('\n').find((l) => l.startsWith('###RESULT### '))
assert(buildLine, 'build_article.py 应输出 ###RESULT### 结果')
const buildJson = JSON.parse(buildLine.replace('###RESULT### ', ''))
assert.equal(buildJson.ok, true, '百家号构建应通过: ' + JSON.stringify(buildJson.error || buildJson.data?.problems))
assert.equal(buildJson.data.platform, 'baijiahao', '构建产物应标记 platform=baijiahao')
const md = buildJson.data.markdown as string
assert(md.includes('## 01'), 'Markdown 应包含 ## 章节标题')
assert(md.includes('![选刊流程示意图](IMG_A1_1)'), 'Markdown 应包含 IMG_A 占位符图片')
assert(md.includes('文映千秋学术网'), 'Markdown 应包含品牌引导语')
console.log('  ✓ build_article.py --platform baijiahao Markdown 构建测试通过')

// 2. 合规文章通过 check_html.py --platform baijiahao
const articleFile = path.join(scriptsDir, 'article_v2_1.md')
fs.writeFileSync(articleFile, md, 'utf-8')
const checkCleanCmd = [
  'pipeline/check_html.py',
  '--files', JSON.stringify(['article_v2_1.md']),
  '--scripts-dir', scriptsDir,
  '--resource-dir', 'runtime',
  '--min-words', '80',
  '--forbidden', '["代写","代发"]',
  '--brand-name', '文映千秋学术网',
  '--img-count', '1',
  '--allow-placeholders',
  '--platform', 'baijiahao',
  '--require-brand',
]
const cleanOut = execFileSync('python', checkCleanCmd, { encoding: 'utf-8' })
const cleanLine = cleanOut.split('\n').find((l) => l.startsWith('###RESULT### '))
assert(cleanLine, 'check_html.py 应输出 ###RESULT### 结果')
const cleanJson = JSON.parse(cleanLine.replace('###RESULT### ', ''))
assert.equal(cleanJson.data.passed, true, '合规文章校验应通过: ' + JSON.stringify(cleanJson.data.results[0].problems))
console.log('  ✓ check_html.py --platform baijiahao 合规文章放行通过')

// 3. 导流红线拦截（微信号/外链/二维码）
fs.writeFileSync(
  articleFile,
  '## 01 投稿经验分享\n\n这篇文章分享投稿流程。更多资料请加微信号 wx_test123 领取，或访问 https://win00.cn/download 下载模板，扫描下方二维码进群。\n\n关注「文映千秋学术网」获取更多干货。',
  'utf-8',
)
const divertOut = execFileSync('python', checkCleanCmd, { encoding: 'utf-8' })
const divertLine = divertOut.split('\n').find((l) => l.startsWith('###RESULT### '))
assert(divertLine, '导流校验应输出 ###RESULT### 结果')
const divertJson = JSON.parse(divertLine.replace('###RESULT### ', ''))
assert.equal(divertJson.data.passed, false, '导流文章校验应失败')
const divertProblems = divertJson.data.results[0].problems as string[]
assert(divertProblems.some((p) => p.includes('禁止导流') && p.includes('微信')), '应拦截微信号导流: ' + JSON.stringify(divertProblems))
assert(divertProblems.some((p) => p.includes('禁止外链')), '应拦截外链域名')
console.log('  ✓ check_html.py --platform baijiahao 导流红线拦截通过')

// 4. 禁词与字数容差拦截
fs.writeFileSync(
  articleFile,
  '## 01 短文\n\n这篇涉及代写服务。\n\n关注「文映千秋学术网」。',
  'utf-8',
)
const shortOut = execFileSync('python', checkCleanCmd, { encoding: 'utf-8' })
const shortLine = shortOut.split('\n').find((l) => l.startsWith('###RESULT### '))
const shortJson = JSON.parse(shortLine!.replace('###RESULT### ', ''))
assert.equal(shortJson.data.passed, false, '禁词/字数不足文章校验应失败')
const shortProblems = shortJson.data.results[0].problems as string[]
assert(shortProblems.some((p) => p.includes('禁词')), '应识别禁词')
assert(shortProblems.some((p) => p.includes('低于容差下限')), '应识别字数不足')
console.log('  ✓ check_html.py --platform baijiahao 禁词与字数容差拦截通过')

// 5. mdToPasteHtml 纯函数回归（知乎/百家号共享受限 Markdown → 粘贴富文本转换器）
const html = mdToPasteHtml('## 01 标题\n\n正文段落带**加粗关键词**。\n\n![配图](IMG_A1_1)\n\n- 要点一\n- 要点二\n\n> 引用内容\n\n---\n\n结尾段落。')
assert(html.includes('<h2>01 标题</h2>'), 'h2 应转换为 <h2>: ' + html)
assert(html.includes('<strong>加粗关键词</strong>'), '**x** 应转换为 <strong>: ' + html)
assert(html.includes('<img src="IMG_A1_1"'), '图片应转换为 <img> 且保留占位符: ' + html)
assert(html.includes('<li>要点一</li>'), '列表应转换为 <li>: ' + html)
assert(html.includes('<blockquote>'), '引用应转换为 <blockquote>: ' + html)
assert(html.includes('<hr>'), '分隔线应转换为 <hr>: ' + html)
assert(!html.includes('\n#'), '不应产生标题转义问题')
console.log('  ✓ mdToPasteHtml 受限 Markdown 转换器回归通过')

console.log('\n=== 全部百家号平台构建与合规测试顺利通过！===')
