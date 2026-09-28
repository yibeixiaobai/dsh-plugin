import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

console.log('=== 开始测试小红书平台规则合规系统（协议编号：ZXXY20221213003）===')

// 1. 测试 Python 模块 xhs_components.py
const testPythonScript = `
import sys
import json
sys.path.insert(0, 'runtime/scripts')
import xhs_components as xc

# 测试 1: 标题字数合规 (<= 20 字)
doc_valid = {
    "index": 1,
    "title": "3步搞定文献综述技巧",
    "content": "📌 核心速览：\\n文献检索是科研的第一步，分享3个实用的筛选原则。\\n\\n✅ 原则一：先看顶刊高被引\\n✅ 原则二：建立文献追踪矩阵\\n✅ 原则三：善用文献管理工具\\n\\n💡 避坑提醒：不要盲目下载，精读才是关键！",
    "images": [
        {"sub": 1, "role": "cover", "prompt": "封面图"},
        {"sub": 2, "role": "content", "prompt": "内容图1"},
        {"sub": 3, "role": "content", "prompt": "内容图2"}
    ],
    "tags": ["科研干货", "论文写作"]
}

# 正常构建
text, title, plain_chars, img_count, problems = xc.build_note(
    doc_valid, 1, min_words=100, brand_name="文映学术win00.cn", require_brand=True
)
assert len(title) <= 20, "标题不能超过20字"
assert img_count == 3, "图片应为3张"
assert "文映学术" in text, "文末应合规包含清洗后的品牌名"
assert "win00.cn" not in text, "严禁泄露外部域名win00.cn"
assert len(problems) == 0, "合规内容不应报问题: " + str(problems)
print("  ✓ 基础合规构建与品牌域名自动脱敏测试通过")

# 测试 2: 标题超过 20 字直接断言拦截
doc_long_title = dict(doc_valid, title="手把手教你如何在一个月之内搞定高水平核心期刊论文开题报告")
try:
    xc.build_note(doc_long_title, 1, min_words=100)
    assert False, "长标题应抛出断言"
except AssertionError as e:
    assert "超过 20 字上限" in str(e)
    print("  ✓ 标题超20字拦截测试通过")

# 测试 3: 导流行为拦截（微信/微信号/手机/外链）
doc_diversion = dict(doc_valid, content=doc_valid["content"] + "\\n\\n需要资料请加微信号 wx_test123 免费领取！")
t, ti, pc, ic, probs = xc.build_note(doc_diversion, 1, min_words=100)
assert any("禁止导流" in p for p in probs), "应识别微信导流违规"
print("  ✓ 微信号导流拦截测试通过")

# 测试 4: 外部网址链接拦截
doc_url = dict(doc_valid, content=doc_valid["content"] + "\\n\\n详情可访问官网 https://win00.cn/read 查看。")
t, ti, pc, ic, probs = xc.build_note(doc_url, 1, min_words=100)
assert any("禁止外链" in p for p in probs), "应识别外链违规"
print("  ✓ 外部网址链接拦截测试通过")

# 测试 5: 学术不端与违规代写/保过拦截
doc_academic = dict(doc_valid, content=doc_valid["content"] + "\\n\\n支持加急代写，承诺100%包过，不满意全额退款。")
t, ti, pc, ic, probs = xc.build_note(doc_academic, 1, min_words=100)
assert any("违规交易" in p for p in probs), "应识别学术代办违规"
print("  ✓ 学术代写与违规承诺拦截测试通过")

# 测试 6: 广告极限词拦截
doc_extreme = dict(doc_valid, title="全网第一文献神器")
t, ti, pc, ic, probs = xc.build_note(doc_extreme, 1, min_words=100)
assert any("虚假夸大" in p for p in probs), "应识别广告极限词违规"
print("  ✓ 广告法极限词拦截测试通过")

# 测试 7: 话题标签规范与去重
doc_tags = dict(doc_valid, tags=["#科研干货#", "科研干货", "论文写作", " #考研# "])
clean_tags = xc.sanitize_xhs_tags(doc_tags["tags"])
assert clean_tags == ["科研干货", "论文写作", "考研"], "标签应去重并去除井号杂质"
print("  ✓ 话题标签清洗去重测试通过")
`

