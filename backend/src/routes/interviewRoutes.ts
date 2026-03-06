import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';
import axios from 'axios';

const router = express.Router();
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const SKIP_ANSWER_MARKER = '[SKIPPED_BY_USER]';
const MANDATORY_TECHNICAL_TOPICS = ['Data Structures and Algorithms'];
const NON_TECHNICAL_MODES = new Set(['hr_round', 'salary_negotiation', 'behavioral_storytelling', 'managerial_leadership']);
const SUPPORTED_MODES = new Set([
    'balanced',
    'hr_round',
    'dsa_round',
    'salary_negotiation',
    'system_design',
    'behavioral_storytelling',
    'managerial_leadership',
    'rapid_fire'
]);

function withMandatoryTechnicalTopics(topics: any, includeMandatory: boolean = true): string[] {
    const input = Array.isArray(topics) ? topics : [];
    const normalized = input
        .map((t) => String(t || '').trim())
        .filter(Boolean);

    if (!includeMandatory) {
        return normalized;
    }

    const existingLower = new Set(normalized.map((t) => t.toLowerCase()));
    for (const required of MANDATORY_TECHNICAL_TOPICS) {
        if (!existingLower.has(required.toLowerCase())) {
            normalized.push(required);
        }
    }

    return normalized;
}

function normalizeInterviewMode(rawMode: any): string {
    const mode = String(rawMode || '').trim().toLowerCase();
    return SUPPORTED_MODES.has(mode) ? mode : 'balanced';
}

function defaultTopicsByMode(mode: string): string[] {
    switch (mode) {
        case 'hr_round':
            return ['Behavioral', 'Communication', 'Conflict Resolution'];
        case 'dsa_round':
            return ['Data Structures and Algorithms', 'Problem Solving'];
        case 'salary_negotiation':
            return ['Salary Negotiation', 'Offer Strategy', 'Career Growth'];
        case 'system_design':
            return ['System Design', 'Scalability', 'Architecture'];
        case 'behavioral_storytelling':
            return ['Behavioral', 'Leadership', 'Ownership'];
        case 'managerial_leadership':
            return ['Leadership', 'Stakeholder Management', 'Execution'];
        case 'rapid_fire':
            return ['JavaScript', 'Node.js', 'SQL', 'System Design'];
        default:
            return ['React', 'Node.js', 'System Design', 'Behavioral', 'SQL', 'Python'];
    }
}

function modePrompt(mode: string): string {
    switch (mode) {
        case 'hr_round':
            return 'Focus on communication, conflict handling, teamwork, and role fit.';
        case 'dsa_round':
            return 'Focus on algorithms, edge cases, complexity analysis, and clean reasoning.';
        case 'salary_negotiation':
            return 'Simulate compensation negotiation with trade-offs, market framing, and professionalism.';
        case 'system_design':
            return 'Focus on architecture, scalability, reliability, and pragmatic trade-offs.';
        case 'behavioral_storytelling':
            return 'Use STAR-style behavioral prompts and push for measurable impact.';
        case 'managerial_leadership':
            return 'Probe people leadership, prioritization, influence, and decision quality.';
        case 'rapid_fire':
            return 'Ask concise, high-frequency mixed questions and evaluate quick thinking.';
        default:
            return 'Use a balanced mix of technical and behavioral prompts.';
    }
}

