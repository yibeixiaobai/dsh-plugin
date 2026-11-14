import type { PropsRuntime } from '@winkoo/client-ui-slots'
import { Share2 } from 'lucide-react'

export function SocialStudioPanelIcon({ size = 18 }: PropsRuntime<'sidebar.panellist'>) {
  return <Share2 size={size} />
}
