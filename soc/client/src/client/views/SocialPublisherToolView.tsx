import { useState, useMemo, type ReactNode } from 'react'
import { Share2 } from 'lucide-react'
import { DisclosureRow } from '@winkoo/client-ui-primitives'
import type { ToolCallViewProps } from '@winkoo/client-ui-tool/client'
import css from './SocialPublisherToolView.module.css'

type SocialPipelinePhase = 'preflight' | 'topics' | 'writing' | 'images' | 'validating' | 'publishing' | 'ready'

const PHASE_LABELS: Record<SocialPipelinePhase, { running: string; completed: string }> = {
  preflight: {
    running: '预检平台账号登录态...',
    completed: '平台账号登录态正常',
  },
  topics: {
    running: '全网热点分析与查重评估...',
    completed: '选题策划与查重通过',
  },
  writing: {
    running: '平台图文智能排版与生成...',
    completed: '图文规范排版完成',
  },
  images: {
    running: '定制视觉蓝图与 AI 插图绘制...',
    completed: 'AI 封面与插图绘制完成',
  },
  validating: {
    running: '排版与合规机器硬性校验...',
    completed: '机器合规校验通过',
  },
  publishing: {
    running: '同步推送官方草稿箱...',
    completed: '已同步至官方草稿箱',
  },
  ready: {
    running: '社媒矩阵流水线执行中...',
    completed: '社媒内容矩阵创作就绪（可在右侧或中央审校）',
  },
}

function resolvePhaseFromArgs(raw: string): SocialPipelinePhase {
  if (!raw) return 'writing'
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const action = String(parsed['action'] || parsed['mode'] || '').toLowerCase()
    if (action === 'publish' || action.includes('publish')) return 'publishing'
    if (action === 'validate') return 'validating'
    if (action === 'image' || action.includes('image') || action.includes('pic')) return 'images'
    if (action === 'topic' || action.includes('topic') || action.includes('discover')) return 'topics'
    if (action === 'preflight' || action.includes('login')) return 'preflight'
    if (action === 'produce' || action.includes('write') || action.includes('build')) return 'writing'
  } catch {
    const lower = raw.toLowerCase()
    if (lower.includes('publish')) return 'publishing'
    if (lower.includes('validate')) return 'validating'
    if (lower.includes('image')) return 'images'
    if (lower.includes('topic')) return 'topics'
    if (lower.includes('login') || lower.includes('preflight')) return 'preflight'
  }
  return 'writing'
}

/* v8 ignore next -- Non-expandable rows never invoke DisclosureRow's required toggle callback. */
const noop = (): void => undefined

/**
 * Streamlined presentation component for `social_publisher` tool calls.
 * Replaces noisy, raw escaped JSON dumps with a compact, phase-based
 * native `DisclosureRow` with clean status indicators.
 *
 * @param props - Composed toolview slot props.
 * @returns Status row with expandable details.
 */
export function SocialPublisherToolView(props: ToolCallViewProps): ReactNode {
  return props.phase === 'preparing'
    ? <PreparingSocialPublisherRow {...props} />
    : <StartedSocialPublisherRow {...props} />
}

function PreparingSocialPublisherRow({ toolName }: Extract<ToolCallViewProps, { phase: 'preparing' }>): ReactNode {
  return (
    <div data-tool={toolName} data-state="preparing" aria-label="准备社媒发布任务...">
      <DisclosureRow
        title="初始化社媒矩阵内容生产流水线..."
        icon={<Share2 size={14} style={{ color: '#10b981' }} />}
        open={false}
        expandable={false}
        onToggle={noop}
        running
      />
    </div>
  )
}

function StartedSocialPublisherRow({
  block,
  inspect,
  toolName,
}: Exclude<ToolCallViewProps, { phase: 'preparing' }>): ReactNode {
  const settled = 'kind' in block
  const state = !settled ? 'running' : block.error?.code === 'interrupted' ? 'stopped' : block.isError ? 'error' : 'ok'
  const args = (settled ? block.call?.argsRaw : block.argsRaw) ?? ''
  const output = settled
    ? block.content.map(item => (item.type === 'text' ? item.text : JSON.stringify(item))).join('\n')
    : ''
  const details = output || (settled && block.error ? `${block.error.name}: ${block.error.code}` : '')

  const [expanded, setExpanded] = useState<boolean>(false)

  const phase = useMemo(() => resolvePhaseFromArgs(args), [args])

  const title = useMemo(() => {
    if (state === 'running') {
      return PHASE_LABELS[phase]?.running ?? '社媒矩阵流水线执行中...'
    }
    if (state === 'error') {
      return '社媒发布流水线异常'
    }
    if (state === 'stopped') {
      return '社媒发布流水线已中断'
    }
    return PHASE_LABELS[phase]?.completed ?? '社媒内容矩阵创作就绪'
  }, [phase, state])

  return (
    <div data-tool={toolName} data-state={state}>
      <DisclosureRow
        title={title}
        icon={<Share2 size={14} style={{ color: state === 'error' ? '#ef4444' : '#10b981' }} />}
        open={expanded && details !== ''}
        expandable={details !== ''}
        expandOnRowClick
        keepContentWhenOpen
        running={state === 'running'}
        onToggle={() => setExpanded(prev => !prev)}
        collapsedContent={
          <span className={css.summary}>
            <span className={css.phaseBadge}>{phase}</span>
          </span>
        }
      >
        <pre className={css.output}>{details}</pre>
        {inspect && (
          <button type="button" className={css.inspectBtn} onClick={inspect}>
            查看轨迹详情
          </button>
        )}
      </DisclosureRow>
    </div>
  )
}
