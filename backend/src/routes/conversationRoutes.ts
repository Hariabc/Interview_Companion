import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';
import axios from 'axios';
import multer from 'multer';
import FormData from 'form-data';
import {
    buildModeDirective,
    buildModeGreeting,
    buildModeIntroScript,
    buildModeRuntimeForStart,
    buildRoleClarificationPrompt,
    extractRoleSignals,
    normalizeMode,
    shouldRequestRoleClarification
} from '../services/interviewModeEngine';

const router = express.Router();
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const MANDATORY_TECHNICAL_TOPICS = ['Data Structures and Algorithms'];
const NON_TECHNICAL_MODES = new Set(['hr_round', 'salary_negotiation', 'behavioral_storytelling', 'managerial_leadership']);

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

function modeRequiresTechnicalTopics(mode: any): boolean {
    return !NON_TECHNICAL_MODES.has(String(mode || '').trim().toLowerCase());
}

function detectConversationSignals(text: string) {
    const normalized = String(text || '').toLowerCase();
    return {
        asks_for_help: /(help me|hint|clue|guidance|i don't know|dont know|not sure|confused)/.test(normalized),
        asks_to_skip: /(skip|pass this|move on|next question)/.test(normalized)
    };
}

function extractCandidateName(introText: string) {
    const text = String(introText || '').trim();
    if (!text) return null;

    const patterns = [
        /\bmy name is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
        /\bi am\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
        /\bi'm\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
        /\bthis is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1]) {
            const name = match[1].trim();
            if (name.split(' ').length <= 2 && name.length <= 40) {
                return name;
            }
        }
    }

    return null;
}

function buildFallbackQuestion(topicHint?: string | null, difficultyHint: number = 3) {
    const topic = String(topicHint || 'Data Structures and Algorithms').trim() || 'Data Structures and Algorithms';
    const difficulty = Math.max(1, Math.min(5, Number(difficultyHint) || 3));
    return {
        question_text: `Let's start with ${topic}. Explain one problem you solved recently, your approach, and one improvement you would make now.`,
        topic,
        difficulty_level: difficulty,
        ideal_answer_keywords: ['problem', 'approach', 'trade-off', 'time complexity', 'testing']
    };
}

// Configure Multer for Memory Storage
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
        const allowedMimeTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/webm', 'audio/ogg'];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only audio files are allowed.'));
        }
    }
});

// POST /conversation/start - Initialize conversation phase
router.post('/start', authenticate, async (req: AuthRequest, res) => {
    const { sessionId, userName } = req.body;

    try {
        const { data: session } = await supabase
            .from('interview_sessions')
            .select('conversation_context')
            .eq('id', sessionId)
            .single();

        const existingContext = session?.conversation_context || {};
        const interviewMode = normalizeMode(existingContext?.interview_mode);
        const intro_text = buildModeIntroScript(interviewMode, userName || null);

        let audio_base64: string | null = null;
        let voice_used = 'female_friendly';
        try {
            const tts = await axios.post(
                `${ML_SERVICE_URL}/synthesize_speech`,
                null,
                {
                    params: {
                        text: intro_text,
                        voice: 'female_friendly'
                    }
                }
            );
            audio_base64 = tts.data?.audio_base64 || null;
            voice_used = tts.data?.voice_used || 'female_friendly';
        } catch (ttsError: any) {
            console.error('TTS failed for intro:', ttsError?.response?.data || ttsError?.message);
        }

        // Save conversation turn to database
        const { data: conversationTurn, error: dbError } = await supabase
            .from('conversation_turns')
            .insert([{
                session_id: sessionId,
                speaker: 'ai',
                message_text: intro_text,
                audio_url: null // We'll send base64 directly to frontend
            }])
            .select()
            .single();

        if (dbError) {
            console.error('Error saving conversation turn:', dbError);
        }

        await supabase
            .from('interview_sessions')
            .update({
                conversation_context: {
                    ...existingContext,
                    mode_runtime: buildModeRuntimeForStart(interviewMode)
                }
            })
            .eq('id', sessionId);

        res.json({
            intro_text,
            audio_base64,
            voice_used,
            conversation_turn_id: conversationTurn?.id
        });

    } catch (error: any) {
        console.error('Conversation start error:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Failed to start conversation',
            details: error.response?.data || error.message
        });
    }
});

