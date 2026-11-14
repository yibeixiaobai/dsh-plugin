/**
 * 社媒发布统一组件契约 (Social Publisher Feature Contract)
 */
import type { SocialWorkflowEvent, SocialWorkflowArticle } from '@winkoo/social-publisher/client'

export type { SocialWorkflowEvent, SocialWorkflowArticle }

export interface SocialPublisherComposerCardProps {
  onClose?: () => void
  onSubmit?: (data: any) => void
  disabled?: boolean
  modelSelectionView?: any
  defaultModelSelection?: { provider: string; model: string }
  sessionId?: string
  onInsertPrompt?: (promptText: string) => void
  className?: string
}

export interface SocialWorkflowCardsProps {
  rows: readonly any[]
  isLastTurn?: boolean
  workspacePath: string
  workspaceIdentity?: string
  sessionId?: string
  isSubagent?: boolean
}
