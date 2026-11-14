export function useWinCodeIntl() {
  return {
    intl: {
      formatMessage: (descriptor: { id?: string; defaultMessage?: string }, values?: Record<string, any>) => {
        let msg = descriptor.defaultMessage || descriptor.id || ''
        if (values) {
          for (const [k, v] of Object.entries(values)) {
            msg = msg.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
          }
        }
        return msg
      },
      locale: 'zh-CN',
    },
  }
}