// POST /conversation/user-response - Handle user's introduction
router.post('/user-response', authenticate, upload.single('audio'), async (req: AuthRequest, res) => {
    const { sessionId, textResponse, user_intro_text, userIntroText } = req.body;

    try {
        let userIntroTextValue = textResponse || user_intro_text || userIntroText;
        let transcriptionConfidence = 1.0;

        // If audio file is provided, transcribe it
        if (req.file) {
            const form = new FormData();
            form.append('file', req.file.buffer, {
                filename: req.file.originalname,
                contentType: req.file.mimetype
            });

            try {
                const transcribeResponse = await axios.post(
                    `${ML_SERVICE_URL}/transcribe_audio`,
                    form,
                    { headers: { ...form.getHeaders() } }
                );

                userIntroTextValue = transcribeResponse.data.transcript;
                transcriptionConfidence = transcribeResponse.data.confidence;
            } catch (transcribeError: any) {
                console.error('Transcription error:', transcribeError.message);
                return res.status(500).json({
                    error: 'Failed to transcribe audio',
                    details: transcribeError.message
                });
            }
        }

        if (!userIntroTextValue || !userIntroTextValue.trim()) {
            return res.status(400).json({
                error: 'No user introduction provided',
                details: {
                    fileReceived: Boolean(req.file),
                    bodyKeys: Object.keys(req.body || {})
                }
            });
        }

        // Save user's response to conversation_turns
        const { data: userTurn, error: userTurnError } = await supabase
            .from('conversation_turns')
            .insert([{
                session_id: sessionId,
                speaker: 'user',
                message_text: userIntroTextValue
            }])
            .select()
            .single();

        if (userTurnError) {
            console.error('Error saving user turn:', userTurnError);
        }

        // Get resume text if available
        const { data: session } = await supabase
            .from('interview_sessions')
            .select('resume_profile_id, conversation_context')
            .eq('id', sessionId)
            .single();

        let resumeText = null;
        if (session?.resume_profile_id) {
            const { data: profile } = await supabase
                .from('resume_profiles')
                .select('resume_text')
                .eq('id', session.resume_profile_id)
                .single();
            resumeText = profile?.resume_text;
        }

        // Analyze user introduction
        const analysisResponse = await axios.post(`${ML_SERVICE_URL}/conversation/analyze_user_intro`, {
            user_intro_text: userIntroTextValue,
            resume_text: resumeText
        });

        const userAnalysis = analysisResponse.data;
        const existingContext = session?.conversation_context || {};
        const configuredMode = normalizeMode(existingContext?.interview_mode);
        const roleSignals = extractRoleSignals(userIntroTextValue);
        const modeRuntime = existingContext?.mode_runtime || {};

        const needsRoleClarification = shouldRequestRoleClarification(configuredMode, roleSignals)
            && !Boolean(modeRuntime?.role_clarification_done);

        if (needsRoleClarification) {
            const followUpPrompt = buildRoleClarificationPrompt(configuredMode);
            let followUpAudioBase64: string | null = null;
            try {
                const tts = await axios.post(
                    `${ML_SERVICE_URL}/synthesize_speech`,
                    null,
                    {
                        params: {
                            text: followUpPrompt,
                            voice: 'female_friendly'
                        }
                    }
                );
                followUpAudioBase64 = tts.data?.audio_base64 || null;
            } catch (ttsErr: any) {
                console.error('TTS synthesis failed for follow-up prompt:', ttsErr?.response?.data || ttsErr?.message);
            }

            try {
                await supabase.from('conversation_turns').insert([{
                    session_id: sessionId,
                    speaker: 'ai',
                    message_text: followUpPrompt,
                    audio_url: null
                }]);
            } catch (followupDbErr) {
                console.error('Error saving follow-up turn:', followupDbErr);
            }

            await supabase
                .from('interview_sessions')
                .update({
                    conversation_context: {
                        ...existingContext,
                        mode_runtime: {
                            ...modeRuntime,
                            active_mode: configuredMode,
                            stage: 'awaiting_role_details',
                            role_clarification_done: true,
                            role_signals: roleSignals,
                            last_transition_at: new Date().toISOString()
                        }
                    }
                })
                .eq('id', sessionId);

            return res.json({
                user_intro_text: userIntroTextValue,
                transcription_confidence: transcriptionConfidence,
                analysis: userAnalysis,
                mode: configuredMode,
                conversation_complete: false,
                follow_up_prompt: followUpPrompt,
                follow_up_audio_base64: followUpAudioBase64
            });
        }

        // Generate contextual questions
        const configuredTopics = Array.isArray(existingContext?.selected_topics)
            ? existingContext?.selected_topics
            : [];
        const requestedTopics = Array.isArray(req.body.selectedTopics) ? req.body.selectedTopics : [];
        const topicSource = requestedTopics.length > 0 ? requestedTopics : configuredTopics;
        const selectedTopicsWithTechnical = withMandatoryTechnicalTopics(topicSource, modeRequiresTechnicalTopics(configuredMode));
        const configuredCount = Math.max(2, Math.min(8, Number(existingContext?.target_questions) || 3));
        const { data: existingSessionQuestions } = await supabase
            .from('questions')
            .select('question_text')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });
        const askedQuestions = (existingSessionQuestions || [])
            .map((q: any) => String(q.question_text || '').trim())
            .filter(Boolean);

        const questionsResponse = await axios.post(`${ML_SERVICE_URL}/conversation/generate_contextual_questions`, {
            user_intro_analysis: {
                ...userAnalysis,
                interview_mode: configuredMode,
                coach_style: existingContext?.coach_style || 'balanced',
                difficulty_preference: existingContext?.difficulty_preference || 'medium',
                mode_prompt: existingContext?.mode_prompt || null,
                mode_directive: buildModeDirective(configuredMode, roleSignals),
                role_signals: roleSignals
            },
            resume_text: resumeText,
            selected_topics: selectedTopicsWithTechnical,
            count: configuredCount,
            asked_questions: askedQuestions,
            diversity_nonce: `${sessionId}-${Date.now()}`
        });

        const responseQuestions = Array.isArray(questionsResponse.data?.questions) ? questionsResponse.data.questions : [];
        const validQuestions = responseQuestions.filter((q: any) => String(q?.question_text || '').trim());
        const questions = validQuestions.length
            ? validQuestions
            : [buildFallbackQuestion(selectedTopicsWithTechnical?.[0] || userAnalysis?.key_topics?.[0], 3)];

        // Save questions to database
        const sanitizedQuestions = questions.map((q: any) => ({
            ...q,
            session_id: sessionId,
            difficulty_level: Math.max(1, Math.min(5, Number(q.difficulty_level) || 3)),
            ideal_answer_keywords: Array.isArray(q.ideal_answer_keywords) ? q.ideal_answer_keywords : []
        }));

        const { data: insertedQuestions, error: questionsError } = await supabase
            .from('questions')
            .insert(sanitizedQuestions)
            .select();

        if (questionsError) {
            console.error('Error inserting questions:', questionsError);
            return res.status(500).json({ error: 'Failed to save questions' });
        }

        // Synthesize audio for each generated prompt so the AI continues speaking naturally
        const questionsWithAudio = await Promise.all(
            (insertedQuestions || []).map(async (q: any) => {
                try {
                    const ttsResponse = await axios.post(
                        `${ML_SERVICE_URL}/synthesize_speech`,
                        null,
                        {
                            params: {
                                text: q.question_text,
                                voice: "female_friendly"
                            }
                        }
                    );

                    return {
                        ...q,
                        audio_base64: ttsResponse.data?.audio_base64 || null
                    };
                } catch (ttsErr: any) {
                    console.error('TTS synthesis failed for contextual prompt:', ttsErr?.response?.data || ttsErr?.message);
                    return q;
                }
            })
        );

        // Personalized greeting after user introduction, before first question.
        const candidateName = extractCandidateName(userIntroTextValue);
        const greetingText = buildModeGreeting(configuredMode, candidateName, roleSignals);

        let greetingAudioBase64: string | null = null;
        try {
            const greetingTts = await axios.post(
                `${ML_SERVICE_URL}/synthesize_speech`,
                null,
                {
                    params: {
                        text: greetingText,
                        voice: 'female_friendly'
                    }
                }
            );
            greetingAudioBase64 = greetingTts.data?.audio_base64 || null;
        } catch (greetingErr: any) {
            console.error('TTS synthesis failed for greeting:', greetingErr?.response?.data || greetingErr?.message);
        }

        try {
            await supabase.from('conversation_turns').insert([{
                session_id: sessionId,
                speaker: 'ai',
                message_text: greetingText,
                audio_url: null
            }]);
        } catch (greetDbErr) {
            console.error('Error saving greeting turn:', greetDbErr);
        }

        // Update session with conversation context
        await supabase
            .from('interview_sessions')
            .update({
                conversation_phase: false,
                conversation_context: {
                    ...existingContext,
                    ...(userAnalysis || {}),
                    selected_topics: selectedTopicsWithTechnical,
                    interview_mode: configuredMode,
                    mode_runtime: {
                        ...modeRuntime,
                        active_mode: configuredMode,
                        stage: 'questioning',
                        role_signals: roleSignals,
                        last_transition_at: new Date().toISOString()
                    }
                },
                user_intro_summary: userIntroTextValue
            })
            .eq('id', sessionId);

        res.json({
            user_intro_text: userIntroTextValue,
            transcription_confidence: transcriptionConfidence,
            analysis: userAnalysis,
            greeting_text: greetingText,
            greeting_audio_base64: greetingAudioBase64,
            questions: questionsWithAudio,
            conversation_complete: true
        });

    } catch (error: any) {
        console.error('User response error details:', {
            message: error.message,
            stack: error.stack,
            response: error.response?.data
        });
        res.status(500).json({
            error: 'Failed to process user response',
            details: error.response?.data || error.message
        });
    }
});

