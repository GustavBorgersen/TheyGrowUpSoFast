-- Run in Supabase SQL Editor
ALTER TABLE projects ADD COLUMN IF NOT EXISTS reference_photo_path TEXT;

-- Also add storage INSERT policy for the 'references' folder in the 'media' bucket.
-- Add this via Supabase Dashboard > Storage > Policies:
--   Bucket: media, Operation: INSERT
--   Policy expression:
--     (bucket_id = 'media')
--     AND (storage.foldername(name))[1] = 'references'
--     AND (storage.foldername(name))[2] = auth.uid()::text
