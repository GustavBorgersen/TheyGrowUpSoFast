'use client'

import Link from 'next/link'

type Props = {
  isLoggedIn: boolean
  children: React.ReactNode
  message?: string
}

export function AuthGate({ isLoggedIn, children, message = 'Sign in to unlock' }: Props) {
  if (isLoggedIn) return <>{children}</>

  return (
    <div className="relative">
      <div className="pointer-events-none opacity-40 select-none">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <Link
          href="/login"
          className="rounded-lg bg-zinc-800/90 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition backdrop-blur-sm"
        >
          {message}
        </Link>
      </div>
    </div>
  )
}
