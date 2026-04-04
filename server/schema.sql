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

-- Users table: stores user information and stats
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL,
    room_id TEXT,
    wpm INTEGER DEFAULT 0, -- words per minute
    accuracy REAL DEFAULT 0.0, -- accuracy percentage
    games_played INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
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

-- Typing sessions: detailed metrics for each typing attempt
CREATE TABLE IF NOT EXISTS typing_sessions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    room_id TEXT NOT NULL,
    participant_id TEXT NOT NULL,
    total_keystrokes INTEGER DEFAULT 0,
    correct_keystrokes INTEGER DEFAULT 0,
    errors INTEGER DEFAULT 0,
    wpm INTEGER DEFAULT 0,
    accuracy REAL DEFAULT 0.0,
    duration INTEGER, -- actual time taken in seconds
    started_at DATETIME,
    completed_at DATETIME,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES room_participants(id) ON DELETE CASCADE
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_words_difficulty ON words(difficulty);
CREATE INDEX IF NOT EXISTS idx_words_length ON words(length);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_users_room ON users(room_id);
CREATE INDEX IF NOT EXISTS idx_room_participants_room ON room_participants(room_id);
CREATE INDEX IF NOT EXISTS idx_typing_sessions_room ON typing_sessions(room_id);

-- Insert some sample words for testing
INSERT INTO words (word, difficulty, length) VALUES
    ('the', 1, 3),
    ('quick', 1, 5),
    ('brown', 1, 5),
    ('fox', 1, 3),
    ('jumps', 1, 5),
    ('over', 1, 4),
    ('lazy', 1, 4),
    ('dog', 1, 3),
    ('typing', 2, 6),
    ('speed', 2, 5),
    ('accuracy', 2, 8),
    ('challenge', 2, 9),
    ('keyboard', 2, 8),
    ('practice', 2, 8),
    ('performance', 3, 11),
    ('exceptional', 3, 11),
    ('magnificent', 3, 11),
    ('extraordinary', 3, 13),
    ('sophisticated', 3, 13),
    ('instantaneous', 3, 13);
