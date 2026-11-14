/**
 * 原生反自动化检测核心引擎
 * 采用 CDP 原生 evaluateOnNewDocument，在页面脚本执行前完成底层原型链与环境隐匿。
 */
import type { Page } from 'puppeteer-core'
import type { FingerprintConfig } from './types.ts'

/** 为指定页面注入全套底层反检测脚本 */
import { getOrCreateAccountFingerprint } from './fingerprintProfile.ts'

export async function attachStealthScripts(page: Page, profileDir?: string): Promise<void> {
  const fp = getOrCreateAccountFingerprint(profileDir || process.cwd())
  await applyStealthScripts(page, fp)
}

export async function applyStealthScripts(page: Page, fpConfig: FingerprintConfig): Promise<void> {
  await page.setUserAgent(fpConfig.userAgent).catch(() => {})

  await page.evaluateOnNewDocument((fp: FingerprintConfig) => {
    // 1. 原生 Function.prototype.toString 伪装
    const nativeToString = Function.prototype.toString
    const patchedFns = new WeakSet<Function>()

    function makeNative<T extends Function>(fn: T, name: string): T {
      try {
        Object.defineProperty(fn, 'name', { value: name, configurable: true })
        if ('prototype' in fn) delete (fn as any).prototype
      } catch {}
      patchedFns.add(fn)
      return fn
    }

    const helperObj = {
      toString(this: any) {
        if (typeof this !== 'function') {
          throw new TypeError("Function.prototype.toString requires that 'this' be a Function")
        }
        if (this === helperObj.toString || patchedFns.has(this)) {
          const fnName = (this && this.name) ? this.name : ''
          return `function ${fnName}() { [native code] }`
        }
        return nativeToString.call(this)
      },
    }

    makeNative(helperObj.toString, 'toString')
    try {
      Object.defineProperty(Function.prototype, 'toString', {
        value: helperObj.toString,
        writable: true,
        enumerable: false,
        configurable: true,
      })
    } catch {}

    // 2. 规范化抹除 navigator.webdriver 标志位
    try {
      if (Object.prototype.hasOwnProperty.call(navigator, 'webdriver')) {
        delete (navigator as any).webdriver
      }
      const navProto = Object.getPrototypeOf(navigator)
      if (navProto) {
        delete (navProto as any).webdriver
        Object.defineProperty(navProto, 'webdriver', {
          get: makeNative(() => false, 'get webdriver'),
          enumerable: true,
          configurable: true,
        })
      }
    } catch {}

    // 3. 构造现代桌面 window.chrome（剔除已废弃的 loadTimes/csi）
    const win = window as any
    if (!win.chrome) win.chrome = {}
    const chrome = win.chrome
    if (!chrome.app) {
      chrome.app = {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
        getIsInstalled: makeNative(() => false, 'getIsInstalled'),
        getDetails: makeNative(() => null, 'getDetails'),
      }
    }
    if (!chrome.runtime) {
      chrome.runtime = {
        OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', UPDATE: 'update' },
        PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', WIN: 'win' },
        connect: makeNative(() => {}, 'connect'),
        sendMessage: makeNative(() => {}, 'sendMessage'),
      }
    }

    // 4. 注入现代 navigator.userAgentData（Client Hints 自洽）
    try {
      const uaData = {
        brands: fp.userAgentData.brands,
        mobile: fp.userAgentData.mobile,
        platform: fp.userAgentData.platform,
        getHighEntropyValues: makeNative((hints: string[]) => {
          const res: any = { brands: fp.userAgentData.brands, mobile: fp.userAgentData.mobile, platform: fp.userAgentData.platform }
          if (Array.isArray(hints)) {
            if (hints.includes('architecture')) res.architecture = fp.userAgentData.architecture
            if (hints.includes('bitness')) res.bitness = fp.userAgentData.bitness
            if (hints.includes('model')) res.model = fp.userAgentData.model
            if (hints.includes('platformVersion')) res.platformVersion = fp.userAgentData.platformVersion
          }
          return Promise.resolve(res)
        }, 'getHighEntropyValues'),
        toJSON: makeNative(() => ({ brands: fp.userAgentData.brands, mobile: fp.userAgentData.mobile, platform: fp.userAgentData.platform }), 'toJSON'),
      }
      Object.defineProperty(navigator, 'userAgentData', { get: makeNative(() => uaData, 'get userAgentData'), enumerable: true, configurable: true })
      Object.defineProperty(navigator, 'platform', { get: makeNative(() => 'Win32', 'get platform'), enumerable: true, configurable: true })
    } catch {}

    // 5. 模拟现代标准 navigator.plugins 与 navigator.mimeTypes
    try {
      const pdfTypes = [{ type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' }]
      const pluginData = [
        { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', mimeTypes: pdfTypes },
        { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', mimeTypes: pdfTypes },
        { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', mimeTypes: pdfTypes },
      ]
      const fakePlugins: any = []
      const fakeMimeTypes: any = []
      for (let i = 0; i < pluginData.length; i++) {
        const p = pluginData[i]
        const pluginObj: any = {
          name: p.name,
          filename: p.filename,
          description: p.description,
          length: p.mimeTypes.length,
          item: makeNative(function (idx: number) { return this[idx] || null }, 'item'),
          namedItem: makeNative(function (name: string) { return (this as any)[name] || null }, 'namedItem'),
        }
        for (let j = 0; j < p.mimeTypes.length; j++) {
          const m = p.mimeTypes[j]
          const mimeObj: any = { type: m.type, suffixes: m.suffixes, description: m.description, enabledPlugin: pluginObj }
          pluginObj[j] = mimeObj
          pluginObj[m.type] = mimeObj
          fakeMimeTypes.push(mimeObj)
          fakeMimeTypes[m.type] = mimeObj
        }
        fakePlugins.push(pluginObj)
        fakePlugins[p.name] = pluginObj
      }
      fakePlugins.item = makeNative(function (idx: number) { return fakePlugins[idx] || null }, 'item')
      fakePlugins.namedItem = makeNative(function (name: string) { return fakePlugins[name] || null }, 'namedItem')
      fakePlugins.refresh = makeNative(function () {}, 'refresh')
      fakeMimeTypes.item = makeNative(function (idx: number) { return fakeMimeTypes[idx] || null }, 'item')
      fakeMimeTypes.namedItem = makeNative(function (name: string) { return fakeMimeTypes[name] || null }, 'namedItem')
      Object.defineProperty(navigator, 'plugins', { get: makeNative(() => fakePlugins, 'get plugins'), enumerable: true, configurable: true })
      Object.defineProperty(navigator, 'mimeTypes', { get: makeNative(() => fakeMimeTypes, 'get mimeTypes'), enumerable: true, configurable: true })
    } catch {}

    // 6. 视口与屏幕几何自洽
    try {
      if (fp.windowGeometry) {
        Object.defineProperty(window, 'outerWidth', { get: makeNative(() => window.innerWidth + (fp.windowGeometry.outerWidthDiff || 16), 'get outerWidth'), enumerable: true, configurable: true })
        Object.defineProperty(window, 'outerHeight', { get: makeNative(() => window.innerHeight + (fp.windowGeometry.outerHeightDiff || 79), 'get outerHeight'), enumerable: true, configurable: true })
        Object.defineProperty(window, 'devicePixelRatio', { get: makeNative(() => fp.windowGeometry.devicePixelRatio || 1.0, 'get devicePixelRatio'), enumerable: true, configurable: true })
      }
      if (fp.screen) {
        Object.defineProperty(screen, 'width', { get: makeNative(() => fp.screen.width, 'get width'), enumerable: true, configurable: true })
        Object.defineProperty(screen, 'height', { get: makeNative(() => fp.screen.height, 'get height'), enumerable: true, configurable: true })
        Object.defineProperty(screen, 'availWidth', { get: makeNative(() => fp.screen.availWidth, 'get availWidth'), enumerable: true, configurable: true })
        Object.defineProperty(screen, 'availHeight', { get: makeNative(() => fp.screen.availHeight, 'get availHeight'), enumerable: true, configurable: true })
      }
    } catch {}

    // 7. WebGL 光栅化伪装
    try {
      const patchWebGL = (proto: any) => {
        if (!proto?.getParameter) return
        const originalGetParameter = proto.getParameter
        proto.getParameter = makeNative(function (this: any, param: number) {
          if (param === 37445) return fp.vendor
          if (param === 37446) return fp.renderer
          return originalGetParameter.call(this, param)
        }, 'getParameter')
      }
      patchWebGL(window.WebGLRenderingContext?.prototype)
      patchWebGL(window.WebGL2RenderingContext?.prototype)
    } catch {}

    // 8. Canvas 微噪扰动
    try {
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL
      HTMLCanvasElement.prototype.toDataURL = makeNative(function (this: HTMLCanvasElement, ...args: any[]) {
        const ctx = this.getContext('2d')
        if (ctx && this.width > 0 && this.height > 0) {
          try {
            const w = Math.min(this.width, 16)
            const h = Math.min(this.height, 16)
            const imgData = ctx.getImageData(0, 0, w, h)
            const seed = fp.canvasNoiseSeed || 1
            for (let i = 0; i < imgData.data.length; i += 4) {
              imgData.data[i] = imgData.data[i] ^ (seed % 2)
            }
            ctx.putImageData(imgData, 0, 0)
          } catch {}
        }
        return origToDataURL.apply(this, args)
      }, 'toDataURL')
    } catch {}

    // 9. 语言与权限自洽
    try {
      Object.defineProperty(navigator, 'languages', { get: makeNative(() => fp.languages || ['zh-CN', 'zh', 'en'], 'get languages'), enumerable: true, configurable: true })
      if (navigator.permissions?.query) {
        const origQuery = navigator.permissions.query
        navigator.permissions.query = makeNative(function (this: any, params: any) {
          if (params?.name === 'notifications') {
            return Promise.resolve({ state: 'prompt', name: 'notifications', onchange: null } as any)
          }
          return origQuery.call(this, params)
        }, 'query')
      }
    } catch {}

    // 10. CDP 堆栈与 Puppeteer 残留清理
    try {
      const origStackGetter = Object.getOwnPropertyDescriptor(Error.prototype, 'stack')?.get
      if (origStackGetter) {
        Object.defineProperty(Error.prototype, 'stack', {
          get: makeNative(function (this: any) {
            const val = origStackGetter.call(this)
            return typeof val === 'string' ? val.replace(/__puppeteer_evaluation_script__:[0-9]+:[0-9]+/g, 'script.js:1:1') : val
          }, 'get stack'),
          enumerable: false,
          configurable: true,
        })
      }
    } catch {}
  }, fpConfig)
}
