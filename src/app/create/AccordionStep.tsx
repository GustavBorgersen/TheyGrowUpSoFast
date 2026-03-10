'use client'

type Props = {
  title: string
  stepNumber: number
  expanded: boolean
  onToggle: () => void
  subtitle?: string
  children: React.ReactNode
}

export function AccordionStep({ title, stepNumber, expanded, onToggle, subtitle, children }: Props) {
  return (
    <div className={`rounded-xl border ${expanded ? 'border-zinc-700 bg-zinc-900/50' : 'border-zinc-800 bg-zinc-900/30'}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-5 py-4 text-left cursor-pointer"
      >
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${expanded ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
          {stepNumber}
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-zinc-200">{title}</span>
          {subtitle && !expanded && (
            <span className="ml-2 text-xs text-zinc-500">{subtitle}</span>
          )}
        </div>
        <svg
          className={`h-4 w-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''} text-zinc-500`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="px-5 pb-5">
          {children}
        </div>
      )}
    </div>
  )
}
