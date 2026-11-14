import * as React from 'react';
export interface EmbeddedWebsiteHeaderProps {
    title: string;
    onClose?: () => void;
    url?: string;
    loading?: boolean;
    canGoBack?: boolean;
    canGoForward?: boolean;
    onBack?: () => any;
    onForward?: () => any;
    onReload?: () => any;
    [key: string]: any;
}
export declare function EmbeddedWebsiteHeader({ title, onClose, url, loading, canGoBack, canGoForward, onBack, onForward, onReload, }: EmbeddedWebsiteHeaderProps): React.JSX.Element;
//# sourceMappingURL=EmbeddedWebsiteHeader.d.ts.map