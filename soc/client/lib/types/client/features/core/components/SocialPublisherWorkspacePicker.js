import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { memo, useMemo, useState, useRef, useEffect } from 'react';
import { Folder, FolderPlus, House, Cloud, Search, ChevronDown, Check } from 'lucide-react';
import { useWinCodeIntl } from '../../../compat/i18n/IntlProvider.js';
import { useTabStore } from '../../../compat/store/TabStoreProvider.js';
import { isWorkspaceTab } from '../../../compat/store/tabStore.js';
import { useSelectDirectory } from '../../../compat/hooks/usePlatform.js';
import css from '../SocialPublisherComposerCard.module.css';
function getPathBaseName(pathStr) {
    if (!pathStr)
        return '';
    const normalized = pathStr.replace(/\\/g, '/').replace(/\/+$/, '');
    const parts = normalized.split('/');
    return parts[parts.length - 1] || normalized;
}
function isHomePath(pathStr) {
    const normalized = pathStr.replace(/\\/g, '/').replace(/\/+$/, '');
    return /^(\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\/Users\/[^/]+)$/.test(normalized);
}
export const SocialPublisherWorkspacePicker = memo(function SocialPublisherWorkspacePicker({ currentWorkspacePath, onSelectWorkspacePath, disabled = false, }) {
    const { intl } = useWinCodeIntl();
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const containerRef = useRef(null);
    const selectDirectory = useSelectDirectory();
    // 点击外部自动关闭浮层
    useEffect(() => {
        if (!open)
            return;
        const onMouseDown = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, [open]);
    // 按 Escape 键自动关闭浮层
    useEffect(() => {
        if (!open)
            return;
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                setOpen(false);
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [open]);
    // 从 tabStore 获取所有已打开的工作区项目（安全空值防御）
    const rawTabs = useTabStore((state) => state?.tabs);
    const tabs = Array.isArray(rawTabs) ? rawTabs : [];
    const openWorkspaceTabs = useMemo(() => {
        const list = [];
        const seen = new Set();
        for (const tab of tabs) {
            if (isWorkspaceTab(tab) && tab.workspacePath) {
                const key = tab.workspaceIdentity?.trim() || tab.workspacePath;
                if (!seen.has(key)) {
                    seen.add(key);
                    list.push(tab);
                }
            }
        }
        if (list.length === 0 && currentWorkspacePath) {
            list.push({
                id: 'current-workspace',
                workspacePath: currentWorkspacePath,
                workspaceIdentity: currentWorkspacePath,
            });
        }
        return list;
    }, [tabs, currentWorkspacePath]);
    // 根据搜索词过滤
    const filteredTabs = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q)
            return openWorkspaceTabs;
        return openWorkspaceTabs.filter((tab) => {
            const name = getPathBaseName(tab.workspacePath).toLowerCase();
            return name.includes(q) || tab.workspacePath.toLowerCase().includes(q);
        });
    }, [openWorkspaceTabs, searchQuery]);
    const currentWorkspaceName = useMemo(() => {
        if (!currentWorkspacePath)
            return '';
        return getPathBaseName(currentWorkspacePath);
    }, [currentWorkspacePath]);
    const isCurrentHome = currentWorkspacePath ? isHomePath(currentWorkspacePath) : false;
    const TriggerIcon = isCurrentHome ? House : Folder;
    const handleOpenFolder = async () => {
        try {
            const selected = await selectDirectory();
            if (selected && typeof selected === 'string') {
                onSelectWorkspacePath(selected);
            }
        }
        catch {
            // 忽略文件选择取消
        }
    };
    return (_jsxs("div", { ref: containerRef, style: { position: 'relative', display: 'inline-block' }, children: [_jsxs("button", { type: "button", disabled: disabled, onClick: () => setOpen(prev => !prev), className: css.workspacePickerBtn, title: currentWorkspacePath ? `当前项目工作区: ${currentWorkspacePath}` : '选择工作区', children: [_jsx(TriggerIcon, { size: 13, style: { color: 'var(--dsw-alias-label-secondary, #6b7280)', flexShrink: 0 } }), _jsx("span", { style: { maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: currentWorkspaceName || '选择工作区' }), _jsx(ChevronDown, { size: 12, style: {
                            color: 'var(--dsw-alias-label-tertiary, #9ca3af)',
                            flexShrink: 0,
                            transform: open ? 'rotate(180deg)' : 'none',
                            transition: 'transform 0.15s ease',
                        } })] }), open && (_jsxs("div", { className: css.workspacePopover, children: [_jsxs("div", { className: css.workspaceSearchRow, children: [_jsx(Search, { size: 13, style: { color: 'var(--dsw-alias-label-caption, #9ca3af)', flexShrink: 0 } }), _jsx("input", { type: "text", value: searchQuery, onChange: e => setSearchQuery(e.target.value), placeholder: intl.formatMessage({ id: 'chat.empty.workspaceSearchPlaceholder', defaultMessage: '搜索工作区...' }), className: css.workspaceSearchInput, autoFocus: true, onKeyDown: e => e.stopPropagation() })] }), _jsxs("div", { className: css.workspaceList, children: [filteredTabs.map((tab, idx) => {
                                const isSelected = tab.workspacePath === currentWorkspacePath;
                                const tabName = getPathBaseName(tab.workspacePath);
                                const isHome = isHomePath(tab.workspacePath);
                                const isRemote = Boolean(tab.remoteSessionId || tab.workspaceIdentity?.startsWith('remote:'));
                                const ItemIcon = isRemote ? Cloud : isHome ? House : Folder;
                                return (_jsxs("button", { type: "button", "data-active": isSelected ? 'true' : undefined, onClick: () => {
                                        onSelectWorkspacePath(tab.workspacePath);
                                        setOpen(false);
                                    }, className: `${css.workspaceItem} ${isSelected ? css.workspaceItemActive : ''}`, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }, children: [_jsx(ItemIcon, { size: 13, style: { color: 'var(--dsw-alias-label-secondary, #6b7280)', flexShrink: 0 } }), _jsx("span", { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: tabName })] }), isSelected && _jsx(Check, { size: 13, style: { flexShrink: 0, color: '#059669' } })] }, tab.id || tab.workspacePath || idx));
                            }), filteredTabs.length === 0 && (_jsx("div", { style: { padding: '8px', textAlign: 'center', fontSize: '11px', color: 'var(--dsw-alias-label-caption, #9ca3af)' }, children: intl.formatMessage({ id: 'chat.empty.workspaceSearchEmpty', defaultMessage: '暂无可选工作区' }) }))] }), _jsxs("button", { type: "button", onClick: () => {
                            setOpen(false);
                            handleOpenFolder();
                        }, className: css.workspaceActionItem, children: [_jsx(FolderPlus, { size: 13, style: { color: 'var(--dsw-alias-label-secondary, #6b7280)', flexShrink: 0 } }), _jsx("span", { children: intl.formatMessage({ id: 'workspace.openFolder', defaultMessage: '选择其他目录...' }) })] })] }))] }));
});
//# sourceMappingURL=SocialPublisherWorkspacePicker.js.map