import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { genImagesTool } from '../src/tools/genImages.ts'
import { styleGuideTool } from '../src/tools/styleGuide.ts'
import { normalizeConfig } from '../src/config-runtime.ts'

console.log('=== 开始测试小红书去模板化与去套路化系统 ===')

// 1. 测试 Python 模块 xhs_components.py 的 5 大原生体裁与反套话引擎
const testPythonScript = `
import sys
sys.path.insert(0, 'runtime/scripts')
import xhs_components as xc

# 测试 1.1: 5 大叙事体裁均能成功构建且收尾语各具特色
archetypes = ["story_trap", "step_checklist", "comparison_matrix", "myth_buster", "toolkit_resources"]
generated_texts = []

for idx, arch in enumerate(archetypes, 1):
    doc = {
        "index": idx,
        "archetype": arch,
        "title": "测试第%d篇体裁标题" % idx,
        "content": "📌 核心内容段落分享，针对%s展开深度讨论。\\n\\n包含真实亲历细节与可实操步骤，拒绝假大空。" % arch,
        "images": [{"sub": 1, "role": "cover", "prompt": "封面"}],
        "tags": ["科研干货"]
    }
    text, title, plain_chars, img_count, problems = xc.build_note(
        doc, idx, min_words=60, brand_name="文映学术", require_brand=True
    )
    assert len(problems) == 0, "体裁 %s 构建不应出现问题: %s" % (arch, problems)
    assert "文映学术" in text, "必须包含品牌名"
    generated_texts.append(text)

# 验证文末互动语轮换（多篇之间文末互动互不相同）
closings = [t.split("文映学术")[-1].strip() for t in generated_texts]
unique_closings = set(closings)
assert len(unique_closings) >= 3, "各篇文末互动语应当具备轮换多样性，实际不同数: %d" % len(unique_closings)
print("  ✓ 5 大原生体裁构建与文末自然互动语轮换测试通过")

# 测试 1.2: AI 八股套话拦截
doc_cliche = {
    "index": 1,
    "title": "合规标题测试",
    "content": "在当今快节奏的社会中，不可否认的是，毋庸置疑文献阅读很重要。随着时代的发展，显而易见我们需要努力。\\n#科研",
    "images": [{"sub": 1, "role": "cover", "prompt": "封面"}],
    "tags": ["科研"]
}
t, ti, pc, ic, probs = xc.build_note(doc_cliche, 1, min_words=30)
assert any("AI八股套话超标" in p for p in probs), "应识别出AI八股套话违规: " + str(probs)
print("  ✓ AI 八股套话去油检测拦截测试通过")
`

const pyOut = execFileSync('python', ['-c', testPythonScript], { encoding: 'utf-8' })
console.log(pyOut.trim())

// 2. 测试标题句式多样性检测 (pipeline/check_topics.py)
const scriptsDir = path.resolve('scratch')
fs.mkdirSync(scriptsDir, { recursive: true })

const repetitiveTopics = [
  '3步搞定文献综述技巧',
  '5步搞定开题报告框架',
  '4步搞定论文引言写作',
]

const topicCheckCmd = [
  'pipeline/check_topics.py',
  '--topics', JSON.stringify(repetitiveTopics),
  '--scripts-dir', scriptsDir,
]

const topicStdout = execFileSync('python', topicCheckCmd, { encoding: 'utf-8' })
const topicResultLine = topicStdout.split('\n').find((l) => l.startsWith('###RESULT### '))
assert(topicResultLine, 'check_topics 应该输出 ###RESULT###')
const topicJson = JSON.parse(topicResultLine.replace('###RESULT### ', ''))

const items = topicJson.data.items
assert(
  items.some((it: any) => it.warning && it.warning.includes('去套路化提示')),
  '同批次全都是数字清单句式时应触发去套路化提示',
)
console.log('  ✓ pipeline/check_topics.py 标题句式多样性查重测试通过')

import { validateImportConfig } from '../src/config-io.ts'

// 3. 测试 TypeScript 侧 styleGuide 与 genImages 视觉美学矩阵
const inputConfig = {
  runtime: { dry_run: true },
  image_api: { headline_cover_ratio: '2.35:1', secondary_cover_ratio: '1:1' },
  accounts: {
    test_xhs: {
      platform: 'xiaohongshu',
      name: '测试小红书',
      enabled: true,
      author_name: '学姐科研笔记win00.cn',
      brand_name: '学姐科研笔记',
      content: {
        articles_per_day: 4,
        xhs_images_per_note: 3,
        xhs_min_words: 200,
        xhs_tags: ['研究生', '学术日常'],
        topics: ['文献综述', '开题报告'],
        forbidden_words: [],
      },
    },
  },
}
const valResult = validateImportConfig(inputConfig as any)
const testConfig = normalizeConfig(valResult.data!)
if (!testConfig.runtime) testConfig.runtime = { dry_run: true } as any
testConfig.runtime.dry_run = true

// 测试 styleGuide 返回去套路化 archetypePlan
const sgTool = styleGuideTool(testConfig)
const sgResult = (await sgTool.execute({ account_id: 'test_xhs' })) as any
assert(sgResult.theme_plan.note_1, '应当提供 note_1 的体裁规划')
assert(sgResult.theme_plan.note_2, '应当提供 note_2 的体裁规划')
assert.notEqual(sgResult.theme_plan.note_1, sgResult.theme_plan.note_2, '篇1与篇2体裁规划应不同')
console.log('  ✓ styleGuide 工具小红书多体裁规划调度测试通过')

// 测试 genImages 为小红书生成 4 类不同美学风格的提示词
const imgTool = genImagesTool(testConfig)
const genItems = [
  { kind: 'pic', index: 1, sub: 1, prompt: '封面大标题' },
  { kind: 'pic', index: 2, sub: 1, prompt: '封面大标题' },
  { kind: 'pic', index: 3, sub: 1, prompt: '封面大标题' },
  { kind: 'pic', index: 4, sub: 1, prompt: '封面大标题' },
]

testConfig.runtime.dry_run = true
const imgResult = (await imgTool.execute({
  account_id: 'test_xhs',
  items: genItems,
  titles: ['文献精读技巧', '开题避坑指南', '学术工具测评', '认知颠覆真相'],
})) as any

assert.equal(imgResult.generated.length, 4, '应生成4张卡片任务')
console.log('  ✓ genImages 视觉美学矩阵多画风分发测试通过')

console.log('\n=== 全部小红书去模板化与去套路化测试顺利通过！===')
