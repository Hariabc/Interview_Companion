# AI Mock Interview Platform 🚀

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)
![Python](https://img.shields.io/badge/python-3.9%2B-blue.svg)
![Next.js](https://img.shields.io/badge/next.js-14-black.svg)

An industry-grade, open-source platform designed to simulate real-world technical interviews. It leverages advanced AI to provide adaptive questioning, real-time speech-to-text analysis, and comprehensive feedback on candidate performance.

## 🌟 Key Features

- **Adaptive Questioning**: dynamically generates follow-up questions based on candidate responses.
- **Real-time Speech Analysis**: Utilizing **Vosk** for offline-capable speech-to-text transcription.
- **Resume Parsing**: Automatically extracts skills and experience from PDF resumes using **pdfminer.six**.
- **AI Scoring & Feedback**: Evaluates answers for relevance, clarity, and technical accuracy using **scikit-learn** and **Sentence-Transformers**.
- **Grammar & Clarity Checks**: Provides actionable feedback on language usage via **language-tool-python**.
- **Secure Authentication**: Robust user management powered by **Supabase Auth**.

## 🏗️ Tech Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Styling**: TailwindCSS
- **State/Data**: React Hooks, Axios
- **Visualization**: Recharts

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Documentation**: Swagger UI (`/api-docs`)
- **Validation**: Zod
- **Security**: Helmet, CORS

### ML Microservice
- **Framework**: FastAPI (Python)
- **NLP/AI**: spaCy, Sentence-Transformers, Scikit-learn
- **Speech**: Vosk, Librosa

### Database & Storage
- **PostgreSQL**: Managed via Supabase
- **Storage**: Supabase Storage for resume uploads

## 📂 Project Structure

```bash
/
├── backend/          # Node.js API Gateway & Business Logic
├── frontend/         # Next.js Client Application
├── ml_service/       # Python AI/ML Microservice
└── database/         # SQL Schemas & Migration Scripts
```

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Python](https://www.python.org/) (v3.9+)
- [Supabase Account](https://supabase.com/)

### 1. Database Setup

1. Create a new project on Supabase.
2. Go to the **SQL Editor** in your Supabase dashboard.
3. Copy the contents of `database/schema.sql` and run it to set up the tables.
4. Note down your `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

### 2. Backend Setup

Navigate to the `backend` directory:

```bash
cd backend
npm install
```

Create a `.env` file based on `.env.example`:

```env
PORT=3000
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
ML_SERVICE_URL=http://localhost:8000
```

Start the server:

```bash
npm run dev
# Server runs on http://localhost:3000
# Swagger Docs: http://localhost:3000/api-docs
```

### 3. ML Service Setup

Navigate to the `ml_service` directory:

```bash
cd ml_service
python -m venv venv
# Windows:
venv\Scripts\activate
# Mac/Linux:
# source venv/bin/activate

pip install -r requirements.txt
python -m spacy download en_core_web_sm
```

Start the service:

```bash
uvicorn app.main:app --reload --port 8000
# Service runs on http://localhost:8000
```

### 4. Frontend Setup

Navigate to the `frontend` directory:

```bash
cd frontend
npm install
```

Create a `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_KEY=your_supabase_key
NEXT_PUBLIC_API_URL=http://localhost:3000
```

Start the application:

```bash
npm run dev
# App runs on http://localhost:3001 (or 3000 if backend is on a different port)
```

## 📚 API Documentation

The backend provides a full Swagger UI for testing endpoints.
Once the backend is running, visit:
**[http://localhost:3000/api-docs](http://localhost:3000/api-docs)**

## 🧪 Research & Analytics

Interview data is logged for analysis. To export anonymous session data:

```bash
cd ml_service
# AI Mock Interview Platform 🚀

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)
![Python](https://img.shields.io/badge/python-3.9%2B-blue.svg)
![Next.js](https://img.shields.io/badge/next.js-14-black.svg)

An industry-grade, open-source platform designed to simulate real-world technical interviews. It leverages advanced AI to provide adaptive questioning, real-time speech-to-text analysis, and comprehensive feedback on candidate performance.

## 🌟 Key Features

- **Adaptive Questioning**: dynamically generates follow-up questions based on candidate responses.
- **Real-time Speech Analysis**: Utilizing **Vosk** for offline-capable speech-to-text transcription.
- **Resume Parsing**: Automatically extracts skills and experience from PDF resumes using **pdfminer.six**.
- **AI Scoring & Feedback**: Evaluates answers for relevance, clarity, and technical accuracy using **scikit-learn** and **Sentence-Transformers**.
- **Grammar & Clarity Checks**: Provides actionable feedback on language usage via **language-tool-python**.
- **Secure Authentication**: Robust user management powered by **Supabase Auth**.

## 🏗️ Tech Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Styling**: TailwindCSS
- **State/Data**: React Hooks, Axios
- **Visualization**: Recharts

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Documentation**: Swagger UI (`/api-docs`)
- **Validation**: Zod
- **Security**: Helmet, CORS

### ML Microservice
- **Framework**: FastAPI (Python)
- **NLP/AI**: spaCy, Sentence-Transformers, Scikit-learn
- **Speech**: Vosk, Librosa

### Database & Storage
- **PostgreSQL**: Managed via Supabase
- **Storage**: Supabase Storage for resume uploads

## 📂 Project Structure

```bash
/
├── backend/          # Node.js API Gateway & Business Logic
├── frontend/         # Next.js Client Application
├── ml_service/       # Python AI/ML Microservice
└── database/         # SQL Schemas & Migration Scripts
```

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Python](https://www.python.org/) (v3.9+)
- [Supabase Account](https://supabase.com/)

### 1. Database Setup

1. Create a new project on Supabase.
2. Go to the **SQL Editor** in your Supabase dashboard.
3. Copy the contents of `database/schema.sql` and run it to set up the tables.
4. Note down your `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

### 2. Backend Setup

Navigate to the `backend` directory:

```bash
cd backend
npm install
```

Create a `.env` file based on `.env.example`:

```env
PORT=3000
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
ML_SERVICE_URL=http://localhost:8000
```

Start the server:

```bash
npm run dev
# Server runs on http://localhost:3000
# Swagger Docs: http://localhost:3000/api-docs
```

### 3. ML Service Setup

Navigate to the `ml_service` directory:

```bash
cd ml_service
python -m venv venv
# Windows:
venv\Scripts\activate
# Mac/Linux:
# source venv/bin/activate

pip install -r requirements.txt
python -m spacy download en_core_web_sm
```

Start the service:

```bash
uvicorn app.main:app --reload --port 8000
# Service runs on http://localhost:8000
```

### 4. Frontend Setup

Navigate to the `frontend` directory:

```bash
cd frontend
npm install
```

Create a `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_KEY=your_supabase_key
NEXT_PUBLIC_API_URL=http://localhost:3000
```

Start the application:

```bash
npm run dev
# App runs on http://localhost:3001 (or 3000 if backend is on a different port)
```

## 📚 API Documentation

The backend provides a full Swagger UI for testing endpoints.
Once the backend is running, visit:
**[http://localhost:3000/api-docs](http://localhost:3000/api-docs)**

## 🧪 Research & Analytics

Interview data is logged for analysis. To export anonymous session data:

```bash
cd ml_service
python research/export_data.py
```

## 📄 License

This project is licensed under the MIT License.

 
