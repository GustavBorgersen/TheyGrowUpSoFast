-- TheyGrowUpSoFast — Supabase Schema

CREATE TABLE projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  settings JSONB DEFAULT '{"maxProfileScore": 0.4}'::jsonb,
  reference_descriptor FLOAT8[],
  reference_photo_path TEXT
);

CREATE TABLE project_photos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  -- Source metadata (designed for multiple providers)
  source TEXT NOT NULL,          -- 'google_photos' | 'local'
  source_id TEXT,                -- provider's photo ID (NULL for local uploads)
  source_meta JSONB,             -- any extra provider-specific fields
  -- Source-agnostic storage (paths use our UUID, never the provider ID)
  thumbnail_path TEXT,           -- thumbnails/{uid}/{pid}/{id}.jpg (~10KB)
  aligned_frame_path TEXT,       -- frames/{uid}/{pid}/{id}.jpg (~200KB)
  create_time TIMESTAMPTZ,       -- photo's original date, used for ordering
  order_index INTEGER NOT NULL,
  skipped BOOLEAN DEFAULT FALSE,
  skip_reason TEXT,              -- 'identity_mismatch' | 'no_face'
  profile_score FLOAT8,
  descriptor FLOAT8[]
);

-- Row Level Security
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_projects" ON projects
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_project_photos" ON project_photos
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

-- Storage bucket: media (private)
-- Run in Supabase dashboard > Storage > New bucket: "media", private
-- Storage RLS policies (run after creating the bucket):
--
-- INSERT policy for thumbnails:
-- ((bucket_id = 'media') AND (storage.foldername(name))[1] = 'thumbnails' AND (storage.foldername(name))[2] = auth.uid()::text)
--
-- INSERT policy for frames:
-- ((bucket_id = 'media') AND (storage.foldername(name))[1] = 'frames' AND (storage.foldername(name))[2] = auth.uid()::text)
--
-- SELECT policy (signed URLs handle auth, but add for direct access):
-- ((bucket_id = 'media') AND (storage.foldername(name))[2] = auth.uid()::text)
