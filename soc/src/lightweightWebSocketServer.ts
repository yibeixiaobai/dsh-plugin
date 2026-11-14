/**
 * 轻量级原生 WebSocket 服务端实现 (RFC 6455 规范)
 * 专为浏览器插件双向桥接服务，避免额外外部依赖与打包问题
 */

import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import type http from 'node:http'
import type stream from 'node:stream'
import { browserConnectorManager } from './browserConnectorDispatcher.ts'

export class LightweightWebSocket extends EventEmitter {
  private socket: stream.Duplex
  private buffer = Buffer.alloc(0)

  constructor(socket: stream.Duplex) {
    super()
    this.socket = socket

    socket.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk])
      this.processBuffer()
    })

    socket.on('close', () => this.emit('close'))
    socket.on('error', err => this.emit('error', err))
  }

  private processBuffer(): void {
    while (this.buffer.length >= 2) {
      const firstByte = this.buffer[0]
      const secondByte = this.buffer[1]
      const opcode = firstByte & 0x0f
      const isMasked = (secondByte & 0x80) !== 0
      let payloadLen = secondByte & 0x7f
      let headerLen = 2

      if (payloadLen === 126) {
        if (this.buffer.length < 4) return
        payloadLen = this.buffer.readUInt16BE(2)
        headerLen = 4
      } else if (payloadLen === 127) {
        if (this.buffer.length < 10) return
        payloadLen = Number(this.buffer.readBigUInt64BE(2))
        headerLen = 10
      }

      const maskKeyLen = isMasked ? 4 : 0
      const totalFrameLen = headerLen + maskKeyLen + payloadLen
      if (this.buffer.length < totalFrameLen) return

      let maskKey: Buffer | null = null
      if (isMasked) {
        maskKey = this.buffer.subarray(headerLen, headerLen + 4)
      }

      const payload = Buffer.from(this.buffer.subarray(headerLen + maskKeyLen, totalFrameLen))
      if (isMasked && maskKey) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskKey[i % 4]
        }
      }

      this.buffer = this.buffer.subarray(totalFrameLen)

      // opcode 0x1: text, 0x8: close, 0x9: ping, 0xA: pong
      if (opcode === 0x1) {
        this.emit('message', payload.toString('utf-8'))
      } else if (opcode === 0x8) {
        this.close()
        return
      } else if (opcode === 0x9) {
        this.sendFrame(0x0a, payload)
      }
    }
  }

  public send(data: string | object): void {
    const text = typeof data === 'string' ? data : JSON.stringify(data)
    this.sendFrame(0x01, Buffer.from(text, 'utf-8'))
  }

  private sendFrame(opcode: number, payload: Buffer): void {
    if (this.socket.destroyed) return
    const len = payload.length
    let header: Buffer
    if (len < 126) {
      header = Buffer.from([0x80 | (opcode & 0x0f), len])
    } else if (len <= 65535) {
      header = Buffer.alloc(4)
      header[0] = 0x80 | (opcode & 0x0f)
      header[1] = 126
      header.writeUInt16BE(len, 2)
    } else {
      header = Buffer.alloc(10)
      header[0] = 0x80 | (opcode & 0x0f)
      header[1] = 127
      header.writeBigUInt64BE(BigInt(len), 2)
    }
    this.socket.write(Buffer.concat([header, payload]))
  }

  public close(): void {
    try {
      this.sendFrame(0x08, Buffer.alloc(0))
      this.socket.end()
    } catch {}
  }
}

const activeSockets = new Set<LightweightWebSocket>()

/**
 * 处理 HTTP Upgrade 协议升级握手为 WebSocket 连接
 */
export function handleConnectorUpgrade(
  req: http.IncomingMessage,
  socket: stream.Duplex,
  head: Buffer,
): boolean {
  let pathname = ''
  try {
    pathname = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`).pathname
  } catch {
    socket.destroy()
    return false
  }

  if (pathname !== '/ws/browser-connector') {
    return false
  }

  const key = req.headers['sec-websocket-key']
  if (!key || typeof key !== 'string') {
    socket.destroy()
    return false
  }

  const accept = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64')

  const responseHeaders = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '\r\n',
  ]

  socket.write(responseHeaders.join('\r\n'))

  const ws = new LightweightWebSocket(socket)
  activeSockets.add(ws)
  browserConnectorManager.recordHeartbeat()

  ws.on('message', (rawMsg: string) => {
    browserConnectorManager.recordHeartbeat()
    try {
      const msg = JSON.parse(rawMsg)
      if (!msg || typeof msg !== 'object') return

      switch (msg.type) {
        case 'CLIENT_HELLO':
          ws.send({
            id: `ack_${msg.id || Date.now()}`,
            type: 'SERVER_HELLO',
            timestamp: Date.now(),
            payload: { ok: true, server: 'wincode-social-publisher', version: '0.2.0' },
          })
          break

        case 'HEARTBEAT':
          ws.send({
            id: `hb_ack_${Date.now()}`,
            type: 'HEARTBEAT_ACK',
            timestamp: Date.now(),
          })
          break

        case 'TASK_RESULT':
          if (msg.payload && msg.payload.taskId) {
            browserConnectorManager.submitTaskResult(msg.payload)
          }
          break
      }
    } catch (err) {
      console.warn('[LightweightWS] 解析客户端消息失败:', err)
    }
  })

  ws.on('close', () => {
    activeSockets.delete(ws)
  })

  ws.on('error', () => {
    activeSockets.delete(ws)
  })

  return true
}

/**
 * 尝试通过 WebSocket 直接向在线插件分发任务
 */
export function broadcastWebSocketTask(task: any): boolean {
  if (activeSockets.size === 0) return false
  const message = {
    id: `ws_task_${task.taskId}`,
    type: 'DISPATCH_TASK',
    timestamp: Date.now(),
    payload: task,
  }

  let sent = false
  for (const ws of activeSockets) {
    try {
      ws.send(message)
      sent = true
      break // 发送给一个在线执行器即可
    } catch {
      activeSockets.delete(ws)
    }
  }
  return sent
}
