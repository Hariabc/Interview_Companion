-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- USERS TABLE (Syncs with Supabase Auth if needed, or standalone)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RESUME PROFILES
CREATE TABLE resume_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    resume_text TEXT, 
    parsed_skills JSONB, -- Extracted skills as JSON array
    file_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- QUESTIONS BANK
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES interview_sessions(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    topic TEXT NOT NULL, -- e.g., 'React', 'Node.js', 'Behavioral'
    difficulty_level INTEGER CHECK (difficulty_level BETWEEN 1 AND 5),
    ideal_answer_keywords JSONB, -- Keywords expected in the answer
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- INTERVIEW SESSIONS
CREATE TABLE interview_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    resume_profile_id UUID REFERENCES resume_profiles(id),
    start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    end_time TIMESTAMP WITH TIME ZONE,
    total_score NUMERIC(5, 2), -- 0.00 to 100.00
    status TEXT CHECK (status IN ('in_progress', 'completed', 'abandoned')) DEFAULT 'in_progress',
    difficulty_level INTEGER DEFAULT 1 -- Adaptive difficulty base
);

-- ANSWERS
CREATE TABLE answers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES interview_sessions(id) ON DELETE CASCADE,
    question_id UUID REFERENCES questions(id),
    audio_url TEXT, -- Path to stored audio in Supabase Storage
    transcript TEXT, -- Speech-to-text output
    answer_text TEXT, -- If typed answer
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI SCORES / EVALUATIONS
CREATE TABLE ai_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    answer_id UUID REFERENCES answers(id) ON DELETE CASCADE,
    semantic_score NUMERIC(5, 2), -- 0-100 based on vector similarity
    keyword_score NUMERIC(5, 2), -- 0-100 based on keyword coverage
    grammar_score NUMERIC(5, 2), -- 0-100 based on grammar errors
    final_score NUMERIC(5, 2), -- Composite weighted score
    feedback_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CONFIDENCE METRICS (Audio Analysis)
CREATE TABLE confidence_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    answer_id UUID REFERENCES answers(id) ON DELETE CASCADE,
    wpm NUMERIC(5, 2), -- Words per minute
    filler_word_count INTEGER,
    pause_duration NUMERIC(5, 2), -- Total pause duration in seconds
    pitch_variance NUMERIC(5, 2), -- Standard deviation of pitch
    volume_consistency NUMERIC(5, 2), -- Consistency score 0-1
    fluency_score NUMERIC(4, 2), -- 0-10 score
    confidence_score NUMERIC(4, 2), -- 0-10 score
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RESEARCH AND CONSENT LOGGING
CREATE TABLE consents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    consent_given BOOLEAN NOT NULL DEFAULT FALSE,
    consent_version TEXT DEFAULT 'v1.0',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ANALYTICS VIEWS (Optional, for easy querying)
CREATE VIEW session_analytics AS
SELECT 
    u.id as user_id,
    COUNT(s.id) as total_sessions,
    AVG(s.total_score) as avg_score
FROM users u
LEFT JOIN interview_sessions s ON u.id = s.user_id
GROUP BY u.id;

-- Seed Data (Sample Questions)
INSERT INTO questions (question_text, topic, difficulty_level, ideal_answer_keywords) VALUES
('Explain the Virtual DOM in React.', 'React', 2, '["reconciliation", "diffing", "memory", "update", "state"]'),
('What is the difference between SQL and NoSQL?', 'Database', 1, '["relational", "schema", "table", "document", "scale"]'),
('Describe a difficult bug you fixed.', 'Behavioral', 3, '["situation", "task", "action", "result", "star"]');
