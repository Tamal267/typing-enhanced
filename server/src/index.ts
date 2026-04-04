import { Hono } from 'hono'
import { cors } from 'hono/cors'

// Export Durable Object
export { RoomDurableObject } from './room-durable-object'

const app = new Hono<{ Bindings: Env }>()

function getRoomDoStub(env: Env, roomCode: string) {
  const doId = env.ROOM_DO.idFromName(roomCode.toUpperCase())
  return env.ROOM_DO.get(doId)
}

// Enable CORS for frontend
app.use('/*', cors())

app.get('/', (c) => {
  return c.json({ message: 'Typing Enhanced API', version: '1.0.0' })
})

// Get random words endpoint
app.get('/api/words/random', async (c) => {
  const limit = c.req.query('limit') || '100'
  const difficulty = c.req.query('difficulty') // optional: 1, 2, or 3
  
  try {
    let query = 'SELECT id, word, difficulty, length FROM words'
    const params: any[] = []
    
    // Filter by difficulty if provided
    if (difficulty) {
      query += ' WHERE difficulty = ?'
      params.push(parseInt(difficulty))
    }
    
    query += ` ORDER BY RANDOM() LIMIT ${parseInt(limit)}`
    
    const { results } = await c.env.my_db.prepare(query).bind(...params).all()
    
    return c.json({
      success: true,
      count: results?.length || 0,
      words: results
    })
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch words'
    }, 500)
  }
})

// Get all words (with pagination)
app.get('/api/words', async (c) => {
  const page = parseInt(c.req.query('page') || '1')
  const limit = parseInt(c.req.query('limit') || '50')
  const offset = (page - 1) * limit
  
  try {
    const { results } = await c.env.my_db.prepare(
      'SELECT id, word, difficulty, length FROM words ORDER BY word LIMIT ? OFFSET ?'
    ).bind(limit, offset).all()
    
    const { results: countResult } = await c.env.my_db.prepare(
      'SELECT COUNT(*) as total FROM words'
    ).all()
    
    const total = (countResult?.[0] as any)?.total || 0
    
    return c.json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      words: results
    })
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch words'
    }, 500)
  }
})

// Create room endpoint
app.post('/api/rooms/create', async (c) => {
  try {
    const body = await c.req.json()
    const timeLimit = body.timeLimit || 60
    const difficulty = body.difficulty || null
    const scheduledStartTime = body.scheduledStartTime || null
    const maxParticipants = body.maxParticipants || 10
    
    // Generate unique room code
    const roomCode = generateRoomCode()
    const roomId = roomCode
    
    // Fetch random words for the room (filtered by difficulty if specified)
    const wordLimit = Math.ceil(timeLimit * 3)
    let query = 'SELECT word FROM words'
    const params: any[] = []
    
    if (difficulty) {
      query += ' WHERE difficulty = ?'
      params.push(difficulty)
    }
    query += ' ORDER BY RANDOM() LIMIT ?'
    params.push(wordLimit)
    
    const { results } = await c.env.my_db.prepare(query).bind(...params).all()
    
    const words = results?.map((r: any) => r.word) || []
    // Initialize Durable Object
    const doStub = getRoomDoStub(c.env, roomCode)
    
    await doStub.fetch('http://do/initialize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId,
        roomCode,
        timeLimit,
        wordSet: words,
        scheduledStartTime: scheduledStartTime ? new Date(scheduledStartTime).getTime() : null
      })
    })
    
    return c.json({
      success: true,
      room: {
        id: roomId,
        roomCode,
        timeLimit,
        status: 'waiting',
        scheduledStartTime,
        maxParticipants,
        wordCount: words.length
      }
    })
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create room'
    }, 500)
  }
})

// Get room details
app.get('/api/rooms/:code', async (c) => {
  try {
    const roomCode = c.req.param('code').toUpperCase()
    const doStub = getRoomDoStub(c.env, roomCode)
    const stateResponse = await doStub.fetch('http://do/state')
    const stateData = await stateResponse.json() as any

    if (!stateData?.success || !stateData?.roomState) {
      return c.json({
        success: false,
        error: 'Room not found'
      }, 404)
    }

    const room = stateData.roomState as any
    const participantCount = Array.isArray(room.participants) ? room.participants.length : 0
    
    return c.json({
      success: true,
      room: {
        id: room.roomId,
        roomCode: room.roomCode,
        timeLimit: room.timeLimit,
        status: room.status,
        scheduledStartTime: room.scheduledStartTime ?? null,
        maxParticipants: 10,
        participantCount,
        wordSet: room.wordSet || [],
        createdAt: null
      }
    })
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch room'
    }, 500)
  }
})

// WebSocket connection endpoint
app.get('/api/rooms/:code/ws', async (c) => {
  try {
    const roomCode = c.req.param('code').toUpperCase()
    
    // Check for WebSocket upgrade
    const upgradeHeader = c.req.header('Upgrade')
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return c.json({ error: 'Expected WebSocket connection' }, 426)
    }
    
    // Get Durable Object and proxy WebSocket connection
    const doStub = getRoomDoStub(c.env, roomCode)

    // Ensure room exists before upgrading WebSocket
    const stateResponse = await doStub.fetch('http://do/state')
    const stateData = await stateResponse.json() as any
    if (!stateData?.success || !stateData?.roomState) {
      return c.json({ error: 'Room not found' }, 404)
    }
    
    return doStub.fetch(c.req.raw)
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : 'Failed to connect to room'
    }, 500)
  }
})

// Get leaderboard for a room
app.get('/api/rooms/:code/leaderboard', async (c) => {
  try {
    const roomCode = c.req.param('code').toUpperCase()
    const doStub = getRoomDoStub(c.env, roomCode)
    const lbResponse = await doStub.fetch('http://do/leaderboard')
    const lbData = await lbResponse.json() as any

    if (!lbData?.success) {
      return c.json({ error: 'Room not found' }, 404)
    }
    
    return c.json({
      success: true,
      leaderboard: lbData.leaderboard || []
    })
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch leaderboard'
    }, 500)
  }
})

// Helper function to generate room code
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Remove ambiguous chars
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

app.get('/api/create-room', async (c) => {
  return c.json({
    success: false,
    error: 'Deprecated endpoint. Use POST /api/rooms/create.'
  }, 410)
})

app.post('/api/add-user', async (c) => {
  return c.json({
    success: false,
    error: 'Deprecated endpoint. Users are managed in room WebSocket sessions.'
  }, 410)
})

export default app
