import { jsx as _jsx } from "react/jsx-runtime";
import { ScopedErrorBoundary } from '../ErrorBoundary.js';
import { SocialPublisherComposerCard as BaseCard } from './core/SocialPublisherComposerCardImpl.js';
export function SocialPublisherComposerCard(props) {
    return (_jsx(ScopedErrorBoundary, { scope: "social-publisher-composer-card", variant: "compact", children: _jsx(BaseCard, { ...props }) }));
}
//# sourceMappingURL=SocialPublisherComposerCard.js.map