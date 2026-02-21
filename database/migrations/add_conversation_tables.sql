-- Create conversation_turns table
CREATE TABLE IF NOT EXISTS conversation_turns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES interview_sessions(id) ON DELETE CASCADE,
  speaker TEXT NOT NULL CHECK (speaker IN ('ai', 'user')),
  message_text TEXT NOT NULL,
  audio_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add conversation-related columns to interview_sessions
ALTER TABLE interview_sessions
ADD COLUMN IF NOT EXISTS conversation_phase BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS conversation_context JSONB,
ADD COLUMN IF NOT EXISTS user_intro_summary TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_conversation_turns_session_id ON conversation_turns(session_id);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_conversation_phase ON interview_sessions(conversation_phase);

-- Add comments for documentation
COMMENT ON TABLE conversation_turns IS 'Stores AI-user conversation during interview introduction phase';
COMMENT ON COLUMN interview_sessions.conversation_phase IS 'Whether the session is in conversation phase (true) or technical questions phase (false)';
COMMENT ON COLUMN interview_sessions.conversation_context IS 'JSON object containing analyzed user introduction data';
COMMENT ON COLUMN interview_sessions.user_intro_summary IS 'Text summary of user introduction';
