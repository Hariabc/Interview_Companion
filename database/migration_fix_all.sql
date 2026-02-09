-- Fix 1: Add missing confidence_score and fluency_score columns to confidence_metrics
ALTER TABLE confidence_metrics 
ADD COLUMN IF NOT EXISTS fluency_score NUMERIC(4, 2),
ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(4, 2);

-- Fix 2: Create voice_uploads table if it doesn't exist
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

-- Fix 3: Enable RLS on voice_uploads
ALTER TABLE voice_uploads ENABLE ROW LEVEL SECURITY;

-- Fix 4: Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can insert voice uploads for their sessions" ON voice_uploads;
DROP POLICY IF EXISTS "Users can view their own voice uploads" ON voice_uploads;
DROP POLICY IF EXISTS "Users can update their own voice uploads" ON voice_uploads;
DROP POLICY IF EXISTS "Users can delete their own voice uploads" ON voice_uploads;

-- Fix 5: Create RLS policies for voice_uploads
-- IMPORTANT: These policies check if the session belongs to the authenticated user

CREATE POLICY "Users can insert voice uploads for their sessions"
ON voice_uploads
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM interview_sessions 
        WHERE interview_sessions.id = voice_uploads.session_id 
        AND interview_sessions.user_id = auth.uid()
    )
);

CREATE POLICY "Users can view their own voice uploads"
ON voice_uploads
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM interview_sessions 
        WHERE interview_sessions.id = voice_uploads.session_id 
        AND interview_sessions.user_id = auth.uid()
    )
);

CREATE POLICY "Users can update their own voice uploads"
ON voice_uploads
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM interview_sessions 
        WHERE interview_sessions.id = voice_uploads.session_id 
        AND interview_sessions.user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete their own voice uploads"
ON voice_uploads
FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM interview_sessions 
        WHERE interview_sessions.id = voice_uploads.session_id 
        AND interview_sessions.user_id = auth.uid()
    )
);
