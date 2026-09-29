import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { normalizeConfig } from '../src/config-runtime.ts'
import { ConfigSchema } from '../src/config.ts'
import { syncConfig } from '../src/sync.ts'

console.log('=== 开始测试百家号品牌图、内容规则及配置隔离架构 ===\n')

// 1. 验证 normalizeConfig 平台严格隔离与零值/假值保持
console.log('【1】测试 normalizeConfig 平台严格隔离与 0/false 保留')

const rawConfig = {
  default_account: 'test_bjh',
  wechat: {
    appid: 'wx_root_appid_secret_123',
    app_secret: 'wx_root_app_secret_456',
    author_name: '微信根作者',
  },
  accounts: {
    test_bjh: {
      id: 'test_bjh',
      platform: 'baijiahao',
      name: '测试百家号账号',
      publish_mode: 'browser',
      publish_immediately: false,
      author_name: '百家号专属作者',
      brand_name: '文映学术百家号',
      content: {
        min_words: 0, // 允许设置为 0，不能被 fallback 成 800 或 2000
        content_images_per_article: 0, // 允许设置为 0
        articles_per_day: 3,
        ending_guide_required: false, // 允许设置为 false，不能被 fallback 成 true
        enable_hot_tracking: true,
        preferred_topic_angles: ['前沿方法剖析', '落地实战拆解'],
      },
      brand_images: {
        header: {
          enabled: true,
          file: 'bjh_brand_top.png',
          width: 90,
          frame: false,
        },
        footer: {
          enabled: true,
          file: 'bjh_brand_bot.png',
          width: 90,
          frame: false,
        },
      },
    },
    test_zhihu: {
      id: 'test_zhihu',
      platform: 'zhihu',
      name: '测试知乎账号',
      content: {
        min_words: 500,
        content_images_per_article: 1,
      },
    },
    test_gzh: {
      id: 'test_gzh',
      platform: 'gzh',
      name: '测试公众号',
      appid: 'wx_exclusive_appid_789',
      app_secret: 'wx_exclusive_secret_000',
    },
  },
}

const normalized = normalizeConfig(rawConfig as any)

// 断言 百家号账号不会被注入微信 appid/app_secret
assert.equal(normalized.accounts.test_bjh.appid, '', '百家号账号绝不能继承或被注入微信 AppID（必须为空字符串）')
assert.equal(normalized.accounts.test_bjh.app_secret, '', '百家号账号绝不能继承或被注入微信 AppSecret（必须为空字符串）')
assert.equal(normalized.accounts.test_bjh.platform, 'baijiahao')
assert.equal(normalized.accounts.test_bjh.content.min_words, 0, 'min_words=0 必须被如实保留')
assert.equal(normalized.accounts.test_bjh.content.content_images_per_article, 0, 'content_images_per_article=0 必须被如实保留')
assert.equal(normalized.accounts.test_bjh.content.ending_guide_required, false, 'ending_guide_required=false 必须被如实保留')
assert.equal(normalized.accounts.test_bjh.content.enable_hot_tracking, true)
assert.deepEqual(normalized.accounts.test_bjh.content.preferred_topic_angles, ['前沿方法剖析', '落地实战拆解'])
assert.equal(normalized.accounts.test_bjh.brand_images.header.enabled, true)
assert.equal(normalized.accounts.test_bjh.brand_images.header.file, 'bjh_brand_top.png')
assert.equal(normalized.accounts.test_bjh.brand_images.footer.enabled, true)
assert.equal(normalized.accounts.test_bjh.brand_images.footer.file, 'bjh_brand_bot.png')

// 断言 知乎账号隔离
assert.equal(normalized.accounts.test_zhihu.appid, '', '知乎账号绝不能继承或被注入微信 AppID（必须为空字符串）')
assert.equal(normalized.accounts.test_zhihu.app_secret, '', '知乎账号绝不能继承或被注入微信 AppSecret（必须为空字符串）')
assert.equal(normalized.accounts.test_zhihu.content.content_images_per_article, 1)

// 断言 公众号账号凭据正常
assert.equal(normalized.accounts.test_gzh.appid, 'wx_exclusive_appid_789')
assert.equal(normalized.accounts.test_gzh.app_secret, 'wx_exclusive_secret_000')

console.log('  ✓ normalizeConfig 平台凭据隔离与零值保留测试通过')

// 2. 测试百家号首尾品牌图 Markdown 构建 (build_article.py)
console.log('【2】测试百家号首尾品牌图 Markdown 构建 (build_article.py)')

const tmpDir = path.resolve('tmp_test_bjh_' + Date.now())
const scriptsDir = path.join(tmpDir, 'scripts')
fs.mkdirSync(scriptsDir, { recursive: true })

