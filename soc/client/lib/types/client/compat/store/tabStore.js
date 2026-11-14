export * from './TabStoreProvider.js';
export function isWorkspaceTab(tab) {
    return Boolean(tab && (tab.workspacePath || tab.type === 'workspace'));
}
//# sourceMappingURL=tabStore.js.map