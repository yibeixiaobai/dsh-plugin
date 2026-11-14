import { type ReactNode } from 'react';
import type { PropsRuntime, PropsLocale } from '@winkoo/client-ui-slots';
export interface SocialPublisherDockInjected {
    onSendPrompt?: (text: string) => Promise<void>;
}
export type SocialPublisherInputDockProps = PropsRuntime<'conversation.input.dock'> & PropsLocale<'socialPublisher'> & SocialPublisherDockInjected;
export declare function SocialPublisherInputDock(props: SocialPublisherInputDockProps): ReactNode;
//# sourceMappingURL=SocialPublisherInputDock.d.ts.map