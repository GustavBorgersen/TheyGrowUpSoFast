'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function NewProjectButton() {
  const [isOpen, setIsOpen] = useState(false)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function createProject(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data, error } = await supabase
      .from('projects')
      .insert({ name: name.trim(), user_id: user.id })
      .select('id')
      .single()

    if (error || !data) {
      setError(error?.message ?? 'Failed to create project')
      setLoading(false)
      return
    }

    router.push(`/project/${data.id}`)
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-500 transition min-h-[44px]"
      >
        + New project
      </button>
    )
  }

  return (
    <div className="space-y-2">
    {error && <p className="text-sm text-red-400">{error}</p>}
    <form onSubmit={createProject} className="flex gap-3">
      <input
        autoFocus
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Project name (e.g. 'Emma growing up')"
        className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none min-h-[44px]"
      />
      <button
        type="submit"
        disabled={loading || !name.trim()}
        className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition min-h-[44px]"
      >
        {loading ? '…' : 'Create'}
      </button>
      <button
        type="button"
        onClick={() => { setIsOpen(false); setName('') }}
        className="rounded-xl border border-zinc-700 px-5 py-3 text-sm text-zinc-400 hover:border-zinc-500 transition min-h-[44px]"
      >
        Cancel
      </button>
    </form>
    </div>
  )
}
