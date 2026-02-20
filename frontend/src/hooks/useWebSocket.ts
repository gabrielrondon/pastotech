'use client'
import { useEffect, useRef, useCallback } from 'react'
import type { WSEvent } from '@/types'

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8080/api/v1/ws'

interface UseWebSocketOptions {
  farmId: string
  onGPSUpdate?: (payload: WSEvent) => void
  onAlert?: (payload: WSEvent) => void
  enabled?: boolean
}

export function useWebSocket({ farmId, onGPSUpdate, onAlert, enabled = true }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout>>(undefined)

  const connect = useCallback(() => {
    if (!enabled || !farmId) return
    const url = `${WS_URL}?farm_id=${farmId}`
    const ws = new WebSocket(url)

    ws.onopen = () => console.log('[WS] connected, farm:', farmId)

    ws.onmessage = (e) => {
      try {
        const event: WSEvent = JSON.parse(e.data)
        if (event.type === 'gps_update') onGPSUpdate?.(event)
        if (event.type === 'alert') onAlert?.(event)
      } catch {}
    }

    ws.onclose = () => {
      console.log('[WS] disconnected, reconnecting in 3s...')
      reconnectTimeout.current = setTimeout(connect, 3000)
    }

    ws.onerror = () => ws.close()
    wsRef.current = ws
  }, [farmId, enabled, onGPSUpdate, onAlert])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimeout.current)
      wsRef.current?.close()
    }
  }, [connect])

  return { ws: wsRef.current }
}
