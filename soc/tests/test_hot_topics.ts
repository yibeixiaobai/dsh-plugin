import assert from 'node:assert'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Config, DEFAULT_CONTENT } from '../src/config.ts'
import { normalizeConfig } from '../src/config-runtime.ts'
import { discoverTopicsTool } from '../src/tools/discoverTopics.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

console.log('=== 开始测试动态热点选题雷达与搜索聚合系统 ===\n')

// 1. 测试 Python 核心计算层 discover_topics.py 基本执行与时令日历
console.log('【1】测试 Python 核心计算层 discover_topics.py')
const pyProc = spawnSync('python', [
  path.join(ROOT, 'pipeline', 'discover_topics.py'),
  '--keywords', JSON.stringify(['期刊发表', '专著出版', '职称评审']),
  '--count', '6',
  '--platform', 'gzh',
], { encoding: 'utf-8', timeout: 15000 })

assert.strictEqual(pyProc.status, 0, `Python 执行失败: ${pyProc.stderr}`)
const outLines = pyProc.stdout.trim().split('\n')
const resultLine = outLines.find((l) => l.startsWith('###RESULT### '))
assert(resultLine, '必须输出 ###RESULT### 标记行')

const result = JSON.parse(resultLine.slice('###RESULT### '.length))
assert.strictEqual(result.ok, true, '执行结果 ok 必须为 true')
assert(result.data, '必须返回 data 字段')

const data = result.data
assert.strictEqual(data.platform, 'gzh', '平台应为 gzh')
assert(data.seasonal_focus, '必须包含 seasonal_focus')
assert(typeof data.seasonal_focus.month === 'number', '时令日历必须包含月份数字')
assert(data.seasonal_focus.focus, '必须包含当月时令焦点说明')

console.log(`  ✓ 当前月份: ${data.seasonal_focus.month}月`)
console.log(`  ✓ 当月时令焦点: ${data.seasonal_focus.focus}`)
console.log(`  ✓ 抓取实时搜索新闻数: ${data.trending_signals?.search_news_count ?? 0}`)
console.log(`  ✓ 实时热搜下拉联想: ${(data.trending_signals?.surging_queries || []).slice(0, 4).join('、')}`)

// 2. 测试推荐选题质量与防线
console.log('\n【2】测试推荐选题多维切角与合规守卫')
const topics = data.recommended_topics
assert(Array.isArray(topics) && topics.length >= 4, `推荐选题数量应 >= 4，实际为 ${topics.length}`)

const angles = new Set(topics.map((t: any) => t.angle))
console.log(`  ✓ 覆盖切角类型: ${Array.from(angles).join(', ')}`)
assert(angles.size >= 3, '同批次选题必须覆盖至少 3 种不同切角（去模板化）')

for (const item of topics) {
  assert(item.title && typeof item.title === 'string', '选题必须有有效 title')
  assert(item.hot_score > 0, '必须有热度打分')
  assert(item.composite_score > 0, '必须有综合推荐分')
  assert(item.reason, '必须给出推荐动因与搜索依据')

  // 严禁前缀铁律守卫
  assert(!/^(\s*[\[【(（].+?[\]】)）]\s*|[^\s：:]{2,12}[：:])/.test(item.title),
    `严禁冒号或方括号前缀: ${item.title}`)

  // 严禁人机感与标题党套路词断言
  const cliches = ['重磅', '惊呆', '手把手', '保姆级', '避坑指南', '深水区', '致命盲区', '90%人搞错', '颠覆认知', '千万别', '大坑', '决胜']
  for (const c of cliches) {
    assert(!item.title.includes(c), `标题不得包含营销号/人机标题党套话「${c}」: ${item.title}`)
  }

  // 严禁学术论文八股与官方公文官话
  const academicJargon = ['常态化机制', '内在逻辑', '佐证要点', '演进路径', '理性应对', '理性分析', '评价演进']
  for (const aj of academicJargon) {
    assert(!item.title.includes(aj), `标题过于学术论文腔/公文八股「${aj}」，不符合社媒流量传播: ${item.title}`)
  }

  // 情绪降温：感叹号不得超过 1 个
  const exCount = (item.title.match(/[！!]/g) || []).length
  assert(exCount <= 1, `标题感叹号过多（人机感）: ${item.title}`)

  // 社交传播简洁明了度守卫：推荐 15~25 字，杜绝 30 字以上论文冗长感
  assert(item.title.length <= 26, `标题过于冗长（${item.title.length}字），手机端难于一眼看懂: ${item.title}`)
  assert(item.title.length >= 14, `标题过短（${item.title.length}字），信息量不足: ${item.title}`)
}
console.log('  ✓ 全部推荐选题均通过无前缀、去人机感、去标题党套话、去学术论文八股合规检测')
console.log(`  ✓ Top 1 选题: 《${topics[0].title}》（长度: ${topics[0].title.length}字，得分: ${topics[0].composite_score}）`)

// 3. 测试外部搜索资讯摘要注入 (Agent 搜索工具协同)
console.log('\n【3】测试 Agent 外部搜索摘要注入协同')
const customSnippet = [
  {
    title: '重磅！2026年最新中科院SCI期刊预警目录正式发布！37本期刊被标记',
    snippet: '中科院文献情报中心发布最新一期预警名单，多本知名开放获取期刊上榜',
    source: 'Agent搜索工具',
  },
]

