/**
 * 第三方生图服务提供商断路器 (Image Provider Circuit Breaker)
 * 职责：管理外部 AI 绘图接口的健康度，防止单节点故障/限流引发流水线长超时阻断
 * 状态机：CLOSED (正常) -> OPEN (熔断休眠) -> HALF_OPEN (半开试探)
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface ProviderHealthMetrics {
  state: CircuitState
  consecutiveFailures: number
  lastFailureTime: number
  totalSuccesses: number
  totalFailures: number
  avgLatencyMs: number
}

const CONSECUTIVE_FAILURE_THRESHOLD = 3   // 连续 3 次报错触发熔断
const CIRCUIT_COOLDOWN_MS = 600_000       // 熔断休眠 10 分钟

export class ImageCircuitBreaker {
  private static instance: ImageCircuitBreaker
  private readonly metrics = new Map<string, ProviderHealthMetrics>()

  static getInstance(): ImageCircuitBreaker {
    if (!ImageCircuitBreaker.instance) {
      ImageCircuitBreaker.instance = new ImageCircuitBreaker()
    }
    return ImageCircuitBreaker.instance
  }

  /**
   * 判定指定提供商当前是否可用
   */
  isAvailable(providerId: string): boolean {
    const health = this.metrics.get(providerId)
    if (!health || health.state === 'CLOSED') {
      return true
    }

    const now = Date.now()
    if (health.state === 'OPEN') {
      if (now - health.lastFailureTime > CIRCUIT_COOLDOWN_MS) {
        health.state = 'HALF_OPEN'
        console.log(`[ImageCircuitBreaker] 提供商 [${providerId}] 冷却期满，进入 HALF_OPEN 半开试探模式`)
        return true
      }
      return false
    }

    // HALF_OPEN 状态允许单次试探请求通过
    return health.state === 'HALF_OPEN'
  }

  /**
   * 记录调用成功并更新平滑时延
   */
  recordSuccess(providerId: string, latencyMs = 0): void {
    const health = this.getOrCreateMetrics(providerId)
    health.consecutiveFailures = 0
    health.totalSuccesses++
    health.state = 'CLOSED'
    if (latencyMs > 0) {
      health.avgLatencyMs = health.avgLatencyMs === 0
        ? latencyMs
        : Math.round(health.avgLatencyMs * 0.7 + latencyMs * 0.3)
    }
  }

  /**
   * 记录调用失败，超过阈值时触发熔断
   */
  recordFailure(providerId: string, error?: unknown): void {
    const health = this.getOrCreateMetrics(providerId)
    health.consecutiveFailures++
    health.totalFailures++
    health.lastFailureTime = Date.now()

    if (health.consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD) {
      health.state = 'OPEN'
      console.warn(
        `[ImageCircuitBreaker] ⚠️ 提供商 [${providerId}] 连续失败 ${health.consecutiveFailures} 次（原因: ${error instanceof Error ? error.message : String(error)}），触发熔断休眠 10 分钟！任务将自动降级转移至健康提供商。`,
      )
    }
  }

  /**
   * 过滤出当前健康/可用的提供商列表
   * 若所有提供商均被熔断，则优雅全量放行（做保底试探）
   */
  filterHealthyProviders<T extends { id: string }>(providers: T[]): T[] {
    if (!providers || providers.length <= 1) return providers
    const healthy = providers.filter(p => this.isAvailable(p.id))
    if (healthy.length === 0) {
      console.warn('[ImageCircuitBreaker] ⚠️ 所有配置的生图提供商均处于熔断期，全量放行做保底试探')
      return providers
    }
    return healthy
  }

  /**
   * 获取所有节点的健康监控快照
   */
  getSnapshot(): Record<string, ProviderHealthMetrics> {
    const res: Record<string, ProviderHealthMetrics> = {}
    for (const [k, v] of this.metrics.entries()) {
      res[k] = { ...v }
    }
    return res
  }

  /**
   * 清除监控状态
   */
  reset(): void {
    this.metrics.clear()
  }

  private getOrCreateMetrics(providerId: string): ProviderHealthMetrics {
    let m = this.metrics.get(providerId)
    if (!m) {
      m = {
        state: 'CLOSED',
        consecutiveFailures: 0,
        lastFailureTime: 0,
        totalSuccesses: 0,
        totalFailures: 0,
        avgLatencyMs: 0,
      }
      this.metrics.set(providerId, m)
    }
    return m
  }
}

export const imageCircuitBreaker = ImageCircuitBreaker.getInstance()
