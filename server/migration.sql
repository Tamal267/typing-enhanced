-- Migration to update schema for multiplayer rooms

-- Add new columns to rooms table
ALTER TABLE rooms ADD COLUMN room_code TEXT;
ALTER TABLE rooms ADD COLUMN scheduled_start_time DATETIME;
ALTER TABLE rooms ADD COLUMN max_participants INTEGER DEFAULT 10;
ALTER TABLE rooms ADD COLUMN word_set TEXT;
ALTER TABLE rooms ADD COLUMN created_by TEXT;

-- Add new columns to room_participants table
ALTER TABLE room_participants ADD COLUMN user_name TEXT;
ALTER TABLE room_participants ADD COLUMN progress INTEGER DEFAULT 0;
ALTER TABLE room_participants ADD COLUMN current_wpm INTEGER DEFAULT 0;
ALTER TABLE room_participants ADD COLUMN finished_at DATETIME;

-- Create typing_sessions table
CREATE TABLE IF NOT EXISTS typing_sessions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    room_id TEXT NOT NULL,
    participant_id TEXT NOT NULL,
    total_keystrokes INTEGER DEFAULT 0,
    correct_keystrokes INTEGER DEFAULT 0,
    errors INTEGER DEFAULT 0,
    wpm INTEGER DEFAULT 0,
    accuracy REAL DEFAULT 0.0,
    duration INTEGER,
    started_at DATETIME,
    completed_at DATETIME,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES room_participants(id) ON DELETE CASCADE
);

-- Create new indexes
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_typing_sessions_room ON typing_sessions(room_id);
