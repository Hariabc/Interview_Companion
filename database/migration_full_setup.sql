-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. RESUME PROFILES
CREATE TABLE IF NOT EXISTS resume_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    resume_text TEXT, 
    parsed_skills JSONB,
    file_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. QUESTIONS BANK
CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_text TEXT NOT NULL,
    topic TEXT NOT NULL,
    difficulty_level INTEGER CHECK (difficulty_level BETWEEN 1 AND 5),
    ideal_answer_keywords JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. INTERVIEW SESSIONS
CREATE TABLE IF NOT EXISTS interview_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    resume_profile_id UUID REFERENCES resume_profiles(id),
    start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    end_time TIMESTAMP WITH TIME ZONE,
    total_score NUMERIC(5, 2),
    status TEXT CHECK (status IN ('in_progress', 'completed', 'abandoned')) DEFAULT 'in_progress',
    difficulty_level INTEGER DEFAULT 1
);

-- 5. ANSWERS
CREATE TABLE IF NOT EXISTS answers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES interview_sessions(id) ON DELETE CASCADE,
    question_id UUID REFERENCES questions(id),
    audio_url TEXT,
    transcript TEXT,
    answer_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. AI SCORES
CREATE TABLE IF NOT EXISTS ai_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    answer_id UUID REFERENCES answers(id) ON DELETE CASCADE,
    semantic_score NUMERIC(5, 2),
    keyword_score NUMERIC(5, 2),
    grammar_score NUMERIC(5, 2),
    final_score NUMERIC(5, 2),
    feedback_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. CONFIDENCE METRICS
CREATE TABLE IF NOT EXISTS confidence_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    answer_id UUID REFERENCES answers(id) ON DELETE CASCADE,
    wpm NUMERIC(5, 2),
    filler_word_count INTEGER,
    pause_duration NUMERIC(5, 2),
    confidence_level TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. CONSENTS
CREATE TABLE IF NOT EXISTS consents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    consent_given BOOLEAN NOT NULL DEFAULT FALSE,
    consent_version TEXT DEFAULT 'v1.0',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed Data
INSERT INTO questions (question_text, topic, difficulty_level, ideal_answer_keywords) VALUES
('Explain the Virtual DOM in React.', 'React', 2, '["reconciliation", "diffing", "memory", "update", "state"]'),
('What is the difference between SQL and NoSQL?', 'Database', 1, '["relational", "schema", "table", "document", "scale"]'),
('Describe a difficult bug you fixed.', 'Behavioral', 3, '["situation", "task", "action", "result", "star"]')
ON CONFLICT DO NOTHING;
