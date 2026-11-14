import { ScopedErrorBoundary } from '../ErrorBoundary.js'
import { SocialPublisherComposerCard as BaseCard } from './core/SocialPublisherComposerCardImpl.js'
import type { ComponentProps } from 'react'

export type {
  SocialPlatformKey,
  SocialAccountTaskPlan,
  SocialPublisherSubmitData,
} from './core/utils/socialPlatformsMeta.js'

export function SocialPublisherComposerCard(props: ComponentProps<typeof BaseCard>) {
  return (
    <ScopedErrorBoundary scope="social-publisher-composer-card" variant="compact">
      <BaseCard {...props} />
    </ScopedErrorBoundary>
  )
}
