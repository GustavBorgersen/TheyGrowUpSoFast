-- Migration: Add reference descriptor to projects and per-photo metadata
-- Run this in Supabase SQL Editor if you already have the tables created

-- Projects: store the anchor face descriptor
ALTER TABLE projects ADD COLUMN IF NOT EXISTS reference_descriptor FLOAT8[];

-- Project photos: store per-photo face detection metadata
ALTER TABLE project_photos ADD COLUMN IF NOT EXISTS profile_score FLOAT8;
ALTER TABLE project_photos ADD COLUMN IF NOT EXISTS descriptor FLOAT8[];