// GET /conversation/:sessionId - Get conversation history
router.get('/:sessionId', authenticate, async (req: AuthRequest, res) => {
    const { sessionId } = req.params;

    try {
        const { data: turns, error } = await supabase
            .from('conversation_turns')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        res.json({ conversation_turns: turns || [] });
    } catch (error: any) {
        console.error('Get conversation error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST /conversation/next-question - Generate next question dynamically
router.post('/next-question', authenticate, async (req: AuthRequest, res) => {
    const { sessionId, previousAnswer, audioMetrics, currentTopic } = req.body;

    try {
        // Get session context
        const { data: session } = await supabase
            .from('interview_sessions')
            .select('conversation_context, resume_profile_id')
            .eq('id', sessionId)
            .single();

        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        // Get resume text if available
        let resumeText = null;
        if (session.resume_profile_id) {
            const { data: profile } = await supabase
                .from('resume_profiles')
                .select('resume_text')
                .eq('id', session.resume_profile_id)
                .single();
            resumeText = profile?.resume_text;
        }

        // Determine difficulty based on audio metrics
        let difficulty = 3; // Default medium
        if (audioMetrics) {
            const avgScore = (audioMetrics.confidence_score + audioMetrics.fluency_score) / 2;
            if (avgScore >= 8) difficulty = 4; // Harder if doing well
            else if (avgScore >= 6) difficulty = 3;
            else difficulty = 2; // Easier if struggling
        }
        const difficultyPreference = String(session?.conversation_context?.difficulty_preference || 'medium');
        if (difficultyPreference === 'easy') difficulty = Math.max(1, difficulty - 1);
        if (difficultyPreference === 'hard') difficulty = Math.min(5, difficulty + 1);

        const configuredMode = normalizeMode(session?.conversation_context?.interview_mode);
        const includeMandatoryTopics = modeRequiresTechnicalTopics(configuredMode);

        const contextTopics = Array.isArray(session?.conversation_context?.selected_topics) && session?.conversation_context?.selected_topics?.length
            ? session.conversation_context.selected_topics
            : Array.isArray(session?.conversation_context?.key_topics) && session?.conversation_context?.key_topics?.length
            ? session.conversation_context.key_topics
            : (Array.isArray(session?.conversation_context?.areas_of_interest) && session?.conversation_context?.areas_of_interest?.length
                ? session.conversation_context.areas_of_interest
                : ['General']);

        const contextTopicsWithTechnical = withMandatoryTechnicalTopics(contextTopics, includeMandatoryTopics);
        const { data: existingSessionQuestions } = await supabase
            .from('questions')
            .select('question_text')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });
        const askedQuestions = (existingSessionQuestions || [])
            .map((q: any) => String(q.question_text || '').trim())
            .filter(Boolean);

        // Generate next question using ML service
        const userSignals = detectConversationSignals(String(previousAnswer || ''));
        const mlResponse = await axios.post(`${ML_SERVICE_URL}/conversation/generate_contextual_questions`, {
            user_intro_analysis: {
                ...(session.conversation_context || {}),
                user_signals: userSignals,
                interview_mode: configuredMode,
                difficulty_preference: difficultyPreference,
                coach_style: session?.conversation_context?.coach_style || 'balanced',
                mode_directive: buildModeDirective(configuredMode, session?.conversation_context?.mode_runtime?.role_signals || {}),
                role_signals: session?.conversation_context?.mode_runtime?.role_signals || {}
            },
            resume_text: resumeText,
            selected_topics: withMandatoryTechnicalTopics(currentTopic ? [currentTopic] : contextTopicsWithTechnical, includeMandatoryTopics),
            count: 1,
            difficulty_hint: difficulty,
            previous_answer: previousAnswer,
            audio_metrics: audioMetrics,
            asked_questions: askedQuestions,
            diversity_nonce: `${sessionId}-${Date.now()}`
        });

        const generatedQuestions = Array.isArray(mlResponse.data?.questions) ? mlResponse.data.questions : [];
        const nextQuestion = generatedQuestions[0] && String(generatedQuestions[0]?.question_text || '').trim()
            ? generatedQuestions[0]
            : buildFallbackQuestion(
                String(currentTopic || contextTopicsWithTechnical?.[0] || 'Data Structures and Algorithms'),
                difficulty
            );

        // Save question to database
        const { data: insertedQuestion, error: questionError } = await supabase
            .from('questions')
            .insert([{
                session_id: sessionId,
                question_text: nextQuestion.question_text,
                topic: nextQuestion.topic || currentTopic,
                difficulty_level: Math.max(1, Math.min(5, Number(nextQuestion.difficulty_level) || difficulty)),
                ideal_answer_keywords: Array.isArray(nextQuestion.ideal_answer_keywords) ? nextQuestion.ideal_answer_keywords : []
            }])
            .select()
            .single();

        if (questionError) {
            console.error('Error inserting question:', questionError);
            return res.status(500).json({ error: 'Failed to save question' });
        }

        res.json({
            question: insertedQuestion,
            shouldContinue: true
        });

    } catch (error: any) {
        console.error('Next question generation error:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Failed to generate next question',
            details: error.response?.data || error.message
        });
    }
});

export default router;
