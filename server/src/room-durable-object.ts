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

  private async loadRoomState(): Promise<RoomState | null> {
    if (this.roomState) return this.roomState
    
    const stored = await this.state.storage.get<any>('roomState')
    if (stored) {
      this.roomState = {
        ...stored,
        participants: new Map()
      }
    }
    return this.roomState
  }

  private async saveRoomState(): Promise<void> {
    if (!this.roomState) return
    // Store without participants (Map can't be serialized, and they're transient anyway)
    await this.state.storage.put('roomState', {
      roomId: this.roomState.roomId,
      roomCode: this.roomState.roomCode,
      status: this.roomState.status,
      timeLimit: this.roomState.timeLimit,
      wordSet: this.roomState.wordSet,
      scheduledStartTime: this.roomState.scheduledStartTime,
      startedAt: this.roomState.startedAt
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    
    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      // Load state before accepting WebSocket
      await this.loadRoomState()
      
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
    
    // Persist the room state
    await this.saveRoomState()
    
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
    
    // Save participant to database
    try {
      await this.env.my_db.prepare(
        'INSERT INTO room_participants (id, room_id, user_name) VALUES (?, ?, ?)'
      ).bind(participantId, this.roomState.roomId, message.name).run()
    } catch (error) {
      console.error('Failed to save participant to DB:', error)
    }
    
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
    participant.wpm = message.wpm
    participant.currentWpm = message.wpm  // Also update currentWpm for leaderboard
    participant.accuracy = message.accuracy
    participant.progress = 100
    
    console.log('Complete:', participant.name, 'WPM:', message.wpm, 'Accuracy:', message.accuracy)
    
    // Update database
    try {
      await this.env.my_db.prepare(
        'UPDATE room_participants SET completed = TRUE, wpm = ?, accuracy = ?, progress = 100, finished_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(message.wpm, message.accuracy, participantId).run()
      
      // Create typing session record
      await this.env.my_db.prepare(
        'INSERT INTO typing_sessions (room_id, participant_id, total_keystrokes, correct_keystrokes, errors, wpm, accuracy, duration, started_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)'
      ).bind(
        this.roomState.roomId,
        participantId,
        message.totalKeystrokes || 0,
        message.correctKeystrokes || 0,
        message.errors || 0,
        message.wpm,
        message.accuracy,
        message.duration || this.roomState.timeLimit,
        new Date(this.roomState.startedAt!).toISOString()
      ).run()
    } catch (error) {
      console.error('Failed to save completion to DB:', error)
    }
    
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
    
    // Update database
    try {
      await this.env.my_db.prepare(
        'UPDATE rooms SET status = ?, started_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind('active', this.roomState.roomId).run()
    } catch (error) {
      console.error('Failed to update room status in DB:', error)
    }
    
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
    
    // Update database
    try {
      await this.env.my_db.prepare(
        'UPDATE rooms SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind('completed', this.roomState.roomId).run()
    } catch (error) {
      console.error('Failed to update room completion in DB:', error)
    }
    
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
    
    // Update database
    try {
      await this.env.my_db.prepare(
        'UPDATE rooms SET status = ?, started_at = NULL, completed_at = NULL WHERE id = ?'
      ).bind('waiting', this.roomState.roomId).run()
      
      // Reset participants in DB
      await this.env.my_db.prepare(
        'UPDATE room_participants SET progress = 0, current_wpm = 0, wpm = 0, accuracy = 0, completed = FALSE, finished_at = NULL WHERE room_id = ?'
      ).bind(this.roomState.roomId).run()
    } catch (error) {
      console.error('Failed to restart game in DB:', error)
    }
    
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
      currentWpm: p.currentWpm,
      accuracy: p.accuracy
    })))
    
    // Simply use the live progress values (currentWpm and accuracy)
    return participants
      .map(p => ({
        id: p.id,
        name: p.name,
        wpm: p.currentWpm || 0,
        accuracy: p.accuracy || 0
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
