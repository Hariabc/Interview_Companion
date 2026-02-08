import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';
import axios from 'axios';

const router = express.Router();
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

// POST /interviews/start
router.post('/start', authenticate, async (req: AuthRequest, res) => {
    const { resumeId, topics } = req.body;
    const userId = req.user.id;

    try {
        // 0. Resolve Resume ID (if null, get latest for user)
        let activeResumeId = resumeId;
        const skipResume = req.body.skipResume;

        if (!activeResumeId && !skipResume) {
            const { data: latestProfile } = await supabase
                .from('resume_profiles')
                .select('id')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (latestProfile) activeResumeId = latestProfile.id;
        }

        // 1. Create a session
        const { data: session, error: sessionError } = await supabase
            .from('interview_sessions')
            .insert([{ user_id: userId, resume_profile_id: activeResumeId, status: 'in_progress' }])
            .select()
            .single();

        if (sessionError) throw sessionError;

        // 2. Generate Dynamic Questions based on Resume
        let questions: any[] = [];

        // Fetch resume text
        let resume_text = "No resume provided. Candidate is interviewing based on selected topics only.";

        if (activeResumeId) {
            const { data: profile } = await supabase
                .from('resume_profiles')
                .select('resume_text')
                .eq('id', activeResumeId)
                .single();
            if (profile?.resume_text) resume_text = profile.resume_text;
        }

        // Always attempt generation if we have topics, even without resume
        if (topics && topics.length > 0) {
            console.log("Generating questions..."); // DEBUG
            try {
                const genResponse = await axios.post(`${ML_SERVICE_URL}/generate_questions`, {
                    resume_text: resume_text,
                    topics: topics || ['General']
                });

                // The ML service returns { questions: [...] }
                const generatedQuestions = genResponse.data.questions;
                console.log("Received generated questions:", generatedQuestions?.length); // DEBUG

                if (generatedQuestions && generatedQuestions.length > 0) {
                    // Sanitize Data
                    const sanitizedQuestions = generatedQuestions.map((q: any) => ({
                        ...q,
                        session_id: session.id,
                        difficulty_level: Math.max(1, Math.min(5, Number(q.difficulty_level) || 1)),
                        ideal_answer_keywords: Array.isArray(q.ideal_answer_keywords) ? q.ideal_answer_keywords : []
                    }));

                    // Insert into DB
                    const { data: insertedQuestions, error: insError } = await supabase
                        .from('questions')
                        .insert(sanitizedQuestions)
                        .select();

                    if (!insError && insertedQuestions) {
                        questions = insertedQuestions;
                    } else {
                        console.error("Failed to insert generated questions:", insError);
                    }
                }
            } catch (genErr) {
                console.error("Question generation failed:", genErr);
            }
        }

        // Fallback: Fetch random questions if generation failed or no resume
        if (!questions || questions.length === 0) {
            const { data: fallbackQuestions, error: qError } = await supabase
                .from('questions')
                .select('*')
                .limit(10);
            if (qError) throw qError;
            questions = fallbackQuestions || [];
        }

        res.status(201).json({ session, questions });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /interviews/:sessionId
router.get('/:sessionId', authenticate, async (req: AuthRequest, res) => {
    const { sessionId } = req.params;

    try {
        const { data: session, error: sessionError } = await supabase
            .from('interview_sessions')
            .select('*')
            .eq('id', sessionId)
            .single();

        if (sessionError) throw sessionError;

        // Fetch questions specific to this session
        const { data: questions, error: qError } = await supabase
            .from('questions')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });

        if (qError) throw qError;

        res.json({ session, questions });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// POST /interviews/answer
router.post('/answer', authenticate, async (req: AuthRequest, res) => {
    const { sessionId, questionId, answerText, audioUrl } = req.body;
    // answerText OR audioUrl should be present

    try {
        // 1. Save Answer to DB
        const { data: answer, error: ansError } = await supabase
            .from('answers')
            .insert([{ session_id: sessionId, question_id: questionId, answer_text: answerText, audio_url: audioUrl }])
            .select()
            .single();

        if (ansError) throw ansError;

        // 2. Call ML Service for Scoring
        // Get Question Reference for Ideal Answer
        const { data: question } = await supabase
            .from('questions')
            .select('ideal_answer_keywords, question_text, ideal_answer_text, topic, difficulty_level')
            .eq('id', questionId)
            .single();

        const payload = {
            answer_text: answerText,
            audio_url: audioUrl,
            question_text: question?.question_text,
            ideal_keywords: question?.ideal_answer_keywords,
            ideal_answer_text: question?.ideal_answer_text
        };

        // Call ML Microservice
        let mlResponse;
        try {
            const response = await axios.post(`${ML_SERVICE_URL}/score_answer`, payload);
            mlResponse = response.data;
        } catch (mlErr) {
            console.error("ML Service unreachable:", mlErr);
            return res.json({ answer, message: "Answer saved, scoring pending (ML unavailable)" });
        }

        // 3. Save Score to DB
        const scoreData = {
            answer_id: answer.id,
            semantic_score: mlResponse.semantic_score,
            grammar_score: mlResponse.grammar_score,
            keyword_score: mlResponse.keyword_score,
            final_score: mlResponse.final_score,
            feedback_text: mlResponse.feedback_text
        };

        const { error: scoreDbError } = await supabase
            .from('ai_scores')
            .insert([scoreData]);

        if (scoreDbError) console.error("Error saving score:", scoreDbError);

        // 4. Generate Next Question (Adaptive)
        let nextQuestion = null;
        try {
            // Fetch session to get resume_id
            const { data: session } = await supabase
                .from('interview_sessions')
                .select('resume_profile_id')
                .eq('id', sessionId)
                .single();

            if (session?.resume_profile_id) {
                const { data: profile } = await supabase
                    .from('resume_profiles')
                    .select('resume_text')
                    .eq('id', session.resume_profile_id)
                    .single();

                if (profile?.resume_text) {
                    const genResponse = await axios.post(`${ML_SERVICE_URL}/generate_questions`, {
                        resume_text: profile.resume_text,
                        topics: [question?.topic || 'General'],
                        // We could pass difficulty here if we updated the ML service to accept it
                    });

                    const newQuestions = genResponse.data.questions;
                    if (newQuestions && newQuestions.length > 0) {
                        const q = newQuestions[0];
                        // Insert new question linked to session
                        const { data: insertedQ, error: insError } = await supabase
                            .from('questions')
                            .insert([{
                                ...q,
                                session_id: sessionId,
                                difficulty_level: Math.max(1, Math.min(5, Number(q.difficulty_level) || 3)),
                                ideal_answer_keywords: Array.isArray(q.ideal_answer_keywords) ? q.ideal_answer_keywords : []
                            }])
                            .select()
                            .single();

                        if (!insError) nextQuestion = insertedQ;
                    }
                }
            }
        } catch (genErr) {
            console.error("Failed to generate next question:", genErr);
        }

        res.json({ answer, evaluation: mlResponse, next_question: nextQuestion });

    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// POST /interviews/end
router.post('/end', authenticate, async (req: AuthRequest, res) => {
    const { sessionId } = req.body;
    // Calculate total score and update session status
    // ... logic to aggregate scores ...

    const { error } = await supabase
        .from('interview_sessions')
        .update({ status: 'completed', end_time: new Date() })
        .eq('id', sessionId);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: "Session completed" });
});

// GET /interviews/:sessionId/report
router.get('/:sessionId/report', authenticate, async (req: AuthRequest, res) => {
    const { sessionId } = req.params;

    try {
        // 1. Fetch Session
        const { data: session, error: sessionError } = await supabase
            .from('interview_sessions')
            .select('*')
            .eq('id', sessionId)
            .single();

        if (sessionError) throw sessionError;

        // 2. Fetch Questions & Answers & Scores
        // We'll fetch questions and join answers, then join scores to answers
        const { data: questions, error: qError } = await supabase
            .from('questions')
            .select(`
                *,
                answers (
                    *,
                    ai_scores (*)
                )
            `)
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });

        if (qError) throw qError;

        res.json({ session, questions });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
