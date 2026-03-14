import { createClient } from '@/lib/supabase/server'
import { CreateClient } from './create/CreateClient'

export default async function HomePage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project: projectParam } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const userInfo = user ? { id: user.id, email: user.email ?? undefined } : null

  // If ?project= is set and user is logged in, validate ownership.
  // Actual loading happens client-side in ProjectPanel.
  let initialProjectId: string | null = null
  let initialProjectName: string | null = null

  if (projectParam && user) {
    const { data: project } = await supabase
      .from('projects')
      .select('id, name')
      .eq('id', projectParam)
      .single()

    if (project) {
      initialProjectId = project.id
      initialProjectName = project.name
    }
  }

  return (
    <CreateClient
      user={userInfo}
      initialProject={initialProjectId ? {
        projectId: initialProjectId,
        projectName: initialProjectName!,
        photos: [],
      } : undefined}
    />
  )
}
