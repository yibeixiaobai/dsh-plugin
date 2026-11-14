import assert from 'node:assert'
import { adapterRegistry } from '../src/adapters/registry.ts'
import { PLATFORMS, PLATFORM_LABELS, TOUTIAO_TITLE_MAX, TOUTIAO_COVER_RATIO } from '../src/config.ts'
import { publishTool } from '../src/tools/publish.ts'

console.log('--- 测试 Phase 1: 平台适配器体系与今日头条支持 ---')

// 1. 验证平台常量
assert.ok(PLATFORMS.includes('toutiao'), 'PLATFORMS 应包含 toutiao')
assert.strictEqual(PLATFORM_LABELS.toutiao, '头条号', '头条号中文名称正确')
assert.strictEqual(TOUTIAO_TITLE_MAX, 30, '头条号标题字数限制为 30')
assert.strictEqual(TOUTIAO_COVER_RATIO, '16:9', '头条号封面比例为 16:9')

// 2. 验证注册中心平台覆盖
const caps = adapterRegistry.listCapabilities()
const platformIds = caps.map(c => c.id)
console.log('已注册平台驱动列表:', platformIds)

assert.ok(platformIds.includes('toutiao'), 'adapterRegistry 应包含 toutiao')
assert.ok(platformIds.includes('gzh'), 'adapterRegistry 应包含 gzh')
assert.ok(platformIds.includes('zhihu'), 'adapterRegistry 应包含 zhihu')
assert.ok(platformIds.includes('xiaohongshu'), 'adapterRegistry 应包含 xiaohongshu')
assert.ok(platformIds.includes('baijiahao'), 'adapterRegistry 应包含 baijiahao')

// 3. 验证头条适配器能力契约
const toutiaoAdapter = adapterRegistry.get('toutiao')
assert.strictEqual(toutiaoAdapter.capabilities.id, 'toutiao')
assert.strictEqual(toutiaoAdapter.capabilities.displayName, '头条号')
assert.strictEqual(toutiaoAdapter.capabilities.articleFormat, 'markdown')
assert.strictEqual(toutiaoAdapter.capabilities.maxTitleLength, 30)

// 4. 验证 publishTool 参数元数据
const tool = publishTool({} as any)
assert.strictEqual(tool.name, 'gzh_publish_draft')
const params = (tool.parameters as any).properties || tool.parameters
assert.ok(params.platform, 'publishTool 应包含 platform 入参')
assert.ok(params.platform.enum.includes('toutiao'), 'publishTool platform 应允许 toutiao')

console.log('✅ Phase 1 平台适配器与今日头条模块自检全部通过！')
