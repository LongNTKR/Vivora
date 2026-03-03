import { useEffect, useRef } from 'react'
import { useChatStore } from '@/stores/chatStore'

const WS_BASE = import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:8000'

export function useWebSocket() {
  const updateJobStatus = useChatStore((s) => s.updateJobStatus)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(`${WS_BASE}/api/ws/connect`)
      wsRef.current = ws

      ws.onopen = () => {
        // Send ping every 30s to keep alive
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping')
          } else {
            clearInterval(pingInterval)
          }
        }, 30_000)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'job_update') {
            updateJobStatus(data.job_id, data.status, {
              final_video_path: data.final_url ? data.final_url : undefined,
              error_message: data.error,
            })
          }
        } catch {
          // ignore
        }
      }

      ws.onclose = () => {
        // Reconnect after 3s
        reconnectTimer.current = setTimeout(connect, 3_000)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [updateJobStatus])
}
