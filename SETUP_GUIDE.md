# AI Introduction Flow - Setup & Testing Guide

## Prerequisites

Before running the application, ensure you have the following API keys:

### Required API Keys

1. **Deepgram API Key** (for Speech-to-Text)
   - Sign up at: https://deepgram.com/
   - Get your API key from the dashboard
   - Free tier available with generous limits

2. **Groq API Key** (for LLM - already configured)
   - Sign up at: https://console.groq.com/
   - Get your API key

## Installation Steps

### 1. Install ML Service Dependencies

```bash
cd ml_service
pip install -r requirements.txt
```

This will install:
- `edge-tts` - Free TTS (no API key needed)
- `deepgram-sdk` - Speech-to-Text
- Other existing dependencies

### 2. Configure Environment Variables

#### ML Service (.env)

Create or update `ml_service/.env`:

```env
GROQ_API_KEY=your_groq_api_key_here
DEEPGRAM_API_KEY=your_deepgram_api_key_here
```

#### Backend (.env)

Your existing `backend/.env` should already have:

```env
PORT=3000
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
ML_SERVICE_URL=http://localhost:8000
```

### 3. Run Database Migrations

Execute the SQL migration to create the conversation tables:

```bash
# Option 1: Using Supabase CLI
supabase db push

# Option 2: Manually in Supabase Dashboard
# Go to SQL Editor and run the contents of:
# database/migrations/add_conversation_tables.sql
```

The migration creates:
- `conversation_turns` table
- Adds `conversation_phase`, `conversation_context`, `user_intro_summary` columns to `interview_sessions`

### 4. Start the Services

#### Terminal 1: ML Service (FastAPI)
```bash
cd ml_service
uvicorn app.main:app --reload --port 8000
```

#### Terminal 2: Backend (Node.js)
```bash
cd backend
npm run dev
```

#### Terminal 3: Frontend (Next.js)
```bash
cd frontend
npm run dev
```

## Testing the Flow

### 1. Start an Interview

1. Navigate to the dashboard
2. Upload a resume (optional but recommended for better personalization)
3. Click "Start Interview"

### 2. AI Introduction Phase

- **Expected**: AI introduces itself with voice
- **What to check**:
  - AI introduction text appears
  - Audio plays automatically
  - Smooth animation during playback

### 3. User Introduction Phase

- **Expected**: Microphone button appears after AI finishes
- **What to do**:
  - Click the microphone to start recording
  - Speak your introduction (e.g., "Hi, I'm John. I'm a full-stack developer with 3 years of experience in React and Node.js...")
  - Click again to stop recording
- **What to check**:
  - Recording timer shows
  - Red pulsing animation during recording
  - Microphone permissions granted

### 4. Processing Phase

- **Expected**: Loading state while analyzing
- **What to check**:
  - "Analyzing Your Introduction" message
  - Your transcribed introduction appears
  - Loading spinner animation

### 5. Technical Questions Phase

- **Expected**: Smooth transition to personalized questions
- **What to check**:
  - Questions are relevant to your introduction
  - Questions match your resume skills
  - Normal interview flow continues

## Troubleshooting

### Issue: No audio plays during AI introduction

**Solution**:
- Check browser console for errors
- Ensure Edge TTS service is working: `python ml_service/app/services/tts_service.py`
- Check ML service logs

### Issue: Microphone not working

**Solution**:
- Grant microphone permissions in browser
- Check browser console for permission errors
- Test microphone in browser settings

### Issue: Transcription fails

**Solution**:
- Verify Deepgram API key is correct
- Check Deepgram dashboard for API usage/errors
- Ensure audio file is in supported format (webm, wav, mp3)

### Issue: Questions not personalized

**Solution**:
- Check ML service logs for Groq API errors
- Verify resume was uploaded and parsed correctly
- Check conversation_context in database

### Issue: Database errors

**Solution**:
- Ensure migrations ran successfully
- Check Supabase logs
- Verify RLS policies allow inserts to `conversation_turns`

## API Endpoints Reference

### ML Service (Port 8000)

- `POST /conversation/start` - Generate AI introduction + TTS
- `POST /conversation/analyze_user_intro` - Analyze user introduction
- `POST /conversation/generate_contextual_questions` - Generate personalized questions
- `POST /transcribe_audio` - STT from audio file
- `POST /synthesize_speech` - TTS from text

### Backend (Port 3000)

- `POST /conversation/start` - Initialize conversation
- `POST /conversation/user-response` - Handle user introduction (with audio upload)
- `GET /conversation/:sessionId` - Get conversation history

## Database Schema

### conversation_turns

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| session_id | UUID | FK to interview_sessions |
| speaker | TEXT | 'ai' or 'user' |
| message_text | TEXT | Conversation text |
| audio_url | TEXT | Optional audio URL |
| created_at | TIMESTAMP | Created timestamp |

### interview_sessions (new columns)

| Column | Type | Description |
|--------|------|-------------|
| conversation_phase | BOOLEAN | true = in conversation, false = in questions |
| conversation_context | JSONB | Analyzed user intro data |
| user_intro_summary | TEXT | User introduction text |

## Next Steps

After successful testing:

1. **Deploy to Production**
   - Update environment variables on Render/Vercel
   - Run migrations on production database
   - Test end-to-end on production

2. **Enhancements**
   - Add voice selection (male/female)
   - Add skip conversation option
   - Add conversation replay feature
   - Improve error handling and retry logic

3. **Monitoring**
   - Monitor Deepgram API usage
   - Track conversation completion rates
   - Analyze question personalization quality
