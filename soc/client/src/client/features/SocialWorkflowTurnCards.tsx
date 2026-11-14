import { ScopedErrorBoundary } from '../ErrorBoundary.js'
import { SocialWorkflowTurnCards as BaseCards } from './core/components/SocialWorkflowTurnCards.js'
import type { ComponentProps } from 'react'

export function SocialWorkflowTurnCards(props: ComponentProps<typeof BaseCards>) {
  return (
    <ScopedErrorBoundary scope="social-workflow-turn-cards" variant="compact">
      <BaseCards {...props} />
    </ScopedErrorBoundary>
  )
}
