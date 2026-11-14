/**
 * 严格判定助手文本是否属于日常对话答疑、技术原理阐述、错误/时序排障复盘等非文章内容
 * 只要命中问答或排障特征，一律严禁提取为排版画布文章
 */
export function isAssistantConversationOrExplanation(text: string): boolean {
  if (!text || typeof text !== 'string') return false
  const trimmed = text.trim()
  if (!trimmed) return false

  // 1. 强特征问答与技术原理解释句式
  const explanationPatterns = [
    /^(?:插图[一二三四0-9]|配图|图片)不是\s*(?:AI\s*生成|真正)/i,
    /^(?:\*\*|\*|#|\s)*(?:是的|对的|没错)[，,]\s*(?:完全是用|是使用|这是|采用|由)/i,
    /(?:给您看下|看一下|查看一下|展示一下)(?:底层|实际|真实)的?(?:代码|实现|逻辑)/i,
    /(?:实际长成这样|长成这样|长这样|代码片段如下|代码如下|如下所示)[：:\s]/i,
    /(?:目前|它只是|这只是|仅仅是)一个[“"']?代码占位符[”"']?/i,
    /(?:纯代码轻量化组件|代码占位符)/i,
    /(?:不是真正的图片|不是真正的位图)/i,
    /(?:纯\s*(?:HTML|CSS|代码)\s*拼接渲染)/i,
    /(?:为什么会这样|原因分析|为什么出现|排查发现)[？?：:]/i,
    /(?:原本的设计|实际发生的情况|最终呈现的结果)[：:]/i,
    /(?:回答您的问题|为您解答|答[：:])/i,
    /(?:接口报错中断|导致真实的\s*AI\s*图片没有生成成功|底层生图环节遇到异常)/i,
    /(?:您在预览中看到的类似|如果您在网页或微信草稿箱里看到它)/i,
  ]

  for (const pattern of explanationPatterns) {
    if (pattern.test(trimmed)) {
      return true
    }
  }

  // 2. 复合特征检测：包含“为什么会这样”且包含故障复盘三段论
  if (
    trimmed.includes('为什么会这样') &&
    (trimmed.includes('原本的设计') || trimmed.includes('实际发生的情况') || trimmed.includes('呈现的结果'))
  ) {
    return true
  }

  // 3. 复合特征检测：针对图片的答疑和代码展示
  if (
    (trimmed.includes('占位符') || trimmed.includes('代码拼接')) &&
    (trimmed.includes('不是') || trimmed.includes('真实代码') || trimmed.includes('排版技法'))
  ) {
    return true
  }

  return false
}