const pyOut = execFileSync('python', ['-c', testPythonScript], { encoding: 'utf-8' })
console.log(pyOut.trim())

// 2. 测试 pipeline/check_html.py 机器校验入口
const scriptsDir = path.resolve('scratch')
fs.mkdirSync(scriptsDir, { recursive: true })
const testNoteFile = path.join(scriptsDir, 'article_v2_1_xhs.txt')

// 写一个包含导流的违规笔记
fs.writeFileSync(
  testNoteFile,
  '📌 核心速览：这是一篇测试笔记。\\n加微信 test123 领取资料。\\n访问 https://win00.cn 下载模板。\\n#学术干货 ',
  'utf-8',
)

// 运行 check_html.py 校验
const checkCmd = [
  'pipeline/check_html.py',
  '--files', JSON.stringify(['article_v2_1_xhs.txt']),
  '--scripts-dir', scriptsDir,
  '--min-words', '20',
  '--img-count', '0',
  '--platform', 'xiaohongshu',
]

try {
  const stdout = execFileSync('python', checkCmd, { encoding: 'utf-8' })
  const resultLine = stdout.split('\n').find((l) => l.startsWith('###RESULT### '))
  assert(resultLine, '应该输出 ###RESULT### 结果')
  const json = JSON.parse(resultLine.replace('###RESULT### ', ''))
  assert.equal(json.data.passed, false, '违规笔记校验应失败')
  const problems = json.data.results[0].problems
  assert(problems.some((p: string) => p.includes('禁止导流') || p.includes('禁止外链')), '应准确检测出导流违规')
  console.log('  ✓ pipeline/check_html.py 违规拦截校验通过')
} catch (err) {
  console.error('check_html.py 运行失败:', err)
  process.exit(1)
}

// 3. 测试合规笔记通过 check_html.py
fs.writeFileSync(
  testNoteFile,
  '📌 核心速览：\\n这是一篇精心打磨的学术笔记，分享关于文献阅读与论文复现的实践经验。\\n' +
  '✅ 第一步：提炼核心假设\\n' +
  '✅ 第二步：复现核心实验\\n' +
  '✅ 第三步：记录关键差异\\n\\n' +
  '💡 总结建议：多动手推导与复现，欢迎在评论区一起讨论交流。\\n\\n' +
  '#文献阅读 #科研干货',
  'utf-8',
)

// 准备假图片文件以便通过 img_count 校验
fs.writeFileSync(path.join(scriptsDir, 'pic_1_1.png'), 'fake_img')
fs.writeFileSync(path.join(scriptsDir, 'pic_1_2.png'), 'fake_img')

const checkCleanCmd = [
  'pipeline/check_html.py',
  '--files', JSON.stringify(['article_v2_1_xhs.txt']),
  '--scripts-dir', scriptsDir,
  '--min-words', '50',
  '--img-count', '2',
  '--platform', 'xiaohongshu',
]

const cleanStdout = execFileSync('python', checkCleanCmd, { encoding: 'utf-8' })
const cleanLine = cleanStdout.split('\n').find((l) => l.startsWith('###RESULT### '))
assert(cleanLine, '应该输出 ###RESULT### 结果')
const cleanJson = JSON.parse(cleanLine.replace('###RESULT### ', ''))
assert.equal(cleanJson.data.passed, true, '合规笔记校验应完全通过: ' + JSON.stringify(cleanJson.data.results[0].problems))
console.log('  ✓ pipeline/check_html.py 合规笔记放行通过')

console.log('\n=== 全部小红书平台规则合规测试顺利通过！===')
