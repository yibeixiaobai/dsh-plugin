import type { WechatDraftCard, DuplicateScanResult } from "./SocialPublisherTypes.js";
export declare function useSocialPublisherDrafts(selectedAccountId: string, socialPublisherRpc?: any): {
    drafts: WechatDraftCard[];
    loading: boolean;
    syncing: boolean;
    statusMessage: {
        type: "success" | "error";
        text: string;
    };
    setStatusMessage: import("react").Dispatch<import("react").SetStateAction<{
        type: "success" | "error";
        text: string;
    }>>;
    deletingId: string;
    triggerSync: () => Promise<void>;
    handleDeleteDraft: (draftId: string, appmsgid: string, articleType?: "news" | "newspic") => Promise<void>;
    showDuplicateModal: boolean;
    setShowDuplicateModal: import("react").Dispatch<import("react").SetStateAction<boolean>>;
    scanningDuplicates: boolean;
    duplicateStrategy: "keep_latest" | "keep_complete" | "keep_oldest";
    duplicateScanResult: DuplicateScanResult;
    selectedDeleteIds: Set<string>;
    setSelectedDeleteIds: import("react").Dispatch<import("react").SetStateAction<Set<string>>>;
    cleaningDuplicates: boolean;
    handleOpenDuplicateModal: () => Promise<void>;
    handleStrategyChange: (newStrategy: "keep_latest" | "keep_complete" | "keep_oldest") => void;
    handleBatchCleanDuplicates: () => Promise<void>;
};
//# sourceMappingURL=useSocialPublisherDrafts.d.ts.map