function detectConversationSignals(text: string) {
    const normalized = String(text || '').toLowerCase();
    return {
        asks_for_help: /(help me|hint|clue|guidance|i don't know|dont know|not sure|confused)/.test(normalized),
        asks_to_skip: /(skip|pass this|move on|next question)/.test(normalized)
    };
}

function buildFallbackQuestion(topicHint?: string | null, difficultyHint: number = 3) {
    const topic = String(topicHint || 'Data Structures and Algorithms').trim() || 'Data Structures and Algorithms';
    const difficulty = Math.max(1, Math.min(5, Number(difficultyHint) || 3));
    return {
        question_text: `Let's continue with ${topic}. Explain how you would approach a real-world problem in this area and discuss time-space trade-offs.`,
        topic,
        difficulty_level: difficulty,
        ideal_answer_keywords: ['approach', 'trade-off', 'complexity', 'edge cases', 'testing']
    };
}

// POST /interviews/start
router.post('/start', authenticate, async (req: AuthRequest, res) => {
    const { resumeId, topics } = req.body;
    const userId = req.user.id;
    console.log('Starting interview for user:', userId, 'resumeId:', resumeId);

    try {
        const interviewMode = normalizeInterviewMode(req.body.interviewMode);
        const includeMandatoryTopics = !NON_TECHNICAL_MODES.has(interviewMode);
        const mergedTopics = withMandatoryTechnicalTopics(
            [...defaultTopicsByMode(interviewMode), ...(Array.isArray(topics) ? topics : [])],
            includeMandatoryTopics
        );
        const selectedTopics = Array.from(new Set(mergedTopics.map((t) => String(t || '').trim()).filter(Boolean)));
        const targetQuestions = Math.max(2, Math.min(12, Number(req.body.targetQuestions) || 5));
        const difficultyPreference = ['easy', 'medium', 'hard'].includes(String(req.body.difficultyPreference || ''))
            ? String(req.body.difficultyPreference)
            : 'medium';
        const coachStyle = ['supportive', 'strict', 'balanced'].includes(String(req.body.coachStyle || ''))
            ? String(req.body.coachStyle)
            : 'balanced';

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

        // 0.5. Ensure user exists in public.users (in case sync trigger failed or hasn't run)
        // This prevents foreign key constraint violations
        const { error: userSyncError } = await supabase
            .from('users')
            .upsert({
                id: userId,
                email: req.user.email,
                full_name: req.user.user_metadata?.full_name || null
            }, { onConflict: 'id' });

        if (userSyncError) {
            console.error('Error syncing user to public table:', userSyncError);
        }

        // 1. Create a session with conversation phase enabled
        const { data: session, error: sessionError } = await supabase
            .from('interview_sessions')
            .insert([{
                user_id: userId,
                resume_profile_id: activeResumeId,
                status: 'in_progress',
                conversation_phase: true,  // Start with conversation phase
                conversation_context: {
                    interview_mode: interviewMode,
                    selected_topics: selectedTopics,
                    target_questions: targetQuestions,
                    difficulty_preference: difficultyPreference,
                    coach_style: coachStyle,
                    mode_prompt: modePrompt(interviewMode),
                    mode_started_at: new Date().toISOString()
                }
            }])
            .select()
            .single();

        if (sessionError) {
            console.error('Session creation error:', sessionError);
            throw sessionError;
        }

        // Don't generate questions immediately - conversation phase will handle this
        // Return session to allow frontend to start conversation
        res.status(201).json({
            session,
            questions: [],  // Empty - questions will be generated after conversation
            conversation_phase: true
        });
    } catch (error: any) {
        console.error('Interview start error:', error);
        res.status(500).json({
            error: error.message,
            details: error.details || error.hint || null
        });
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

        const context = session?.conversation_context || {};
        const codingRound = context?.coding_round || null;
        const codingRoundHistory = Array.isArray(context?.coding_round_history) ? context.coding_round_history : [];

        res.json({ session, questions, coding_round: codingRound, coding_round_history: codingRoundHistory });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// POST /interviews/answer
router.post('/answer', authenticate, async (req: AuthRequest, res) => {
    const { sessionId, questionId, answerText, audioUrl } = req.body;
    // answerText OR audioUrl should be present

    try {
        if (!sessionId) {
            return res.status(400).json({ error: "sessionId is required" });
        }
        if (!questionId) {
            return res.status(400).json({ error: "questionId is required" });
        }
        if ((!answerText || !String(answerText).trim()) && !audioUrl) {
            return res.status(400).json({ error: "No answer text or audio provided" });
        }

        const normalizedAnswerText = String(answerText || '').trim();
        const skippedByUser = normalizedAnswerText.startsWith(SKIP_ANSWER_MARKER);

        // 1. Save Answer to DB
        const { data: answer, error: ansError } = await supabase
            .from('answers')
            .insert([{ session_id: sessionId, question_id: questionId, answer_text: answerText, audio_url: audioUrl }])
            .select()
            .single();

        if (ansError) {
            console.error("Error saving answer:", ansError);
            return res.status(500).json({
                error: ansError.message || "Failed to save answer",
                details: ansError.details || null,
                hint: ansError.hint || null,
                code: ansError.code || null
            });
        }

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
        // Only call if we have text to score
        // For voice answers, analysis was already done during upload
        let mlResponse;

        if (skippedByUser) {
            mlResponse = {
                semantic_score: 0,
                grammar_score: 0,
                keyword_score: 0,
                final_score: 0,
                feedback_text: "Question skipped by user."
            };
        } else if (answerText && answerText.trim()) {
            // Text answer - needs scoring
            try {
                const response = await axios.post(`${ML_SERVICE_URL}/score_answer`, payload);
                mlResponse = response.data;
            } catch (mlErr) {
                console.error("ML Service unreachable:", mlErr);
                return res.json({ answer, message: "Answer saved, scoring pending (ML unavailable)" });
            }
        } else if (audioUrl) {
            // Voice answer - analysis was done during upload, use placeholder scores
            mlResponse = {
                semantic_score: 0,
                grammar_score: 0,
                keyword_score: 0,
                final_score: 0,
                feedback_text: "Voice answer recorded. Detailed analysis available in voice metrics."
            };
        } else {
            // No answer provided
            return res.status(400).json({ error: "No answer text or audio provided" });
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

        // 3.5 Save Voice Metrics if present
        if (req.body.voiceMetrics) {
            const vm = req.body.voiceMetrics;
            const metricsData = {
                answer_id: answer.id,
                wpm: vm.wpm,
                filler_word_count: vm.filler_words,
                pause_duration: vm.pause_duration,
                fluency_score: vm.fluency_score,
                confidence_score: vm.confidence_score
            };
            const { error: voiceError } = await supabase
                .from('confidence_metrics')
                .insert([metricsData]);

            if (voiceError) console.error("Error saving voice metrics:", voiceError);
        }

        // 4. Generate Next Question (Adaptive)
        let nextQuestion = null;
        try {
            // Fetch session context and resume_id for conversational/adaptive follow-ups
            const { data: session } = await supabase
                .from('interview_sessions')
                .select('resume_profile_id, conversation_context')
                .eq('id', sessionId)
                .single();

            let resumeText: string | null = null;
            if (session?.resume_profile_id) {
                const { data: profile } = await supabase
                    .from('resume_profiles')
                    .select('resume_text')
                    .eq('id', session.resume_profile_id)
                    .single();
                resumeText = profile?.resume_text || null;
            }

            const avgScore = req.body.voiceMetrics
                ? ((Number(req.body.voiceMetrics.confidence_score || 0) + Number(req.body.voiceMetrics.fluency_score || 0)) / 2)
                : 6;
            const difficultyHint = avgScore >= 8 ? 4 : avgScore >= 6 ? 3 : 2;
            const answerForContext = skippedByUser ? "User skipped this question." : String(answerText || "");
            const userSignals = detectConversationSignals(answerForContext);

            let conversationHistory: Array<{ speaker: 'interviewer' | 'candidate'; text: string }> = [];
            try {
                const { data: recentAnswers } = await supabase
                    .from('answers')
                    .select('question_id, answer_text, created_at')
                    .eq('session_id', sessionId)
                    .order('created_at', { ascending: false })
                    .limit(4);

                const orderedAnswers = [...(recentAnswers || [])].reverse();
                const questionIds = orderedAnswers.map((a: any) => a.question_id).filter(Boolean);

                let questionMap = new Map<string, string>();
                if (questionIds.length > 0) {
                    const { data: linkedQuestions } = await supabase
                        .from('questions')
                        .select('id, question_text')
                        .in('id', questionIds);

                    questionMap = new Map((linkedQuestions || []).map((q: any) => [q.id, q.question_text]));
                }

                conversationHistory = orderedAnswers.flatMap((a: any) => {
                    const qText = questionMap.get(a.question_id);
                    const turns: Array<{ speaker: 'interviewer' | 'candidate'; text: string }> = [];
                    if (qText) turns.push({ speaker: 'interviewer', text: qText });
                    if (a.answer_text) turns.push({ speaker: 'candidate', text: a.answer_text });
                    return turns;
                });
            } catch (historyErr) {
                console.error('Failed to build conversation history for contextual generation:', historyErr);
            }

            const contextTopics = Array.isArray(session?.conversation_context?.key_topics) && session?.conversation_context?.key_topics?.length
                ? session.conversation_context.key_topics
                : (Array.isArray(session?.conversation_context?.areas_of_interest) && session?.conversation_context?.areas_of_interest?.length
                    ? session.conversation_context.areas_of_interest
                    : ['General']);

            const contextTopicsWithTechnical = withMandatoryTechnicalTopics(contextTopics);
            const { data: askedQuestionRows } = await supabase
                .from('questions')
                .select('question_text')
                .eq('session_id', sessionId)
                .order('created_at', { ascending: true });
            const askedQuestions = (askedQuestionRows || [])
                .map((row: any) => String(row.question_text || '').trim())
                .filter(Boolean);

            const contextualResponse = await axios.post(`${ML_SERVICE_URL}/conversation/generate_contextual_questions`, {
                user_intro_analysis: {
                    ...(session?.conversation_context || {}),
                    user_signals: userSignals
                },
                resume_text: resumeText,
                selected_topics: withMandatoryTechnicalTopics([question?.topic || contextTopicsWithTechnical[0] || 'General']),
                count: 1,
                difficulty_hint: difficultyHint,
                previous_answer: answerForContext,
                audio_metrics: req.body.voiceMetrics || null,
                conversation_history: conversationHistory,
                asked_questions: askedQuestions,
                diversity_nonce: `${sessionId}-${Date.now()}`
            });

            const generatedQuestions = Array.isArray(contextualResponse.data?.questions) ? contextualResponse.data.questions : [];
            const q = generatedQuestions[0] && String(generatedQuestions[0]?.question_text || '').trim()
                ? generatedQuestions[0]
                : buildFallbackQuestion(question?.topic || contextTopicsWithTechnical[0] || 'Data Structures and Algorithms', difficultyHint);

            if (q && String(q.question_text || '').trim()) {
                // Insert next prompt linked to session
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

                if (!insError) {
                    nextQuestion = insertedQ;

                    // Synthesize speech for the next prompt
                    try {
                        const ttsResponse = await axios.post(
                            `${ML_SERVICE_URL}/synthesize_speech`,
                            null,
                            {
                                params: {
                                    text: nextQuestion.question_text,
                                    voice: "female_friendly"
                                }
                            }
                        );
                        nextQuestion.audio_base64 = ttsResponse.data.audio_base64;
                    } catch (ttsErr) {
                        console.error("TTS synthesis failed for next question:", ttsErr);
                    }
                }
            }
        } catch (genErr) {
            console.error("Failed to generate next question:", genErr);
        }

        res.json({ answer, evaluation: mlResponse, next_question: nextQuestion });

    } catch (error: any) {
        console.error("POST /interviews/answer failed:", error);
        res.status(500).json({
            error: error?.message || "Failed to submit answer",
            details: error?.details || null,
            hint: error?.hint || null
        });
    }
});

// POST /interviews/end
router.post('/end', authenticate, async (req: AuthRequest, res) => {
    const { sessionId } = req.body;

    try {
        // First, get all answers for this session
        const { data: answers, error: answersError } = await supabase
            .from('answers')
            .select('id')
            .eq('session_id', sessionId);

        if (answersError) throw answersError;

        let totalScore = 0;
        if (answers && answers.length > 0) {
            // Get all scores for these answers
            const answerIds = answers.map(a => a.id);
            const { data: scores, error: scoresError } = await supabase
                .from('ai_scores')
                .select('final_score')
                .in('answer_id', answerIds);

            if (!scoresError && scores && scores.length > 0) {
                const sum = scores.reduce((acc, s) => acc + (s.final_score || 0), 0);
                totalScore = Math.round(sum / scores.length);
            }
        }

        // Update session status and total score
        const { error } = await supabase
            .from('interview_sessions')
            .update({
                status: 'completed',
                end_time: new Date(),
                total_score: totalScore
            })
            .eq('id', sessionId);

        if (error) return res.status(500).json({ error: error.message });
        res.json({ message: "Session completed", total_score: totalScore });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
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
        const normalizedQuestions = (questions || []).map((q: any) => {
            const sortedAnswers = [...(q.answers || [])].sort((a: any, b: any) => {
                const aTs = new Date(a.created_at || 0).getTime();
                const bTs = new Date(b.created_at || 0).getTime();
                return bTs - aTs;
            });
            return {
                ...q,
                answers: sortedAnswers
            };
        });

        const qa_history = normalizedQuestions.map((q: any, index: number) => {
            const latestAnswer = q.answers?.[0] || null;
            const latestScore = latestAnswer?.ai_scores?.[0] || null;
            const latestText = String(latestAnswer?.answer_text || '').trim();
            return {
                order: index + 1,
                question_id: q.id,
                question_text: q.question_text,
                topic: q.topic,
                difficulty_level: q.difficulty_level,
                asked_at: q.created_at || null,
                attempts: (q.answers || []).length,
                latest_answer_text: latestText || null,
                latest_answer_created_at: latestAnswer?.created_at || null,
                skipped: latestText.startsWith(SKIP_ANSWER_MARKER),
                latest_score: latestScore
            };
        });

        res.json({ session, questions: normalizedQuestions, qa_history });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
