🎓 Interview Companion – AI-Powered Mock Interview Platform

Overview

Interview Companion is a full-stack AI-powered mock interview platform designed to help candidates practice technical and behavioral interviews through AI-driven conversations, coding challenges, and performance analysis.

Key Features

- 🎤 Voice Interaction – Conversational AI-powered mock interviews
- 🧠 AI Question Generation – Context-aware questions based on resume and selected topics
- ⚡ Answer Evaluation – AI-based scoring with actionable feedback
- 💻 Coding Challenges – Practice programming problems with test cases
- 📊 Performance Analytics – Track interview performance and identify improvement areas
- 🎯 Adaptive Difficulty – Adjust questions based on candidate performance

Interview Modes

- Behavioral Interview
- Technical Interview
- DSA Interview
- System Design Interview
- HR Interview
- Salary Negotiation

AI Capabilities

- Resume-aware question generation
- Context-aware follow-up questions
- Answer evaluation and scoring
- Semantic understanding of responses
- Keyword and concept analysis
- Grammar and clarity evaluation
- Personalized feedback
- Adaptive interview difficulty

Tech Stack

Frontend

- Next.js 14
- React
- TypeScript
- Tailwind CSS
- Supabase Authentication

Backend

- Node.js
- Express.js
- TypeScript
- Supabase

AI / ML

- Python
- FastAPI
- Groq LLM
- Deepgram
- scikit-learn

Deployment

- Vercel
- Render
- Supabase

Architecture

Frontend
Next.js + React
      │
      │ HTTPS API
      ▼
Backend
Node.js + Express
      │
      │ Internal API
      ▼
ML Service
Python + FastAPI
      │
      ├── Groq LLM
      ├── Deepgram
      └── Supabase

Performance Optimizations

- Question caching for repeated requests
- Optimized prompts to reduce token usage
- Quick scoring heuristics for common responses
- Reduced unnecessary API calls
- Cache management and statistics

Project Structure

interview-companion/
├── frontend/
│   ├── app/
│   ├── components/
│   └── public/
│
├── backend/
│   └── src/
│       ├── routes/
│       ├── services/
│       └── config/
│
├── ml_service/
│   └── app/
│       ├── services/
│       └── config/
│
└── README.md

Core API Endpoints

Backend

GET  /
POST /interviews/start
POST /interviews/answer
GET  /interviews/:id/report

ML Service

GET  /
POST /conversation/generate_contextual_questions
POST /score_answer
GET /cache/stats

Future Improvements

- Streaming AI responses
- Expanded question library
- Improved question deduplication
- Interview history and analytics
- Custom interview templates
- Team/group interviews


:::