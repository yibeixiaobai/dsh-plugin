export interface ToastOptions {
  description?: string
  duration?: number
}

function showNotice(title: string, opts?: ToastOptions, type: 'info' | 'success' | 'error' = 'info') {
  if (typeof window !== 'undefined') {
    const msg = opts?.description ? `${title}: ${opts.description}` : title
    if (type === 'error') console.error(`[Toast] ${msg}`)
    else console.log(`[Toast] ${msg}`)
  }
}

export const toast = Object.assign(
  (title: string, opts?: ToastOptions) => showNotice(title, opts, 'info'),
  {
    success: (title: string, opts?: ToastOptions) => showNotice(title, opts, 'success'),
    error: (title: string, opts?: ToastOptions) => showNotice(title, opts, 'error'),
    info: (title: string, opts?: ToastOptions) => showNotice(title, opts, 'info'),
  },
)