try {
  const docFile = 'test_bjh_doc.json'
  const doc = {
    index: 1,
    title: '百家号品牌图全流程发布规范与指南',
    intro: { pre: '在百家号内容运营中，', hl: '规范的品牌视觉首尾呼应', post: '能够显著提高读者的认知粘性与品牌信任感。' },
    sections: [
      {
        h2: '01 视觉形象建立',
        text: '通过在文章头部统一插入品牌展示图，向读者展示规范的机构形象。',
        blocks: [
          { p: ['文章主体内容逻辑清晰、论据充分，能够提供优质信息增量。'] },
        ],
      },
    ],
    sign_off: '欢迎关注「文映学术百家号」，获取更多独家行业分析。',
  }
  fs.writeFileSync(path.join(scriptsDir, docFile), JSON.stringify(doc), 'utf-8')

  const brandImagesArg = JSON.stringify({
    header: { enabled: true, file: 'bjh_brand_top.png' },
    footer: { enabled: true, file: 'bjh_brand_bot.png' },
  })

  const buildOut = execFileSync('python', [
    'pipeline/build_article.py',
    '--doc', docFile,
    '--scripts-dir', scriptsDir,
    '--resource-dir', 'runtime',
    '--min-words', '0',
    '--forbidden', '[]',
    '--brand-name', '文映学术百家号',
    '--require-brand',
    '--platform', 'baijiahao',
    '--content-img-count', '0',
    '--brand-images', brandImagesArg,
  ], { encoding: 'utf-8' })

  const buildLine = buildOut.split('\n').find((l) => l.startsWith('###RESULT### '))
  assert(buildLine, 'build_article.py 应输出 ###RESULT###')
  const buildJson = JSON.parse(buildLine.replace('###RESULT### ', ''))
  assert.equal(buildJson.ok, true, '百家号品牌图构建应成功: ' + JSON.stringify(buildJson.error))
  const md = buildJson.data.markdown as string

  // 断言首尾品牌图占位符正确插入
  assert(md.startsWith('![头部品牌图](__BRAND_TOP__)\n\n'), '百家号文章开头必须以头部品牌图占位符起始')
  assert(md.trimEnd().endsWith('![尾部品牌图](__BRAND_BOT__)'), '百家号文章结尾必须以尾部品牌图占位符结束')
  assert.equal(buildJson.data.img_count, 2, '正文配图为0时，包含2张品牌图，img_count 应为 2')

  console.log('  ✓ 百家号首尾品牌图 Markdown 正确生成并通过断言')

  // 3. 测试百家号包含首尾品牌图的 check_html.py 合规性校验
  console.log('【3】测试百家号品牌图合规性放行与图片数断言 (check_html.py)')

  const articleFile = path.join(scriptsDir, 'article_v2_1.md')
  fs.writeFileSync(articleFile, md, 'utf-8')

  const checkCmd = [
    'pipeline/check_html.py',
    '--files', JSON.stringify(['article_v2_1.md']),
    '--scripts-dir', scriptsDir,
    '--resource-dir', 'runtime',
    '--min-words', '0',
    '--forbidden', '[]',
    '--brand-name', '文映学术百家号',
    '--img-count', '2', // 2张品牌图
    '--allow-placeholders',
    '--platform', 'baijiahao',
    '--require-brand',
  ]
  const checkOut = execFileSync('python', checkCmd, { encoding: 'utf-8' })
  const checkLine = checkOut.split('\n').find((l) => l.startsWith('###RESULT### '))
  assert(checkLine, 'check_html.py 应输出 ###RESULT###')
  const checkJson = JSON.parse(checkLine.replace('###RESULT### ', ''))
  assert.equal(checkJson.data.passed, true, '百家号合规校验放行通过: ' + JSON.stringify(checkJson.data.results[0].problems))

  console.log('  ✓ 百家号首尾品牌图合规校验放行通过')

  // 4. 测试各账号 scripts 目录 wx_config.json 只读投影（杜绝旧镜像复活与凭据外泄）
  console.log('【4】测试 syncAccountConfigs 运行时隔离与无旧数据复活')

  const testConfig = normalizeConfig({
    runtime: { project_root: tmpDir },
    accounts: {
      acc_bjh: {
        id: 'acc_bjh',
        platform: 'baijiahao',
        name: '百家号隔离测试',
        author_name: 'BJH作者',
      },
      acc_gzh: {
        id: 'acc_gzh',
        platform: 'gzh',
        name: '公众号隔离测试',
        appid: 'wx_isolation_id_999',
        app_secret: 'wx_isolation_sec_999',
      },
    },
  } as any)

  syncConfig(testConfig)

  // 检查百家号生成的 scripts/wx_config.json
  const bjhConfPath = path.join(tmpDir, 'accounts', 'acc_bjh', 'scripts', 'wx_config.json')
  assert(fs.existsSync(bjhConfPath), '百家号账号专属 scripts 目录必须存在 wx_config.json')
  const bjhConf = JSON.parse(fs.readFileSync(bjhConfPath, 'utf-8'))
  assert.equal(bjhConf.platform, 'baijiahao')
  assert.equal(bjhConf.appid, '', '百家号下发运行时配置中 appid 必须为空，绝不外泄微信凭据')
  assert.equal(bjhConf.app_secret, '', '百家号下发运行时配置中 app_secret 必须为空，绝不外泄微信凭据')

  // 检查公众号生成的 scripts/wx_config.json
  const gzhConfPath = path.join(tmpDir, 'accounts', 'acc_gzh', 'scripts', 'wx_config.json')
  const gzhConf = JSON.parse(fs.readFileSync(gzhConfPath, 'utf-8'))
  assert.equal(gzhConf.platform, 'gzh')
  assert.equal(gzhConf.appid, 'wx_isolation_id_999')
  assert.equal(gzhConf.app_secret, 'wx_isolation_sec_999')

  console.log('  ✓ 账号专属目录运行时隔离与凭据零外泄验证通过')

} finally {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch {}
}

console.log('\n=== 全部百家号品牌图与配置隔离架构测试全部顺利通过！===')
