import { Hono } from 'hono'
import { cors } from 'hono/cors'

// Export Durable Object
export { RoomDurableObject } from './room-durable-object'

const app = new Hono<{ Bindings: Env }>()

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
    const roomId = crypto.randomUUID()
    
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
    const wordSet = JSON.stringify(words)
    
    // Insert room into database
    await c.env.my_db.prepare(
      'INSERT INTO rooms (id, room_code, time, status, scheduled_start_time, max_participants, word_set) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(roomId, roomCode, timeLimit, 'waiting', scheduledStartTime, maxParticipants, wordSet).run()
    
    // Initialize Durable Object
    const doId = c.env.ROOM_DO.idFromName(roomId)
    const doStub = c.env.ROOM_DO.get(doId)
    
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
    
    const { results } = await c.env.my_db.prepare(
      'SELECT id, room_code, time, status, scheduled_start_time, max_participants, word_set, created_at FROM rooms WHERE room_code = ?'
    ).bind(roomCode).all()
    
    if (!results || results.length === 0) {
      return c.json({
        success: false,
        error: 'Room not found'
      }, 404)
    }
    
    const room = results[0] as any
    
    // Get participant count
    const { results: participantResults } = await c.env.my_db.prepare(
      'SELECT COUNT(*) as count FROM room_participants WHERE room_id = ?'
    ).bind(room.id).all()
    
    const participantCount = (participantResults?.[0] as any)?.count || 0
    
    return c.json({
      success: true,
      room: {
        id: room.id,
        roomCode: room.room_code,
        timeLimit: room.time,
        status: room.status,
        scheduledStartTime: room.scheduled_start_time,
        maxParticipants: room.max_participants,
        participantCount,
        wordSet: JSON.parse(room.word_set || '[]'),
        createdAt: room.created_at
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
    
    // Get room ID from code
    const { results } = await c.env.my_db.prepare(
      'SELECT id FROM rooms WHERE room_code = ?'
    ).bind(roomCode).all()
    
    if (!results || results.length === 0) {
      return c.json({ error: 'Room not found' }, 404)
    }
    
    const roomId = (results[0] as any).id
    
    // Get Durable Object and proxy WebSocket connection
    const doId = c.env.ROOM_DO.idFromName(roomId)
    const doStub = c.env.ROOM_DO.get(doId)
    
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
    
    const { results: roomResults } = await c.env.my_db.prepare(
      'SELECT id FROM rooms WHERE room_code = ?'
    ).bind(roomCode).all()
    
    if (!roomResults || roomResults.length === 0) {
      return c.json({ error: 'Room not found' }, 404)
    }
    
    const roomId = (roomResults[0] as any).id
    
    // Get participants with their stats
    const { results } = await c.env.my_db.prepare(
      'SELECT user_name, wpm, accuracy, completed, finished_at FROM room_participants WHERE room_id = ? ORDER BY completed DESC, wpm DESC, accuracy DESC, finished_at ASC'
    ).bind(roomId).all()
    
    const leaderboard = (results || []).map((p: any, index: number) => ({
      rank: index + 1,
      name: p.user_name,
      wpm: p.wpm,
      accuracy: p.accuracy
    }))
    
    return c.json({
      success: true,
      leaderboard
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
  try {
    const roomId = crypto.randomUUID()
    // random room name of 5 characters
    const roomName = Math.random().toString(36).substring(2, 7).toUpperCase()
    const time = parseInt(c.req.query('time') || '60') // default 60 seconds
    
    const query = 'INSERT INTO rooms (id, name, time, status) VALUES (?, ?, ?, ?)'
    const params = [roomId, roomName, time, 'waiting']
    
    await c.env.my_db.prepare(query).bind(...params).run()
    
    return c.json({
      success: true,
      room: {
        id: roomId,
        name: roomName,
        time: time,
        status: 'waiting'
      }
    })
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create room'
    }, 500)
  }
})

app.post('/api/add-user', async (c) => {
  try {
    const { roomId, username, wpm, accuracy } = await c.req.json()
    const userId = crypto.randomUUID()
    
    const query = 'INSERT INTO users (id, room_id, username, wpm, accuracy) VALUES (?, ?, ?, ?, ?)'
    const params = [userId, roomId, username, wpm, accuracy]
    
    await c.env.my_db.prepare(query).bind(...params).run()
    
    return c.json({
      success: true,
      user: {
        id: userId,
        roomId,
        username,
        wpm,
        accuracy
      }
    })
  } catch (error) {
    return c.json({
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to add user'
    }, 500)
  }
})

export default app
