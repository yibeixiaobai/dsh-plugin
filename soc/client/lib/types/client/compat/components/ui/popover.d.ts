import * as React from 'react';
export interface PopoverProps {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}
export declare function Popover({ children, open, onOpenChange }: PopoverProps): React.JSX.Element;
export declare function PopoverTrigger({ asChild, children, ...props }: any): React.JSX.Element;
export declare function PopoverContent({ className, children, style, ...props }: any): React.JSX.Element;
//# sourceMappingURL=popover.d.ts.map