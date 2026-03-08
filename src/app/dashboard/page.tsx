import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Project } from '@/types'
import { NewProjectButton } from './NewProjectButton'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <main className="min-h-screen bg-zinc-950 text-white px-4 py-12">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">← Home</Link>
            <h1 className="mt-1 text-2xl font-bold">My Projects</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:block text-sm text-zinc-500">{user.email}</span>
            <form action="/auth/signout" method="post">
              <button className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 min-h-[44px]">
                Sign out
              </button>
            </form>
          </div>
        </header>

        <NewProjectButton />

        {projects && projects.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project: Project) => (
              <Link
                key={project.id}
                href={`/project/${project.id}`}
                className="group rounded-xl border border-zinc-800 bg-zinc-900 p-5 hover:border-zinc-600 transition"
              >
                <h2 className="font-semibold text-zinc-100 group-hover:text-white truncate">{project.name}</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {new Date(project.created_at).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric'
                  })}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-800 text-zinc-500">
            <p className="text-sm">No projects yet</p>
            <p className="text-xs text-zinc-600">Create one above to get started</p>
          </div>
        )}
      </div>
    </main>
  )
}
