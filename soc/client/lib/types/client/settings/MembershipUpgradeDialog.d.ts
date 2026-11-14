import * as React from 'react';
export interface MembershipUpgradeDialogProps {
    open: boolean;
    onOpenChange?: (open: boolean) => void;
    onClose?: () => void;
    reason?: string;
}
export declare function MembershipUpgradeDialog({ open, onOpenChange, onClose, reason }: MembershipUpgradeDialogProps): React.JSX.Element;
//# sourceMappingURL=MembershipUpgradeDialog.d.ts.map