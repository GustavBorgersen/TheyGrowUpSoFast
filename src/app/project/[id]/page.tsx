import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import type { Project } from '@/types'
import { ProjectClient } from './ProjectClient'

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  if (!project) notFound()

  const { data: photos } = await supabase
    .from('project_photos')
    .select('*')
    .eq('project_id', id)
    .order('create_time', { ascending: true })

  return (
    <ProjectClient
      project={project as Project}
      initialPhotos={photos ?? []}
      userId={user.id}
    />
  )
}
