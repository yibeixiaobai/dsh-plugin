import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { memo } from 'react';
import { Check } from 'lucide-react';
import { PLATFORMS, } from '../utils/socialPlatformsMeta.js';
import css from '../SocialPublisherComposerCard.module.css';
export const SocialPlatformGridPicker = memo(function SocialPlatformGridPicker({ selectedPlatforms, onTogglePlatform, }) {
    return (_jsx("div", { className: css.platformGrid, children: PLATFORMS.map((platform) => {
            const isSelected = selectedPlatforms.includes(platform.key);
            return (_jsxs("button", { type: "button", onClick: () => onTogglePlatform(platform.key), title: platform.label, className: `${css.platformBtn} ${isSelected ? css.platformBtnActive : ''}`, children: [_jsx("span", { children: platform.shortLabel }), isSelected ? _jsx(Check, { size: 12, strokeWidth: 2.5, style: { flexShrink: 0 } }) : null] }, platform.key));
        }) }));
});
//# sourceMappingURL=SocialPlatformGridPicker.js.map