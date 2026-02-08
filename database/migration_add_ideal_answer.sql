-- Add ideal_answer_text column to questions table
ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS ideal_answer_text TEXT;
