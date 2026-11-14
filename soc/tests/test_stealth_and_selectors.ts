import assert from 'node:assert'
import { generateBezierPath, getOrCreateAccountFingerprint } from '../src/stealth/index.ts'
import { getPlatformSelectors, hotpatchManager } from '../src/selectors/index.ts'

console.log('--- 测试 Phase 2: 拟人防风控引擎与语义定位选择器 ---')

// 1. 验证拟人鼠标轨迹生成 (Cubic Bezier Path)
const start = { x: 10, y: 20 }
const end = { x: 500, y: 400 }
const path = generateBezierPath(start, end, { enableJitter: true })

assert.ok(Array.isArray(path), '轨迹应为点阵数组')
assert.ok(path.length >= 10, '远距离平滑轨迹采样点数应不少于 10')
assert.strictEqual(path[0].x, start.x, '起点 X 坐标应严格匹配')
assert.strictEqual(path[0].y, start.y, '起点 Y 坐标应严格匹配')
const lastPoint = path[path.length - 1]
assert.strictEqual(lastPoint.x, end.x, '终点 X 坐标应严格匹配')
assert.strictEqual(lastPoint.y, end.y, '终点 Y 坐标应严格匹配')
console.log(`✅ 鼠标贝塞尔轨迹模拟正常，生成了 ${path.length} 个轨迹中间采样点`)

// 2. 验证多账号物理隔离指纹生成
const testDir = 'D:/666/dshplu/soc/tasks/default/accounts/test_acc'
const fp = getOrCreateAccountFingerprint(testDir)
assert.ok(fp.userAgent.includes('Chrome'), 'UserAgent 应包含标准桌面 Chrome 特征')
assert.ok(fp.screen.width > 0 && fp.screen.height > 0, '屏幕尺寸应具备合法宽高')
assert.ok(typeof fp.canvasNoiseSeed === 'number', 'Canvas 噪声因子应存在')
console.log('✅ 浏览器指纹生成正常，UA:', fp.userAgent.slice(0, 50) + '...')

// 3. 验证选择器热补丁管理器
hotpatchManager.applyHotpatch({ platform: 'zhihu', selectors: { test_key: '.custom-dynamic-selector' } })
const patched = hotpatchManager.getEffectiveSelector('zhihu', 'test_key', '.default-selector')
assert.strictEqual(patched, '.custom-dynamic-selector', '热补丁存在时应优先使用补丁选择器')

const fallback = hotpatchManager.getEffectiveSelector('zhihu', 'non_exist_key', '.default-selector')
assert.strictEqual(fallback, '.default-selector', '热补丁不存在时应安全回退默认选择器')
console.log('✅ 选择器热补丁注入与回退机制正常')

// 4. 验证多平台语义选择器规范解析
for (const platform of ['gzh', 'zhihu', 'toutiao', 'xiaohongshu', 'baijiahao'] as const) {
  const sel = getPlatformSelectors(platform)
  assert.ok(sel, `平台 ${platform} 应具备选择器规范`)
  assert.strictEqual(sel.platform, platform, `平台标识符应匹配 ${platform}`)
}
console.log('✅ 5 大平台语义选择器映射检索全部就绪')

console.log('✅ Phase 2 拟人防风控引擎与语义定位选择器自检全部通过！')
