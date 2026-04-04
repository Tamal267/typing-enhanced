import { Geist, Geist_Mono } from "next/font/google"
import Link from "next/link"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { ThemeToggle } from "@/components/theme-toggle"
import { RoomDropdown } from "@/components/room-dropdown"
import { cn } from "@/lib/utils"

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata = {
  title: 'Typing Enhanced',
  description: 'Improve your typing speed with real-time practice',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", geist.variable)}
    >
      <body className="min-h-screen bg-background">
        <ThemeProvider>
          <div className="flex min-h-screen flex-col">
            {/* Header */}
            <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="container mx-auto flex h-14 max-w-screen-2xl items-center px-4">
                <div className="mr-4 flex">
                  <Link href="/" className="mr-6 flex items-center space-x-2">
                    <span className="font-bold text-xl">⌨️ Typing Enhanced</span>
                  </Link>
                  <nav className="flex items-center space-x-6 text-sm font-medium">
                    <Link href="/" className="transition-colors hover:text-foreground/80">
                      Practice
                    </Link>
                    <RoomDropdown />
                  </nav>
                </div>
                <div className="flex flex-1 items-center justify-end space-x-2">
                  <ThemeToggle />
                </div>
              </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 container mx-auto max-w-screen-xl px-4">
              {children}
            </main>

            {/* Footer */}
            <footer className="border-t py-6 md:py-0">
              <div className="container mx-auto max-w-screen-2xl flex flex-col items-center justify-between gap-4 px-4 md:h-14 md:flex-row">
                <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
                  © {new Date().getFullYear()} whiteEalge. Built for typing practice.
                </p>
              </div>
            </footer>
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}

