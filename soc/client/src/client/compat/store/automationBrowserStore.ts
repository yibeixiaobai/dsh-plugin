const store: any = {
  sessions: [],
  activeSession: null,
  instances: {},
  connect: async () => {},
  disconnect: async () => {},
}

export function useAutomationBrowserStore(selector?: any): any {
  return selector ? selector(store) : store
}

useAutomationBrowserStore.getState = (): any => store
useAutomationBrowserStore.setState = (_partial: any): void => {}
