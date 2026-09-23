🎓 Interview Companion – AI-Powered Mock Interview Platform



🌟 Overview

Interview Companion is a full-stack AI-powered mock interview platform designed to help candidates practice technical and behavioral interviews through AI-driven conversations, coding challenges, and performance analysis.

The platform simulates real interview environments by generating contextual questions, evaluating candidate responses, providing personalized feedback, and adapting the interview difficulty based on performance.

---

✨ Key Features

- 🎤 Voice Interaction – Conversational AI-powered mock interviews
- 🧠 AI Question Generation – Context-aware questions based on resume and selected topics
- ⚡ Answer Evaluation – AI-powered scoring with actionable feedback
- 💻 Coding Challenges – Practice coding problems with test cases
- 📊 Performance Analytics – Track interview performance and identify improvement areas
- 🎯 Adaptive Difficulty – Questions adjust based on candidate performance
- 🔄 Follow-up Questions – Dynamic questions based on previous answers
- 📄 Resume-Aware Interviews – Generate questions based on candidate experience and skills

---

🎯 Interview Modes

The platform supports multiple interview scenarios:

1. Behavioral Round – STAR-based behavioral questions
2. Technical Round – Technical concepts and problem-solving
3. DSA Round – Data structures and algorithms
4. System Design – Architecture and scalability questions
5. HR Round – HR and communication questions
6. Salary Negotiation – Practice compensation discussions

---

🧠 AI Capabilities

- Resume-aware question generation
- Context-aware follow-up questions
- Semantic answer evaluation
- Keyword and concept analysis
- Grammar and clarity evaluation
- Answer scoring
- Personalized feedback
- Adaptive interview difficulty
- AI-powered interview conversations

---

🏗️ Architecture

┌─────────────────────────────────────────┐
│              Frontend                   │
│         Next.js + React                 │
│              Vercel                    │
└───────────────────┬─────────────────────┘
                    │
                    │ HTTPS API
                    ▼
┌─────────────────────────────────────────┐
│               Backend                   │
│        Node.js + Express.js             │
│               Render                    │
└───────────────────┬─────────────────────┘
                    │
                    │ Internal API
                    ▼
┌─────────────────────────────────────────┐
│             ML Service                  │
│         Python + FastAPI                │
│               Render                    │
└───────────────┬───────────┬─────────────┘
                │           │
                ▼           ▼
          ┌──────────┐  ┌──────────┐
          │ Groq LLM │  │ Deepgram │
          └──────────┘  └──────────┘
                │
                ▼
          ┌──────────┐
          │ Supabase │
          └──────────┘

---

🛠️ Tech Stack

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

---

📁 Project Structure

interview-companion/
│
├── frontend/
│   ├── app/                         # Next.js App Router
│   ├── components/                 # Reusable UI components
│   ├── hooks/                      # Custom React hooks
│   ├── lib/                        # Utilities and configurations
│   ├── services/                   # API services
│   ├── public/                     # Static assets
│   ├── types/                      # TypeScript types
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── config/                 # Application configuration
│   │   ├── controllers/            # Request controllers
│   │   ├── middleware/             # Express middleware
│   │   ├── routes/                 # API routes
│   │   ├── services/               # Business logic
│   │   ├── types/                  # TypeScript types
│   │   └── index.ts                # Backend entry point
│   │
│   └── package.json
│
├── ml_service/
│   ├── app/
│   │   ├── config/                 # ML configuration
│   │   ├── services/               # AI/ML services
│   │   │   ├── generator.py       # Question generation
│   │   │   ├── scorer.py          # Answer evaluation
│   │   │   ├── conversation_service.py
│   │   │   └── question_cache.py  # Question caching
│   │   │
│   │   ├── routes/                 # FastAPI routes
│   │   └── main.py                 # ML service entry point
│   │
│   ├── requirements.txt
│   └── .env
│
├── .gitignore
├── .env.example
└── README.md

---

⚡ Performance Optimizations

The platform includes several optimizations to improve response time and reduce unnecessary API calls.

Implemented Optimizations

- ⚡ Question Caching – Avoids regenerating repeated questions
- 🚀 Quick Scoring Heuristics – Provides fast evaluation for suitable responses
- 📝 Optimized Prompts – Reduces unnecessary token usage
- 🔄 Cache Management – Tracks cache usage and performance
- 📉 Reduced API Calls – Minimizes repeated AI requests

Performance Improvements

Metric| Before| After
Question Generation| 8–15s| 4–7s
Cached Questions| —| <100ms
LLM Answer Evaluation| 5–10s| 1–3s
Heuristic Evaluation| —| <50ms

«Performance may vary depending on network conditions, API response time, and server load.»

---

🔌 Core API Endpoints

Backend API

Method| Endpoint| Description
"GET"| "/"| Health check
"POST"| "/interviews/start"| Start a new interview
"POST"| "/interviews/answer"| Submit an interview answer
"GET"| "/interviews/:id/report"| Get interview report

ML Service API

Method| Endpoint| Description
"GET"| "/"| Health check
"POST"| "/conversation/generate_contextual_questions"| Generate interview questions
"POST"| "/score_answer"| Evaluate an answer
"GET"| "/cache/stats"| Get cache statistics

---

🚀 Getting Started

Prerequisites

Make sure you have the following installed:

- Node.js 18+
- Python 3.11+
- npm
- Git

1. Clone the Repository

git clone https://github.com/yourusername/interview-companion.git
cd interview-companion

2. Install Backend Dependencies

cd backend
npm install

3. Install ML Service Dependencies

cd ../ml_service

python -m venv venv

Windows

venv\Scripts\activate

macOS / Linux

source venv/bin/activate

Then install dependencies:

pip install -r requirements.txt

4. Install Frontend Dependencies

cd ../frontend
npm install

---

🔐 Environment Variables

Create the required environment files using ".env.example" as a reference.

Backend

PORT=3000
NODE_ENV=development

SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

ML_SERVICE_URL=http://localhost:8000

ML Service

GROQ_API_KEY=your_groq_api_key

Frontend

NEXT_PUBLIC_BACKEND_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

«Never commit ".env" files or API keys to GitHub.»

---

▶️ Running the Application

Run each service in a separate terminal.

Terminal 1 – Backend

cd backend
npm run dev

Terminal 2 – ML Service

cd ml_service
venv\Scripts\activate
python -m uvicorn app.main:app --reload --port 8000

Terminal 3 – Frontend

cd frontend
npm run dev

Application URLs

Frontend:   http://localhost:3000
Backend:    http://localhost:3000/api
ML Service: http://localhost:8000

---

🧪 Testing

Backend Health Check

curl http://localhost:3000/

ML Service Health Check

curl http://localhost:8000/

Cache Statistics

curl http://localhost:8000/cache/stats

---

🔮 Future Improvements

- Streaming AI responses
- Expanded question template library
- Improved question deduplication
- Interview history and analytics
- Custom interview templates
- Team/group interviews
- Mobile application
- Advanced performance insights

---

👨‍💻 Author

Voruganti Hariprasad

- GitHub: https://github.com/Hariabc

---

⭐ If you find this project useful, consider giving it a star!