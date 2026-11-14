import React from 'react';
export interface BatchImageItem {
    id: string;
    name: string;
    url: string;
    file?: File;
}
interface WechatBatchImageReplaceModalProps {
    isOpen: boolean;
    onClose: () => void;
    originalImageUrls: string[];
    nodeLabel?: string;
    onConfirmReplace: (orderedUrls: string[]) => void;
}
export declare function WechatBatchImageReplaceModal({ isOpen, onClose, originalImageUrls, nodeLabel, onConfirmReplace, }: WechatBatchImageReplaceModalProps): React.JSX.Element;
export {};
//# sourceMappingURL=WechatBatchImageReplaceModal.d.ts.map