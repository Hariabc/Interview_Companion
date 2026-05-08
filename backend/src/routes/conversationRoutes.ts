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
    pickInterviewerProfile,
    shouldRequestRoleClarification
} from '../services/interviewModeEngine';

const router = express.Router();
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const MANDATORY_TECHNICAL_TOPICS = ['Data Structures and Algorithms'];

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
    return String(mode || '').trim().toLowerCase() === 'dsa_round';
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

function difficultyPreferenceToHint(preference: any): number {
    const normalized = String(preference || 'medium').trim().toLowerCase();
    if (normalized === 'easy') return 1;
    if (normalized === 'hard') return 4;
    return 2;
}

function voiceForInterviewerGender(gender: any): 'female_friendly' | 'male_professional' {
    return String(gender || '').trim().toLowerCase() === 'male'
        ? 'male_professional'
        : 'female_friendly';
}

function buildFallbackQuestion(topicHint?: string | null, difficultyHint: number = 2, modeHint: any = 'balanced') {
    const mode = normalizeMode(modeHint);
    const topic = String(topicHint || (mode === 'dsa_round' ? 'Problem Solving' : 'Interview Basics')).trim() || 'Interview Basics';
    const difficulty = Math.max(1, Math.min(5, Number(difficultyHint) || 3));

    if (mode === 'hr_round') {
        return {
            question_text: 'Tell me about a time you had to explain a problem clearly to someone. What did you do?',
            topic: 'Communication',
            difficulty_level: difficulty,
            ideal_answer_keywords: ['context', 'clarity', 'listener', 'action', 'outcome']
        };
    }
    if (mode === 'salary_negotiation') {
        return {
            question_text: 'What compensation range would you ask for, and what is the main reason behind that number?',
            topic: 'Salary Negotiation',
            difficulty_level: difficulty,
            ideal_answer_keywords: ['range', 'market', 'impact', 'flexibility', 'role']
        };
    }
    if (mode === 'system_design') {
        return {
            question_text: 'Pick one app feature you know well. How would you design the basic backend for it?',
            topic: 'System Design',
            difficulty_level: difficulty,
            ideal_answer_keywords: ['requirements', 'api', 'database', 'scale', 'trade-off']
        };
    }
    if (mode === 'behavioral_storytelling') {
        return {
            question_text: 'Tell me about one project you are proud of. What was your role and what changed because of your work?',
            topic: 'Behavioral',
            difficulty_level: difficulty,
            ideal_answer_keywords: ['project', 'role', 'action', 'impact', 'learning']
        };
    }
    if (mode === 'managerial_leadership') {
        return {
            question_text: 'Describe a time you helped a teammate or group move forward when things were unclear.',
            topic: 'Leadership',
            difficulty_level: difficulty,
            ideal_answer_keywords: ['ambiguity', 'support', 'alignment', 'decision', 'outcome']
        };
    }
    if (mode === 'rapid_fire') {
        return {
            question_text: `In one minute, explain one practical use of ${topic}.`,
            topic,
            difficulty_level: difficulty,
            ideal_answer_keywords: ['use case', 'simple explanation', 'example', 'benefit']
        };
    }
    if (mode === 'dsa_round') {
        return {
            question_text: 'Given a list of numbers, how would you find the largest number and explain the time complexity?',
            topic: 'Problem Solving',
            difficulty_level: difficulty,
            ideal_answer_keywords: ['loop', 'maximum', 'O(n)', 'edge cases']
        };
    }

    return {
        question_text: `Let's start simple with ${topic}. What is one small feature or problem you handled, and how did you approach it?`,
        topic,
        difficulty_level: difficulty,
        ideal_answer_keywords: ['problem', 'approach', 'decision', 'result', 'learning']
    };
}

