import assert from 'node:assert'
import { ImageCircuitBreaker } from '../src/tools/imageCircuitBreaker.ts'
import { discoverTopicsNative, sanitizeHumanTone } from '../src/engine/topicRadar.ts'

async function runTest() {
  console.log('--- 测试 Phase 3: 全网多源热榜雷达与生图高可用熔断 ---')

  // 1. 验证生图熔断器状态机
  const breaker = ImageCircuitBreaker.getInstance()
  const providerId = 'test-unstable-image-api'

  assert.strictEqual(breaker.isAvailable(providerId), true, '初始状态应为可用 (CLOSED)')
  
  // 连续记录3次失败
  breaker.recordFailure(providerId, new Error('Gateway Timeout 504'))
  breaker.recordFailure(providerId, new Error('Rate Limit 429'))
  assert.strictEqual(breaker.isAvailable(providerId), true, '失败 2 次仍未达到阈值')
  
  breaker.recordFailure(providerId, new Error('Internal Server Error 500'))
  assert.strictEqual(breaker.isAvailable(providerId), false, '连续失败 3 次应触发熔断 (OPEN)')

  // 恢复成功
  breaker.recordSuccess(providerId, 250)
  assert.strictEqual(breaker.isAvailable(providerId), true, '记录成功后应恢复健康 (CLOSED)')
  console.log('✅ 生图熔断器 (ImageCircuitBreaker) 状态机与故障转移机制验证通过')

  // 2. 验证去机感清洗函数
  const noisyTitle = '震惊！【深度干货】最新大模型部署踩坑全记录！'
  const cleanedTitle = sanitizeHumanTone(noisyTitle)
  assert.ok(!cleanedTitle.includes('震惊'), '标题应过滤套路化感叹词')
  assert.ok(!cleanedTitle.startsWith('【深度干货】'), '标题应去除方括号前缀标签')
  console.log(`✅ 标题去机感过滤正常: "${noisyTitle}" -> "${cleanedTitle}"`)

  // 3. 验证原生热榜雷达选题发现
  const discovery = await discoverTopicsNative({
    keywords: ['AI开发', '大模型落地'],
    searchSnippets: [
      { title: '震惊！DeepSeek最新突破引发全网关注！', snippet: '深度解析最新大模型在多终端部署中的应用实践' },
      { title: '大模型应用落地避坑指南', snippet: '企业级大模型实施需要注意的核心安全与性能问题' },
    ],
    count: 2,
  })

  assert.ok(discovery.recommended_topics.length > 0, '应生成推荐选题')
  const sampleTopic = discovery.recommended_topics[0]
  assert.ok(sampleTopic.composite_score > 0, '应包含综合评分指标')
  console.log(`✅ 热点雷达引擎运算正常，输出选题: "${sampleTopic.title}" (综合分: ${sampleTopic.composite_score})`)

  console.log('✅ Phase 3 全网多源热榜雷达与生图熔断机制自检全部通过！')
}

runTest().catch((err) => {
  console.error('❌ Phase 3 测试失败:', err)
  process.exit(1)
})
