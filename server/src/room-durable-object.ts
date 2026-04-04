// Durable Object for managing WebSocket connections in a typing room

interface Participant {
  id: string
  name: string
  ws: WebSocket
  progress: number
  currentWpm: number
  accuracy: number
  completed: boolean
  finishedAt?: number
  wpm?: number  // Final WPM when completed
}

interface RoomState {
  roomId: string
  roomCode: string
  status: 'waiting' | 'active' | 'completed'
  timeLimit: number
  wordSet: string[]
  scheduledStartTime?: number
  startedAt?: number
  participants: Map<string, Participant>
}

export class RoomDurableObject {
  private state: DurableObjectState
  private env: Env
  private roomState: RoomState | null = null
  private autoStartTimer: any = null

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    
    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)
      
      await this.handleWebSocket(server, request)
      
      return new Response(null, {
        status: 101,
        webSocket: client,
      })
    }
    
    // Handle HTTP requests for room initialization
    if (url.pathname === '/initialize') {
      const data = await request.json() as any
      await this.initializeRoom(data)
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (url.pathname === '/state') {
      return new Response(JSON.stringify({
        success: true,
        roomState: this.getRoomStateForClient()
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (url.pathname === '/leaderboard') {
      return new Response(JSON.stringify({
        success: true,
        leaderboard: this.calculateLeaderboard()
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    return new Response('Not found', { status: 404 })
  }

  private async initializeRoom(data: any) {
    this.roomState = {
      roomId: data.roomId,
      roomCode: data.roomCode,
      status: 'waiting',
      timeLimit: data.timeLimit,
      wordSet: data.wordSet,
      scheduledStartTime: data.scheduledStartTime,
      participants: new Map()
    }
    
    // Set up auto-start timer if scheduled
    if (data.scheduledStartTime) {
      const delay = data.scheduledStartTime - Date.now()
      if (delay > 0) {
        this.autoStartTimer = setTimeout(() => {
          this.startGame()
        }, delay)
      }
    }
  }

  private async handleWebSocket(ws: WebSocket, request: Request) {
    ws.accept()
    
    let participantId: string | null = null
    
    ws.addEventListener('message', async (event) => {
      try {
        const message = JSON.parse(event.data as string)
        
        switch (message.type) {
          case 'JOIN':
            participantId = await this.handleJoin(ws, message)
            break
            
          case 'TYPING_PROGRESS':
            if (participantId) {
              await this.handleTypingProgress(participantId, message)
            }
            break
            
          case 'COMPLETE':
            if (participantId) {
              await this.handleComplete(participantId, message)
            }
            break
            
          case 'START_GAME':
            await this.startGame()
            break

          case 'RESTART_GAME':
            await this.restartGame()
            break
            
          case 'PING':
            ws.send(JSON.stringify({ type: 'PONG' }))
            break
        }
      } catch (error) {
        console.error('WebSocket message error:', error)
        ws.send(JSON.stringify({
          type: 'ERROR',
          error: error instanceof Error ? error.message : 'Unknown error'
        }))
      }
    })
    
    ws.addEventListener('close', () => {
      if (participantId && this.roomState) {
        this.roomState.participants.delete(participantId)
        this.broadcastRoomState()
      }
    })
    
    ws.addEventListener('error', (error) => {
      console.error('WebSocket error:', error)
    })
  }

  private async handleJoin(ws: WebSocket, message: any): Promise<string> {
    if (!this.roomState) {
      throw new Error('Room not initialized')
    }
    
    if (this.roomState.status !== 'waiting') {
      throw new Error('Room is not accepting new participants')
    }
    
    const participantId = crypto.randomUUID()
    const participant: Participant = {
      id: participantId,
      name: message.name,
      ws: ws,
      progress: 0,
      currentWpm: 0,
      accuracy: 100,  // Start at 100% accuracy
      completed: false
    }
    
    this.roomState.participants.set(participantId, participant)
    
    // Send join confirmation with room data
    ws.send(JSON.stringify({
      type: 'JOINED',
      participantId,
      roomState: this.getRoomStateForClient()
    }))
    
    // Broadcast updated room state to all participants
    this.broadcastRoomState()
    
    return participantId
  }

  private async handleTypingProgress(participantId: string, message: any) {
    if (!this.roomState) return
    
    const participant = this.roomState.participants.get(participantId)
    if (!participant) return
    
    participant.progress = message.progress || 0
    participant.currentWpm = message.currentWpm || 0
    participant.accuracy = message.accuracy ?? 0
    
    console.log('Progress update:', participant.name, 'WPM:', participant.currentWpm, 'Accuracy:', participant.accuracy)
    
    // Broadcast progress to all participants
    this.broadcast({
      type: 'PARTICIPANT_PROGRESS',
      participantId,
      progress: participant.progress,
      currentWpm: participant.currentWpm,
      accuracy: participant.accuracy
    })
  }

  private async handleComplete(participantId: string, message: any) {
    if (!this.roomState) return
    
    const participant = this.roomState.participants.get(participantId)
    if (!participant) return
    
    participant.completed = true
    participant.finishedAt = Date.now()
    // Keep latest live values if COMPLETE payload is missing/zero.
    const finalWpm = typeof message.wpm === 'number' && message.wpm > 0
      ? message.wpm
      : participant.currentWpm
    const finalAccuracy = typeof message.accuracy === 'number' && message.accuracy > 0
      ? message.accuracy
      : participant.accuracy

    participant.wpm = finalWpm
    participant.currentWpm = finalWpm
    participant.accuracy = finalAccuracy
    participant.progress = 100
    
    console.log('Complete:', participant.name, 'WPM:', participant.currentWpm, 'Accuracy:', participant.accuracy)
    
    // Check if all participants completed or time is up
    const allCompleted = Array.from(this.roomState.participants.values()).every(p => p.completed)
    
    if (allCompleted) {
      await this.endGame()
    } else {
      this.broadcastRoomState()
    }
  }

  private async startGame() {
    if (!this.roomState || this.roomState.status !== 'waiting') return
    
    this.roomState.status = 'active'
    this.roomState.startedAt = Date.now()
    
    // Broadcast game start
    this.broadcast({
      type: 'GAME_STARTED',
      startedAt: this.roomState.startedAt,
      timeLimit: this.roomState.timeLimit
    })
    
    // Set timer to end game (add 500ms buffer to allow final COMPLETE messages)
    setTimeout(() => {
      this.endGame()
    }, (this.roomState.timeLimit * 1000) + 500)
  }

  private async endGame() {
    if (!this.roomState || this.roomState.status === 'completed') return
    
    this.roomState.status = 'completed'
    
    // Small delay to ensure any final messages are processed
    await new Promise(resolve => setTimeout(resolve, 200))
    
    // Calculate leaderboard
    const leaderboard = this.calculateLeaderboard()
    
    // Broadcast game end with leaderboard
    this.broadcast({
      type: 'GAME_ENDED',
      leaderboard
    })
  }

  private async restartGame() {
    if (!this.roomState) return
    
    // Reset room state
    this.roomState.status = 'waiting'
    this.roomState.startedAt = undefined
    
    // Reset all participants
    this.roomState.participants.forEach(p => {
      p.progress = 0
      p.currentWpm = 0
      p.accuracy = 100  // Start at 100% accuracy
      p.completed = false
      p.finishedAt = undefined
      p.wpm = undefined
    })
    
    // Broadcast restart
    this.broadcast({
      type: 'GAME_RESTARTED'
    })
    
    this.broadcastRoomState()
  }

  private calculateLeaderboard() {
    if (!this.roomState) return []
    
    const participants = Array.from(this.roomState.participants.values())
    
    console.log('Calculating leaderboard, participants:', participants.map(p => ({
      name: p.name,
      finalWpm: p.wpm,
      currentWpm: p.currentWpm,
      accuracy: p.accuracy
    })))
    
    // Prefer final completion metrics, then fall back to live values.
    return participants
      .map(p => ({
        id: p.id,
        name: p.name,
        wpm: p.wpm ?? p.currentWpm ?? 0,
        accuracy: p.accuracy ?? 0
      }))
      .sort((a, b) => {
        // Sort by WPM first
        if (a.wpm !== b.wpm) return b.wpm - a.wpm
        // Then by accuracy
        return b.accuracy - a.accuracy
      })
      .map((p, index) => ({
        rank: index + 1,
        name: p.name,
        wpm: p.wpm,
        accuracy: p.accuracy
      }))
  }

  private broadcastRoomState() {
    const state = this.getRoomStateForClient()
    this.broadcast({
      type: 'ROOM_STATE',
      state
    })
  }

  private getRoomStateForClient() {
    if (!this.roomState) return null
    
    return {
      roomId: this.roomState.roomId,
      roomCode: this.roomState.roomCode,
      status: this.roomState.status,
      timeLimit: this.roomState.timeLimit,
      scheduledStartTime: this.roomState.scheduledStartTime,
      wordSet: this.roomState.wordSet,
      startedAt: this.roomState.startedAt,
      participants: Array.from(this.roomState.participants.values()).map(p => ({
        id: p.id,
        name: p.name,
        progress: p.progress,
        currentWpm: p.currentWpm,
        accuracy: p.accuracy,
        completed: p.completed
      }))
    }
  }

  private broadcast(message: any) {
    if (!this.roomState) return
    
    const messageStr = JSON.stringify(message)
    this.roomState.participants.forEach(participant => {
      try {
        participant.ws.send(messageStr)
      } catch (error) {
        console.error('Failed to send message to participant:', error)
      }
    })
  }
}
