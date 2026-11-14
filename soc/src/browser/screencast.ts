import type { Page, CDPSession } from 'puppeteer-core'
import type { ScreencastFrameData, ScreencastOptions, CdpInputEvent } from './types.ts'

export async function attachPageScreencast(
  page: Page,
  onFrame: (frame: ScreencastFrameData) => void,
  options: ScreencastOptions = {},
): Promise<{ cdpSession: CDPSession; detach: () => Promise<void> }> {
  let cdpSession: CDPSession
  try {
    cdpSession = await page.createCDPSession()
  } catch (err) {
    throw new Error(`无法创建 CDP 会话以挂接 Screencast: ${err}`)
  }

  let isDetached = false
  const { maxFps = 15, quality = 60, maxWidth = 1280, maxHeight = 800 } = options

  cdpSession.on('Page.screencastFrame', async (event: any) => {
    if (isDetached || !cdpSession) return
    try {
      await cdpSession.send('Page.screencastFrameAck', {
        sessionId: event.sessionId,
      })
    } catch {}

    const frame: ScreencastFrameData = {
      sessionId: event.sessionId,
      data: event.data,
      metadata: event.metadata,
      timestamp: Date.now(),
    }

    try {
      onFrame(frame)
    } catch {}
  })

  try {
    await cdpSession.send('Page.startScreencast', {
      format: 'jpeg',
      quality,
      maxWidth,
      maxHeight,
      everyNthFrame: Math.max(1, Math.round(60 / maxFps)),
    })
  } catch (err) {
    console.warn('[browser-service] 启动 CDP Screencast 警告:', err)
  }

  const detach = async () => {
    if (isDetached) return
    isDetached = true
    try {
      await cdpSession.send('Page.stopScreencast').catch(() => {})
      await cdpSession.detach().catch(() => {})
    } catch {}
  }

  return { cdpSession, detach }
}

export async function dispatchCdpInput(cdpSession: CDPSession, event: CdpInputEvent): Promise<void> {
  if (!cdpSession) return
  const x = Math.round(event.x ?? 0)
  const y = Math.round(event.y ?? 0)

  switch (event.type) {
    case 'mousePressed': {
      await cdpSession.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x,
        y,
        button: event.button || 'left',
        buttons: event.button === 'right' ? 2 : 1,
        clickCount: 1,
      })
      break
    }
    case 'mouseMoved': {
      const isDragging = event.button === 'left' || event.button === 'right'
      await cdpSession.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x,
        y,
        button: isDragging ? (event.button || 'left') : 'none',
        buttons: isDragging ? (event.button === 'right' ? 2 : 1) : 0,
      })
      break
    }
    case 'mouseReleased': {
      await cdpSession.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x,
        y,
        button: event.button || 'left',
        buttons: 0,
        clickCount: 1,
      })
      break
    }
    case 'click': {
      await cdpSession.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x,
        y,
        button: event.button || 'left',
        buttons: 1,
        clickCount: 1,
      })
      await cdpSession.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x,
        y,
        button: event.button || 'left',
        buttons: 0,
        clickCount: 1,
      })
      break
    }
    case 'wheel': {
      await cdpSession.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x,
        y,
        deltaX: event.deltaX || 0,
        deltaY: event.deltaY || 0,
      })
      break
    }
    case 'keyDown': {
      await cdpSession.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: event.key,
        text: event.text,
      })
      break
    }
    case 'keyUp': {
      await cdpSession.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: event.key,
      })
      break
    }
  }
}
