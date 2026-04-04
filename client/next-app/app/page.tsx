import { TypingTest } from '@/components/typing-test'
import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="py-6 md:py-10 w-full space-y-8">
      <div className="text-center space-y-4 mb-8">
        <h1 className="text-4xl font-bold">Typing Enhanced</h1>
        <p className="text-muted-foreground">Improve your typing speed and accuracy</p>
        
        <div className="flex gap-4 justify-center pt-4">
          <Link
            href="/room/create"
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            Create Room
          </Link>
          <Link
            href="/room/join"
            className="px-6 py-3 border rounded-lg font-medium hover:bg-accent transition-colors"
          >
            Join Room
          </Link>
        </div>
      </div>
      
      <div className="border-t pt-8">
        <h2 className="text-2xl font-semibold text-center mb-6">Practice Mode</h2>
        <TypingTest />
      </div>
    </div>
  )
}
