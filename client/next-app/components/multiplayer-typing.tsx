'use client'

import { useState, useEffect, useRef } from 'react'
import { RoomState } from '@/hooks/use-websocket'

interface MultiplayerTypingProps {
  roomState: RoomState
  participantId: string | null
  onProgress: (progress: number, currentWpm: number, accuracy: number) => void
  onComplete: (wpm: number, accuracy: number, stats: any) => void
}

const WORDS_PER_PAGE = 30

export function MultiplayerTyping({ roomState, participantId, onProgress, onComplete }: MultiplayerTypingProps) {
  const [currentWordIndex, setCurrentWordIndex] = useState(0)
  const [input, setInput] = useState('')
  const [startTime, setStartTime] = useState<number | null>(null)
  const [correctChars, setCorrectChars] = useState(0)
  const [totalChars, setTotalChars] = useState(0)
  const [errors, setErrors] = useState(0)
  const [isFinished, setIsFinished] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(roomState.timeLimit)
  const [wordResults, setWordResults] = useState<('correct' | 'incorrect')[]>([])
  const [currentPage, setCurrentPage] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const progressIntervalRef = useRef<any>(null)

  const words = roomState.wordSet || []
  const currentWord = words[currentWordIndex]
  
  const pageStart = currentPage * WORDS_PER_PAGE
  const pageEnd = pageStart + WORDS_PER_PAGE
  const currentPageWords = words.slice(pageStart, pageEnd)

  const calculateWPM = () => {
    if (!startTime) return 0
    const minutes = (Date.now() - startTime) / 60000
    return minutes > 0 ? Math.round(correctChars / 5 / minutes) : 0
  }

  const calculateAccuracy = () => {
    // If no words were attempted, accuracy should be 0
    if (currentWordIndex === 0 && totalChars === 0) return 0
    return totalChars > 0 ? Math.round((correctChars / totalChars) * 100) : 0
  }

  const handleTimeUp = () => {
    if (isFinished) return
    setIsFinished(true)
    
    const wpm = calculateWPM()
    const accuracy = calculateAccuracy()
    
    onComplete(wpm, accuracy, {
      totalKeystrokes: totalChars,
      correctKeystrokes: correctChars,
      errors,
      duration: roomState.timeLimit
    })
  }

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!roomState.startedAt) return



    const interval = setInterval(() => {
      const elapsed = Date.now() - roomState.startedAt!
      const remaining = Math.max(0, roomState.timeLimit - Math.floor(elapsed / 1000))
      setTimeRemaining(remaining)

      if (remaining === 0) {
        handleTimeUp()
      }
    }, 100)

    return () => clearInterval(interval)
  }, [roomState.startedAt, roomState.timeLimit])

  useEffect(() => {
    if (!startTime || isFinished) return

    progressIntervalRef.current = setInterval(() => {
      const progress = Math.round((currentWordIndex / words.length) * 100)
      const wpm = calculateWPM()
      const accuracy = calculateAccuracy()
      onProgress(progress, wpm, accuracy)
    }, 1000)

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
      }
    }
  }, [startTime, currentWordIndex, correctChars, totalChars, isFinished])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isFinished) return

    const value = e.target.value
    setInput(value)

    if (!startTime) {
      setStartTime(Date.now())
    }

    if (value.endsWith(' ')) {
      const typedWord = value.trim()
      const isCorrect = typedWord === currentWord
      
      setWordResults(prev => [...prev, isCorrect ? 'correct' : 'incorrect'])
      
      if (isCorrect) {
        setCorrectChars(prev => prev + currentWord.length + 1)
      } else {
        setErrors(prev => prev + 1)
      }
      setTotalChars(prev => prev + typedWord.length + 1)

      setInput('')
      
      if (currentWordIndex < words.length - 1) {
        const nextIndex = currentWordIndex + 1
        setCurrentWordIndex(nextIndex)
        
        // Move to next page if needed
        if (nextIndex >= pageEnd) {
          setCurrentPage(prev => prev + 1)
        }
      } else {
        setIsFinished(true)
        const wpm = calculateWPM()
        const accuracy = calculateAccuracy()
        
        onComplete(wpm, accuracy, {
          totalKeystrokes: totalChars + typedWord.length + 1,
          correctKeystrokes: correctChars + (isCorrect ? currentWord.length + 1 : 0),
          errors: errors + (isCorrect ? 0 : 1),
          duration: Math.floor((Date.now() - startTime!) / 1000)
        })
      }
    }
  }

  const getWordClassName = (globalIndex: number) => {
    const result = wordResults[globalIndex]
    
    if (result === 'correct') {
      return 'text-green-500'
    } else if (result === 'incorrect') {
      return 'text-red-500 line-through'
    } else if (globalIndex === currentWordIndex) {
      return 'text-primary font-semibold underline underline-offset-4'
    } else {
      return 'text-muted-foreground'
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Timer and Stats */}
      <div className="flex items-center justify-between border-b pb-4">
        <div className="text-4xl font-bold tabular-nums">
          {timeRemaining}s
        </div>
        <div className="flex gap-6 text-sm">
          <div>
            <div className="text-muted-foreground">WPM</div>
            <div className="text-2xl font-semibold">{calculateWPM()}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Accuracy</div>
            <div className="text-2xl font-semibold">{calculateAccuracy()}%</div>
          </div>
        </div>
      </div>

      {/* Word Display */}
      <div className="border rounded-lg p-8 bg-muted/30 min-h-[200px]">
        <div className="text-2xl leading-relaxed flex flex-wrap gap-2">
          {currentPageWords.map((word, idx) => {
            const globalIndex = pageStart + idx
            return (
              <span key={globalIndex} className={getWordClassName(globalIndex)}>
                {word}
              </span>
            )
          })}
        </div>
        <div className="text-sm text-muted-foreground mt-4 text-right">
          Page {currentPage + 1} • Word {currentWordIndex + 1}/{words.length}
        </div>
      </div>

      {/* Input */}
      <div className="space-y-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={handleInputChange}
          disabled={isFinished}
          className="w-full px-6 py-4 text-2xl border-2 rounded-lg focus:outline-none focus:border-primary disabled:opacity-50"
          placeholder={isFinished ? 'Finished!' : 'Type here...'}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
        />
        <div className="text-sm text-muted-foreground text-center">
          Press space after each word
        </div>
      </div>

      {/* Participants List */}
      <div className="border rounded-lg p-4">
        <h3 className="font-semibold mb-3">Live Progress</h3>
        <div className="space-y-2">
          {roomState.participants.map((participant) => (
            <div key={participant.id} className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-medium ${participant.id === participantId ? 'text-primary' : ''}`}>
                    {participant.name}
                    {participant.id === participantId && ' (You)'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {participant.currentWpm} WPM • {participant.accuracy}%
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      participant.completed ? 'bg-green-500' : 'bg-primary'
                    }`}
                    style={{ width: `${participant.progress}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
