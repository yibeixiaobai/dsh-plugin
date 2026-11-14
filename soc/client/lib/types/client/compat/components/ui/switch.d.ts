import * as React from 'react';
export interface SwitchProps {
    checked?: boolean;
    defaultChecked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    disabled?: boolean;
    className?: string;
    id?: string;
    title?: string;
    style?: React.CSSProperties;
}
export declare function Switch({ checked, defaultChecked, onCheckedChange, disabled, className, id, title, style, }: SwitchProps): React.JSX.Element;
//# sourceMappingURL=switch.d.ts.map