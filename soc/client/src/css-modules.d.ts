declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}

declare global {
  namespace NodeJS {
    type Timeout = any
  }
  interface ProcessEnv {
    USERPROFILE?: string
    HOME?: string
    [key: string]: any
  }
}
