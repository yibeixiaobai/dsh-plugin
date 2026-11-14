export function useSelectDirectory(): (options?: any) => Promise<string | undefined> {
  return async () => undefined
}

export function useOptionalPlatform(): any {
  return {
    isDesktop: false,
    openExternal: (url: string) => {
      if (typeof window !== 'undefined') window.open(url, '_blank')
    },
  }
}

export function usePlatform(): any {
  return useOptionalPlatform()
}
