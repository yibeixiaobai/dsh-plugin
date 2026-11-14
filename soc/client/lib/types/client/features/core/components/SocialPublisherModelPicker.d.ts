import type { ModelSelectionView } from '../../../compat/hooks/useServices.js';
export interface UnifiedModelSelection {
    provider: string;
    model: string;
    displayName?: string;
}
export interface SocialPublisherModelPickerProps {
    modelSelectionView?: ModelSelectionView | null;
    value?: UnifiedModelSelection | null;
    onChange: (val: UnifiedModelSelection) => void;
    disabled?: boolean;
}
export declare const SocialPublisherModelPicker: import("react").MemoExoticComponent<({ modelSelectionView, value, onChange, disabled, }: SocialPublisherModelPickerProps) => import("react").JSX.Element>;
//# sourceMappingURL=SocialPublisherModelPicker.d.ts.map