import type { DuplicateScanResult } from "./SocialPublisherTypes.js";
interface DuplicateDialogProps {
    open: boolean;
    onClose: () => void;
    scanning: boolean;
    cleaning: boolean;
    scanResult: DuplicateScanResult | null;
    strategy: "keep_latest" | "keep_complete" | "keep_oldest";
    onStrategyChange: (strategy: "keep_latest" | "keep_complete" | "keep_oldest") => void;
    selectedDeleteIds: Set<string>;
    onToggleSelect: (appmsgid: string) => void;
    onConfirmClean: () => void;
}
export declare function SocialPublisherDraftsDuplicateDialog({ open, onClose, scanning, cleaning, scanResult, strategy, onStrategyChange, selectedDeleteIds, onToggleSelect, onConfirmClean, }: DuplicateDialogProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=SocialPublisherDraftsDuplicateDialog.d.ts.map