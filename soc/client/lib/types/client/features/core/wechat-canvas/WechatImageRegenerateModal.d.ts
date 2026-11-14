import React from "react";
export interface WechatImageRegenerateModalProps {
    isOpen: boolean;
    onClose: () => void;
    subIndex: number;
    initialPrompt: string;
    intentDescription?: string;
    searchKeywords?: string[];
    articleIndex?: number;
    accountId?: string;
    platform?: string;
    scriptsDir?: string;
    workspacePath?: string;
    onImageRegenerated: (dataUrl: string) => void;
}
export declare function WechatImageRegenerateModal({ isOpen, onClose, subIndex, initialPrompt, intentDescription, searchKeywords, articleIndex, accountId, platform, scriptsDir, workspacePath, onImageRegenerated, }: WechatImageRegenerateModalProps): React.JSX.Element;
//# sourceMappingURL=WechatImageRegenerateModal.d.ts.map