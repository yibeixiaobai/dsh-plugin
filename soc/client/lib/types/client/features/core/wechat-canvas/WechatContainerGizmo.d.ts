interface WechatContainerGizmoProps {
    label: string;
    isFirst: boolean;
    isLast: boolean;
    hasImages?: boolean;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onInsertAbove: () => void;
    onInsertBelow: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onChangeTheme: (themeKey: string) => void;
    onBatchReplaceImages?: () => void;
    onRegenerateImage?: () => void;
}
export declare function WechatContainerGizmo({ label, isFirst, isLast, hasImages, onMoveUp, onMoveDown, onInsertAbove, onInsertBelow, onDuplicate, onDelete, onChangeTheme, onBatchReplaceImages, onRegenerateImage, }: WechatContainerGizmoProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=WechatContainerGizmo.d.ts.map