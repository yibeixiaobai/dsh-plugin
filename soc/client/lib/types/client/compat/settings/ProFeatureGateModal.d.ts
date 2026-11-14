import * as React from 'react';
export interface ProFeatureGateModalProps {
    open: boolean;
    onClose?: () => void;
    onOpenChange?: (open: boolean) => void;
    featureId?: string;
    featureTitle?: string;
    description?: string;
    onConfirmTrial?: () => void;
    [key: string]: any;
}
export declare function ProFeatureGateModal({ open, onClose, onOpenChange, featureTitle, description, onConfirmTrial, }: ProFeatureGateModalProps): React.JSX.Element;
//# sourceMappingURL=ProFeatureGateModal.d.ts.map