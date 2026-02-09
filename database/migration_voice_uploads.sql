-- Migration: Add voice_uploads table and RLS policies
-- This table tracks audio file uploads to Supabase Storage

CREATE TABLE IF NOT EXISTS voice_uploads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES interview_sessions(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    public_url TEXT NOT NULL,
    file_size_bytes INTEGER,
    mime_type TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE voice_uploads ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can insert their own voice uploads
-- Note: We need to link through session to user
CREATE POLICY "Users can insert voice uploads for their sessions"
ON voice_uploads
FOR INSERT
WITH CHECK (
    session_id IN (
        SELECT id FROM interview_sessions WHERE user_id = auth.uid()
    )
);

-- RLS Policy: Users can view their own voice uploads
CREATE POLICY "Users can view their own voice uploads"
ON voice_uploads
FOR SELECT
USING (
    session_id IN (
        SELECT id FROM interview_sessions WHERE user_id = auth.uid()
    )
);

-- RLS Policy: Users can update their own voice uploads
CREATE POLICY "Users can update their own voice uploads"
ON voice_uploads
FOR UPDATE
USING (
    session_id IN (
        SELECT id FROM interview_sessions WHERE user_id = auth.uid()
    )
);

-- RLS Policy: Users can delete their own voice uploads
CREATE POLICY "Users can delete their own voice uploads"
ON voice_uploads
FOR DELETE
USING (
    session_id IN (
        SELECT id FROM interview_sessions WHERE user_id = auth.uid()
    )
);