function normalizeAnswerText(value: any): string {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function inferAdaptiveDecision(previousAnswer: any, audioMetrics: any, currentTopic: any) {
    const rawAnswer = String(previousAnswer || '').trim();
    const normalized = normalizeAnswerText(rawAnswer);
    const words = normalized ? normalized.split(' ').filter(Boolean) : [];
    const wordCount = words.length;
    const confidence = Number(audioMetrics?.confidence_score || 0);
    const fluency = Number(audioMetrics?.fluency_score || 0);
    const fillerWords = Number(audioMetrics?.filler_words || 0);
    const asksForHelp = /(help me|hint|clue|guidance|i don't know|dont know|not sure|confused)/.test(normalized);
    const asksToSkip = /(skip|pass this|move on|next question)/.test(normalized);
    const mentionsTradeoff = /(trade off|tradeoff|pros and cons|advantage|disadvantage)/.test(normalized);
    const mentionsComplexity = /(time complexity|space complexity|big o|o\(|linear|constant|quadratic)/.test(normalized);

    let strategy: 'clarify' | 'deepen' | 'simplify' | 'move_on' | 'recover' = 'clarify';
    let rationale = 'The next question should clarify the previous response before moving deeper.';
    let difficultyAdjustment = 0;
    let focusTopic = String(currentTopic || '').trim() || null;

    if (asksToSkip) {
        strategy = 'move_on';
        rationale = 'The candidate explicitly asked to skip, so the interview should move on gracefully.';
        difficultyAdjustment = -1;
    } else if (asksForHelp || wordCount < 20 || fluency > 0 && fluency < 5 || confidence > 0 && confidence < 5) {
        strategy = 'simplify';
        rationale = 'The candidate appears unsure or gave a short answer, so the next question should stay supportive and narrower.';
        difficultyAdjustment = -1;
    } else if (wordCount >= 90 && confidence >= 7 && fluency >= 7 && (mentionsTradeoff || mentionsComplexity)) {
        strategy = 'deepen';
        rationale = 'The candidate gave a strong answer, so a deeper follow-up can probe trade-offs and real-world judgment.';
        difficultyAdjustment = 1;
    } else if (fillerWords >= 8 && wordCount < 45) {
        strategy = 'recover';
        rationale = 'The candidate struggled with delivery, so the next prompt should reset the conversation with a cleaner entry point.';
        difficultyAdjustment = -1;
    }

    return {
        strategy,
        rationale,
        focus_topic: focusTopic,
        answer_word_count: wordCount,
        confidence_score: Number.isFinite(confidence) ? confidence : null,
        fluency_score: Number.isFinite(fluency) ? fluency : null,
        filler_words: Number.isFinite(fillerWords) ? fillerWords : null,
        difficulty_adjustment: difficultyAdjustment
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
        const interviewerProfile = pickInterviewerProfile(`${sessionId}-${Date.now()}-${Math.random()}`);
        const intro_text = buildModeIntroScript(interviewMode, userName || null, interviewerProfile.name);
        const interviewerVoice = voiceForInterviewerGender(interviewerProfile.gender);

        let audio_base64: string | null = null;
        let voice_used = interviewerVoice;
        try {
            const tts = await axios.post(
                `${ML_SERVICE_URL}/synthesize_speech`,
                null,
                {
                    params: {
                        text: intro_text,
                        voice: interviewerVoice
                    }
                }
            );
            audio_base64 = tts.data?.audio_base64 || null;
            voice_used = tts.data?.voice_used || interviewerVoice;
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
                    interviewer_name: interviewerProfile.name,
                    interviewer_gender: interviewerProfile.gender,
                    mode_runtime: buildModeRuntimeForStart(interviewMode)
                }
            })
            .eq('id', sessionId);

        res.json({
            intro_text,
            audio_base64,
            voice_used,
            interviewer_name: interviewerProfile.name,
            interviewer_gender: interviewerProfile.gender,
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
        const interviewerVoice = voiceForInterviewerGender(existingContext?.interviewer_gender);
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
                            voice: interviewerVoice
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

        // Generate only the immediate first question. Every later question is generated
        // after the candidate answers, so the interview stays adaptive instead of
        // storing a pre-generated queue.
        const configuredTopics = Array.isArray(existingContext?.selected_topics)
            ? existingContext?.selected_topics
            : [];
        const requestedTopics = Array.isArray(req.body.selectedTopics) ? req.body.selectedTopics : [];
        const topicSource = requestedTopics.length > 0 ? requestedTopics : configuredTopics;
        const selectedTopicsWithTechnical = withMandatoryTechnicalTopics(topicSource, modeRequiresTechnicalTopics(configuredMode));
        const immediateQuestionCount = 1;
        const initialDifficulty = difficultyPreferenceToHint(existingContext?.difficulty_preference);
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
            count: immediateQuestionCount,
            difficulty_hint: initialDifficulty,
            asked_questions: askedQuestions,
            diversity_nonce: `${configuredMode}-${sessionId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
        });

        const responseQuestions = Array.isArray(questionsResponse.data?.questions) ? questionsResponse.data.questions : [];
        const validQuestions = responseQuestions.filter((q: any) => String(q?.question_text || '').trim());
        const questions = validQuestions.length
            ? validQuestions.slice(0, immediateQuestionCount)
            : [buildFallbackQuestion(selectedTopicsWithTechnical?.[0] || userAnalysis?.key_topics?.[0], initialDifficulty, configuredMode)];

        // Save only the question being asked now.
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
                                voice: interviewerVoice
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
                        voice: interviewerVoice
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

        const adaptiveDecision = inferAdaptiveDecision(previousAnswer, audioMetrics, currentTopic);
        difficulty = Math.max(1, Math.min(5, difficulty + Number(adaptiveDecision.difficulty_adjustment || 0)));

        // Generate next question using ML service
        const userSignals = detectConversationSignals(String(previousAnswer || ''));
        const mlResponse = await axios.post(`${ML_SERVICE_URL}/conversation/generate_contextual_questions`, {
            user_intro_analysis: {
                ...(session.conversation_context || {}),
                user_signals: userSignals,
                adaptive_context: adaptiveDecision,
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
            diversity_nonce: `${configuredMode}-${sessionId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
        });

        const generatedQuestions = Array.isArray(mlResponse.data?.questions) ? mlResponse.data.questions : [];
        const nextQuestion = generatedQuestions[0] && String(generatedQuestions[0]?.question_text || '').trim()
            ? generatedQuestions[0]
            : buildFallbackQuestion(
                String(currentTopic || contextTopicsWithTechnical?.[0] || 'Data Structures and Algorithms'),
                difficulty,
                configuredMode
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

        try {
            const existingContext = session?.conversation_context || {};
            const adaptiveHistory = Array.isArray(existingContext?.adaptive_history) ? existingContext.adaptive_history.slice(-11) : [];
            adaptiveHistory.push({
                created_at: new Date().toISOString(),
                previous_topic: currentTopic || null,
                next_question_id: insertedQuestion.id,
                next_question_text: insertedQuestion.question_text,
                strategy: adaptiveDecision.strategy,
                rationale: adaptiveDecision.rationale,
                difficulty: difficulty
            });

            await supabase
                .from('interview_sessions')
                .update({
                    conversation_context: {
                        ...existingContext,
                        adaptive_history: adaptiveHistory,
                        latest_adaptive_decision: adaptiveDecision
                    }
                })
                .eq('id', sessionId);
        } catch (contextError) {
            console.error('Failed to persist adaptive history:', contextError);
        }

        res.json({
            question: insertedQuestion,
            shouldContinue: true,
            adaptive_decision: adaptiveDecision
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
