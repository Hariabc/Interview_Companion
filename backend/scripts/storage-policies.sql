-- Storage Policies for voice-answers bucket
-- Run this in Supabase SQL Editor: https://app.supabase.com/project/dvhzdidbjmdayeebyutj/sql/new

-- Policy 1: Allow authenticated users to upload audio files
CREATE POLICY "Authenticated users can upload audio"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'voice-answers');

-- Policy 2: Allow public read access to audio files (for public URLs)
CREATE POLICY "Public can read audio files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'voice-answers');

-- Policy 3: Allow authenticated users to update their uploads (for upsert)
CREATE POLICY "Authenticated users can update audio"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'voice-answers')
WITH CHECK (bucket_id = 'voice-answers');

-- Policy 4: Allow authenticated users to delete their uploads (optional, for cleanup)
CREATE POLICY "Authenticated users can delete audio"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'voice-answers');
