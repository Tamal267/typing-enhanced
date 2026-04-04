'use client'

import { useState, useEffect, useMemo } from 'react'
import { useWebSocket } from '@/hooks/use-websocket'
import { NameEntryModal } from './name-entry-modal'
import { WaitingLobby } from './waiting-lobby'
import { MultiplayerTyping } from './multiplayer-typing'
import { Leaderboard } from './leaderboard'

interface MultiplayerRoomProps {
  roomCode: string
}

export function MultiplayerRoom({ roomCode }: MultiplayerRoomProps) {
  const [userName, setUserName] = useState<string | null>(null)
  const [fixedWordSet, setFixedWordSet] = useState<string[]>([])

  const {
    isConnected,
    roomState,
    participantId,
    leaderboard,
    error: wsError,
    sendProgress,
    sendComplete,
    startGame,
    restartGame
  } = useWebSocket(roomCode, userName)

  // Fix the word list when game starts
  useEffect(() => {
    if (roomState?.status === 'active' && roomState.wordSet && fixedWordSet.length === 0) {
      setFixedWordSet([...roomState.wordSet])
    }
    // Reset word list when game restarts (goes back to waiting)
    if (roomState?.status === 'waiting') {
      setFixedWordSet([])
    }
  }, [roomState?.status, roomState?.wordSet])

  const isHost = roomState?.participants[0]?.id === participantId

  if (!userName) {
    return <NameEntryModal onSubmit={setUserName} roomCode={roomCode} />
  }

  if (!isConnected || !roomState) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="text-lg">Connecting to room...</div>
          {wsError && <div className="text-destructive text-sm mt-2">{wsError}</div>}
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4">
      {roomState.status === 'waiting' && (
        <WaitingLobby
          roomCode={roomCode}
          roomState={roomState}
          participantId={participantId}
          onStartGame={startGame}
        />
      )}

      {roomState.status === 'active' && (
        <MultiplayerTyping
          roomState={{ ...roomState, wordSet: fixedWordSet.length > 0 ? fixedWordSet : roomState.wordSet }}
          participantId={participantId}
          onProgress={sendProgress}
          onComplete={sendComplete}
        />
      )}

      {roomState.status === 'completed' && (
        <Leaderboard
          leaderboard={leaderboard}
          roomCode={roomCode}
          participantId={participantId}
          isHost={isHost}
          onRestart={restartGame}
        />
      )}
    </div>
  )
}
