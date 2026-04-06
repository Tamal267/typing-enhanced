-- Schema for typing-enhanced D1 database

-- Words table: stores words for typing tests
CREATE TABLE IF NOT EXISTS words (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    word TEXT NOT NULL,
    difficulty INTEGER DEFAULT 1, -- 1=easy, 2=medium, 3=hard
    length INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Rooms table: multiplayer typing rooms
CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT,
    room_code TEXT UNIQUE NOT NULL, -- short code for joining (e.g., "ABC123")
    time INTEGER NOT NULL, -- time limit in seconds
    status TEXT DEFAULT 'waiting', -- waiting, active, completed
    scheduled_start_time DATETIME, -- optional scheduled start time
    max_participants INTEGER DEFAULT 10, -- max number of participants
    word_set TEXT, -- JSON array of words for this session
    created_by TEXT, -- creator's participant ID
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    completed_at DATETIME
);

-- Room participants: track which users are in which rooms
CREATE TABLE IF NOT EXISTS room_participants (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    room_id TEXT NOT NULL,
    user_name TEXT NOT NULL, -- participant display name
    wpm INTEGER DEFAULT 0,
    accuracy REAL DEFAULT 0.0,
    progress INTEGER DEFAULT 0, -- current word index or progress percentage
    current_wpm INTEGER DEFAULT 0, -- real-time WPM during typing
    completed BOOLEAN DEFAULT FALSE,
    finished_at DATETIME, -- when they completed typing
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_words_difficulty ON words(difficulty);
CREATE INDEX IF NOT EXISTS idx_words_length ON words(length);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_room_participants_room ON room_participants(room_id);