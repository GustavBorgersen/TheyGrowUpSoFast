'use client'

import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode; fallback?: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div className="rounded-xl border border-red-800 bg-red-950/30 px-4 py-4 text-sm text-red-300 space-y-2">
          <p className="font-medium">Something went wrong</p>
          <p className="text-red-400 font-mono text-xs">{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="text-xs underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
