import { useState, useEffect, type ReactNode } from 'react'
import type { PropsRuntime, PropsLocale } from '@winkoo/client-ui-slots'
import { SocialPublisherComposerCard } from '../features/SocialPublisherComposerCard.js'
import type { SocialPublisherSubmitData } from '../features/core/utils/socialPlatformsMeta.js'
import { useAppWorkMode, setAppWorkMode } from '../compat/store/workModeStore.js'
import { useSocialWorkflow } from '../features/core/useSocialWorkflow.js'
import { SocialCompanionPublishDock } from '../features/core/components/SocialCompanionPublishDock.js'

export interface SocialPublisherDockInjected {
  onSendPrompt?: (text: string) => Promise<void>
}

export type SocialPublisherInputDockProps = PropsRuntime<'conversation.input.dock'> &
  PropsLocale<'socialPublisher'> &
  SocialPublisherDockInjected

export function SocialPublisherInputDock(props: SocialPublisherInputDockProps): ReactNode {
  const { sessionId, onSendPrompt, session } = props
  const mode = useAppWorkMode()
  const isSocial = mode === 'social'
  const [submitted, setSubmitted] = useState(false)
  const [userDismissed, setUserDismissed] = useState(false)
  const { workflow, hasArticles } = useSocialWorkflow(sessionId)

  // 切换会话或切换模式时重置提交与手动收起状态
  useEffect(() => {
    setSubmitted(false)
    setUserDismissed(false)
  }, [sessionId, mode])

  // 通用任务模式下彻底隐藏社媒卡片，纯净无干扰
  if (!isSocial) {
    return null
  }

  // 1. 如果工作流已产出文章（articles.length > 0），在输入框正上方渲染紧凑快捷发布条
  if (hasArticles) {
    return (
      <div style={{ padding: '0 8px 4px 8px' }}>
        <SocialCompanionPublishDock
          workflow={workflow}
          workspacePath=""
          sessionId={sessionId}
        />
      </div>
    )
  }

  // 2. 如果任务已提交，或当前会话非空（已有消息轮次），或者用户手动关闭了大卡片：
  // 彻底收起大卡片，不显示任何遮挡微标，将底部空间完全让位给系统通用对话输入框
  const isBlank = (session as any)?.blank !== false && !submitted
  if (!isBlank || userDismissed) {
    return null
  }

  const handleComposerSubmit = async (data: SocialPublisherSubmitData) => {
    try {
      setSubmitted(true)
      if (onSendPrompt && data.formattedPrompt) {
        await onSendPrompt(data.formattedPrompt)
      }
    } catch (err) {
      console.error('[SocialPublisher] 发送会话消息失败:', err)
      setSubmitted(false)
    }
  }

  const handleClose = () => {
    setUserDismissed(true)
    setAppWorkMode('general')
  }

  // 3. 空会话 (Hero态) 下，居中渲染社媒多平台矩阵发布工作台卡片
  return (
    <div style={{ padding: '4px 8px 6px 8px' }}>
      <SocialPublisherComposerCard
        onClose={handleClose}
        onSubmit={handleComposerSubmit}
        sessionId={sessionId}
      />
    </div>
  )
}
