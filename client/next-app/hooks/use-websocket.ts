import { useEffect, useRef, useState, useCallback } from 'react'

export interface Participant {
  id: string
  name: string
  progress: number
  currentWpm: number
  accuracy: number
  completed: boolean
}

export interface RoomState {
  roomId: string
  roomCode: string
  status: 'waiting' | 'active' | 'completed'
  timeLimit: number
  wordSet: string[]
  startedAt?: number
  participants: Participant[]
}

interface LeaderboardEntry {
  rank: number
  name: string
  wpm: number
  accuracy: number
  completed: boolean
}

type MessageHandler = (data: any) => void

export function useWebSocket(roomCode: string, userName: string | null) {
  const [isConnected, setIsConnected] = useState(false)
  const [roomState, setRoomState] = useState<RoomState | null>(null)
  const [participantId, setParticipantId] = useState<string | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  
  const wsRef = useRef<WebSocket | null>(null)
  const handlersRef = useRef<Map<string, MessageHandler>>(new Map())
  const reconnectTimeoutRef = useRef<any>(null)
  const pingIntervalRef = useRef<any>(null)
  const connectRef = useRef<() => void>(() => {})

  const connect = useCallback(() => {
    if (!userName || wsRef.current?.readyState === WebSocket.OPEN) return

    try {
      const baseUrl = process.env.NEXT_PUBLIC_WS_URL || 'wss://server.typing-enhanced-eagle.workers.dev'
      const wsUrl = `${baseUrl}/api/rooms/${roomCode}/ws`
      const ws = new WebSocket(wsUrl)
      
      ws.onopen = () => {
        setIsConnected(true)
        setError(null)
        
        // Send JOIN message
        ws.send(JSON.stringify({
          type: 'JOIN',
          name: userName
        }))

        // Start ping interval
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'PING' }))
          }
        }, 30000)
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          
          switch (message.type) {
            case 'JOINED':
              setParticipantId(message.participantId)
              if (message.roomState) {
                setRoomState(message.roomState)
              }
              break
              
            case 'ROOM_STATE':
              setRoomState(message.state)
              break
              
            case 'PARTICIPANT_PROGRESS':
              setRoomState(prev => {
                if (!prev) return prev
                return {
                  ...prev,
                  participants: prev.participants.map(p =>
                    p.id === message.participantId
                      ? { ...p, progress: message.progress, currentWpm: message.currentWpm, accuracy: message.accuracy }
                      : p
                  )
                }
              })
              break
              
            case 'GAME_STARTED':
              setRoomState(prev => prev ? { ...prev, status: 'active', startedAt: message.startedAt } : null)
              break
              
            case 'GAME_ENDED':
              setRoomState(prev => prev ? { ...prev, status: 'completed' } : null)
              setLeaderboard(message.leaderboard || [])
              break

            case 'GAME_RESTARTED':
              setRoomState(prev => prev ? { ...prev, status: 'waiting', startedAt: undefined } : null)
              setLeaderboard([])
              break
              
            case 'ERROR':
              setError(message.error)
              break
          }

          // Call custom handlers
          handlersRef.current.forEach(handler => handler(message))
        } catch (err) {
          console.error('WebSocket message parse error:', err)
        }
      }

      ws.onclose = () => {
        setIsConnected(false)
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current)
        }
        
        // Attempt reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          if (userName) connectRef.current()
        }, 3000)
      }

      ws.onerror = () => {
        console.error('WebSocket error for URL:', ws.url, 'readyState:', ws.readyState)
        setError('Connection error')
      }

      wsRef.current = ws
    } catch (err) {
      console.error('WebSocket connect error:', err)
      setError('Failed to connect to room')
    }
  }, [roomCode, userName])

  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
    }
  }, [])

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    }
  }, [])

  const sendProgress = useCallback((progress: number, currentWpm: number, accuracy: number) => {
    sendMessage({
      type: 'TYPING_PROGRESS',
      progress,
      currentWpm,
      accuracy
    })
  }, [sendMessage])

  const sendComplete = useCallback((wpm: number, accuracy: number, stats: any) => {
    sendMessage({
      type: 'COMPLETE',
      wpm,
      accuracy,
      ...stats
    })
  }, [sendMessage])

  const startGame = useCallback(() => {
    sendMessage({ type: 'START_GAME' })
  }, [sendMessage])

  const restartGame = useCallback(() => {
    sendMessage({ type: 'RESTART_GAME' })
  }, [sendMessage])

  useEffect(() => {
    if (userName) {
      connect()
    }
    return () => disconnect()
  }, [userName, connect, disconnect])

  return {
    isConnected,
    roomState,
    participantId,
    leaderboard,
    error,
    sendProgress,
    sendComplete,
    startGame,
    restartGame
  }
}
