import { type ReactNode } from 'react';
export interface SocialTypographyDropdownMenuProps {
    readonly mode: 'subCategory' | 'themePicker';
    readonly activeMainCategory: string;
    readonly activeSubCategory: string;
    readonly activeThemeKey?: string;
    readonly onSelectSubCategory: (sub: string) => void;
    readonly onSelectTheme?: (themeKey: string) => void;
    readonly onClose: () => void;
}
/**
 * Dropdown menu for typography subcategories and canvas theme palette.
 *
 * @param props - Dropdown menu mode, selected state and selection callbacks.
 * @returns Popover menu element or null when inactive.
 */
export declare function SocialTypographyDropdownMenu({ mode, activeMainCategory, activeSubCategory, activeThemeKey, onSelectSubCategory, onSelectTheme, onClose, }: SocialTypographyDropdownMenuProps): ReactNode;
//# sourceMappingURL=SocialTypographyDropdownMenu.d.ts.map