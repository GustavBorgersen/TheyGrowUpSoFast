import { createClient } from '@/lib/supabase/server'
import { CreateClient } from './CreateClient'

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project: projectParam } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const userInfo = user ? { id: user.id, email: user.email ?? undefined } : null

  // If ?project= is set and user is logged in, we pass the project ID.
  // The actual loading happens client-side in ProjectPanel to avoid
  // serializing blobs from server to client.
  // We just validate ownership here.
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
        photos: [], // loaded client-side
      } : undefined}
    />
  )
}
