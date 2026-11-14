import { type SocialPlatformKey, type SocialAccountTaskPlan, type SocialPublisherSubmitData } from './utils/socialPlatformsMeta.js';
import type { ModelSelectionView } from '../../compat/hooks/useServices.js';
export type { SocialPlatformKey, SocialAccountTaskPlan, SocialPublisherSubmitData };
interface SocialPublisherComposerCardProps {
    onClose?: () => void;
    onSubmit: (data: SocialPublisherSubmitData) => void;
    disabled?: boolean;
    modelSelectionView?: ModelSelectionView | null;
    defaultModelSelection?: {
        provider: string;
        model: string;
    };
    sessionId?: string;
    workspacePath?: string;
}
export declare function SocialPublisherComposerCard({ onClose, onSubmit, disabled, modelSelectionView, defaultModelSelection, sessionId, workspacePath, }: SocialPublisherComposerCardProps): import("react").JSX.Element;
//# sourceMappingURL=SocialPublisherComposerCardImpl.d.ts.map