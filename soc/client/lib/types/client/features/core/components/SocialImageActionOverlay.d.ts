import React from 'react';
export interface SocialImageActionOverlayProps {
    slotTitle: string;
    kind: 'cover' | 'content' | 'pic';
    articleIndex?: number;
    subIndex?: number;
    currentImageUrl?: string;
    currentPrompt?: string;
    intentDescription?: string;
    searchKeywords?: string[];
    scriptsDir?: string;
    targetFileName?: string;
    targetDiskPath?: string;
    accountId?: string;
    platform?: string;
    workspacePath?: string;
    onImageChanged?: (newUrl: string) => void;
    onZoom?: () => void;
    onDelete?: () => void;
    canDelete?: boolean;
    className?: string;
    alwaysVisible?: boolean;
}
export declare function SocialImageActionOverlay({ slotTitle, kind, articleIndex, subIndex, currentImageUrl: _currentImageUrl, currentPrompt, intentDescription, searchKeywords, scriptsDir, targetFileName, targetDiskPath, accountId, platform, workspacePath, onImageChanged, onZoom, onDelete, canDelete, className, alwaysVisible, }: SocialImageActionOverlayProps): React.JSX.Element;
//# sourceMappingURL=SocialImageActionOverlay.d.ts.map