import type { ReactNode } from 'react'
import type {} from '@winkoo/client-ui-chat/client'
import type { PropsRuntime, PropsLocale } from '@winkoo/client-ui-slots'
import { SocialWorkflowTurnCards } from '../features/SocialWorkflowTurnCards.js'

export type SocialWorkflowTurnTailProps = PropsRuntime<'conversation.chat.turnTail'> & PropsLocale<'socialPublisher'>

export function SocialWorkflowTurnTail(_props: SocialWorkflowTurnTailProps): ReactNode {
  return (
    <div style={{ marginTop: '6px' }}>
      <SocialWorkflowTurnCards
        rows={[]}
        isLastTurn={true}
        workspacePath=""
      />
    </div>
  )
}
