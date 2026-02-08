-- Run this in your Supabase SQL Editor to create the missing table

CREATE TABLE IF NOT EXISTS resume_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    resume_text TEXT, 
    parsed_skills JSONB, -- Extracted skills as JSON array
    file_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
