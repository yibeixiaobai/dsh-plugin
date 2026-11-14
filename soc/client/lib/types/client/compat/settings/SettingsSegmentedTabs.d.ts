import * as React from 'react';
export interface SettingsTabItem<T extends string = string> {
    id?: T;
    value?: T;
    label: string;
    icon?: React.ReactNode;
}
export interface SettingsSegmentedTabsProps<T extends string = string> {
    items: readonly SettingsTabItem<any>[];
    activeId?: string;
    value?: string;
    onChange?: (id: any) => void;
    onValueChange?: (val: any) => void;
    className?: string;
}
export declare function SettingsSegmentedTabs<T extends string = string>({ items, activeId, value, onChange, onValueChange, className, }: SettingsSegmentedTabsProps<T>): React.JSX.Element;
//# sourceMappingURL=SettingsSegmentedTabs.d.ts.map