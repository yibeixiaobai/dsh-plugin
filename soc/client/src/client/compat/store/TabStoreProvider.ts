export function useTabStore(selector?: any): any {
  const store = {
    activeTab: 'main',
    setActiveTab: () => {},
    openSettingsTab: () => {},
    tabs: [],
  }
  return selector ? selector(store) : store
}
