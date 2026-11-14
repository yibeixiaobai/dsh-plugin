import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { SUB_CATEGORIES_BY_MAIN, WECHAT_THEMES, } from '../wechat-canvas/wechatCanvasTypes.js';
import css from './SocialTypographyDropdownMenu.module.css';
/**
 * Dropdown menu for typography subcategories and canvas theme palette.
 *
 * @param props - Dropdown menu mode, selected state and selection callbacks.
 * @returns Popover menu element or null when inactive.
 */
export function SocialTypographyDropdownMenu({ mode, activeMainCategory, activeSubCategory, activeThemeKey = 'wenying', onSelectSubCategory, onSelectTheme, onClose, }) {
    const containerRef = useRef(null);
    // Close on outside click
    useEffect(() => {
        function handleClickOutside(event) {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                onClose();
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);
    // Subcategory picker mode
    if (mode === 'subCategory') {
        const subCategories = SUB_CATEGORIES_BY_MAIN[activeMainCategory] || [];
        if (subCategories.length === 0)
            return null;
        return (_jsx("div", { ref: containerRef, className: css.subCategoryMenu, children: _jsx("div", { className: css.menuList, children: subCategories.map((sub) => {
                    const isAll = sub.startsWith('全部');
                    const isSelected = activeSubCategory === sub || (isAll && activeSubCategory === 'all');
                    return (_jsxs("button", { type: "button", onClick: () => {
                            onSelectSubCategory(isAll ? 'all' : sub);
                            onClose();
                        }, className: `${css.menuItem} ${isSelected ? css.menuItemActive : ''}`, children: [_jsx("span", { children: sub }), isSelected && _jsx(Check, { className: css.checkIcon })] }, sub));
                }) }) }));
    }
    // Theme palette picker mode
    if (mode === 'themePicker') {
        const themeEntries = Object.entries(WECHAT_THEMES);
        return (_jsxs("div", { ref: containerRef, className: css.themePickerMenu, children: [_jsx("div", { className: css.menuHeader, children: "\u753B\u7EB8\u4E3B\u9898\u914D\u8272" }), _jsx("div", { className: css.menuList, children: themeEntries.map(([key, item]) => {
                        const isSelected = activeThemeKey === key;
                        return (_jsxs("button", { type: "button", onClick: () => {
                                onSelectTheme?.(key);
                                onClose();
                            }, className: `${css.menuItem} ${isSelected ? css.menuItemActive : ''}`, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '8px' }, children: [_jsx("span", { className: css.themeColorDot, style: { backgroundColor: item.main } }), _jsx("span", { children: item.name })] }), isSelected && _jsx(Check, { className: css.checkIcon })] }, key));
                    }) })] }));
    }
    return null;
}
//# sourceMappingURL=SocialTypographyDropdownMenu.js.map