const pyInject = spawnSync('python', [
  path.join(ROOT, 'pipeline', 'discover_topics.py'),
  '--keywords', JSON.stringify(['期刊发表']),
  '--search-snippets', JSON.stringify(customSnippet),
  '--count', '4',
  '--platform', 'gzh',
], { encoding: 'utf-8', timeout: 15000 })

assert.strictEqual(pyInject.status, 0, `Python 执行失败: ${pyInject.stderr}`)
const injectResultLine = pyInject.stdout.trim().split('\n').find((l) => l.startsWith('###RESULT### '))
const injectResult = JSON.parse(injectResultLine!.slice('###RESULT### '.length))
const injectTopics = injectResult.data.recommended_topics
const policyTopic = injectTopics.find((t: any) => t.angle === 'policy')
assert(policyTopic, '必须生成政策解读类选题')
console.log(`  ✓ 外部搜索摘要成功转化为爆款选题: 《${policyTopic.title}》`)
console.log(`  ✓ 选题依据: ${policyTopic.reason}`)

// 4. 测试小红书平台标题严格 <= 20 字守卫
console.log('\n【4】测试小红书平台专属短标题守卫 (严格 <= 20 字)')
const pyXhs = spawnSync('python', [
  path.join(ROOT, 'pipeline', 'discover_topics.py'),
  '--keywords', JSON.stringify(['考研复试', '文献综述', '开题报告']),
  '--count', '6',
  '--platform', 'xiaohongshu',
], { encoding: 'utf-8', timeout: 15000 })

assert.strictEqual(pyXhs.status, 0, `小红书 Python 执行失败: ${pyXhs.stderr}`)
const xhsResultLine = pyXhs.stdout.trim().split('\n').find((l) => l.startsWith('###RESULT### '))
const xhsResult = JSON.parse(xhsResultLine!.slice('###RESULT### '.length))
const xhsTopics = xhsResult.data.recommended_topics
assert(xhsTopics.length > 0, '小红书应生成选题')

for (const t of xhsTopics) {
  assert(t.title.length <= 20, `小红书标题必须 <= 20 字，实际 "${t.title}" 长度为 ${t.title.length}`)
}
console.log('  ✓ 小红书平台全部 6 篇推荐选题严格符合 <= 20 字硬性限制:')
for (const t of xhsTopics) {
  console.log(`    - [${t.angle_name}] 《${t.title}》（${t.title.length}字）`)
}

// 5. 测试 TypeScript 工具层 gzh_discover_topics
console.log('\n【5】测试 TypeScript 工具层 discoverTopicsTool')
const baseConfig: Config = normalizeConfig({
  accounts: {
    default: {
      platform: 'gzh',
      name: '测试公众号',
      enabled: true,
      publish_mode: 'api',
      appid: 'wx_mock',
      app_secret: 'sec_mock',
      author_name: '文映学术',
      brand_name: '文映千秋学术网',
      publish_immediately: false,
      content: {
        ...DEFAULT_CONTENT,
        topics: ['期刊发表', '专著出版', '专利申报'],
      },
      brand_images: {
        header: { enabled: false, file: '', width: 0, height: 0, fit: 'cover', position: 'center', radius: 0, margin_top: 0, margin_bottom: 0, frame: false },
        footer: { enabled: false, file: '', width: 0, height: 0, fit: 'cover', position: 'center', radius: 0, margin_top: 0, margin_bottom: 0, frame: false },
      },
    },
  },
  default_account: 'default',
  image_providers: {},
  wechat: { appid: '', app_secret: '', author_name: '', brand_name: '' },
  content: DEFAULT_CONTENT,
  brand_images: {
    header: { enabled: false, file: '', width: 0, height: 0, fit: 'cover', position: 'center', radius: 0, margin_top: 0, margin_bottom: 0, frame: false },
    footer: { enabled: false, file: '', width: 0, height: 0, fit: 'cover', position: 'center', radius: 0, margin_top: 0, margin_bottom: 0, frame: false },
  },
  image_api: {
    base_url: '',
    api_key: '',
    model: '',
    headline_cover_ratio: '2.35:1',
    secondary_cover_ratio: '1:1',
    content_images_per_article: 2,
    image_lang_zh_only: true,
  },
  runtime: {
    project_root: '',
    python_path: 'python',
    request_timeout_ms: 20000,
    dry_run: true,
    verify_after_publish: false,
    use_upload_cache: false,
    need_open_comment: false,
    chrome_path: '',
    zhihu_headless: true,
  },
})

const tool = discoverTopicsTool(baseConfig)
assert.strictEqual(tool.name, 'gzh_discover_topics', '工具名称必须为 gzh_discover_topics')

const toolRes = await tool.execute({
  account_id: 'default',
  count: 3,
})

assert.strictEqual(toolRes.account_id, 'default')
assert(toolRes.seasonal_focus)
assert(Array.isArray(toolRes.recommended_topics))
assert.strictEqual(toolRes.recommended_topics.length, 3, '应返回请求的 3 个选题')

console.log('  ✓ gzh_discover_topics 工具端到端调用成功')
console.log(`  ✓ 返回 account_id: ${toolRes.account_id}`)
console.log(`  ✓ 成功产出 ${toolRes.recommended_topics.length} 个推荐热点选题`)

console.log('\n=== 全部动态热点选题雷达与搜索聚合测试通过！===')
