import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';
import axios from 'axios';

const router = express.Router();
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const SKIP_ANSWER_MARKER = '[SKIPPED_BY_USER]';
const MANDATORY_TECHNICAL_TOPICS = ['Data Structures and Algorithms'];
const SCORE_ANSWER_TIMEOUT_MS = 9000;
const NEXT_QUESTION_TIMEOUT_MS = 15000;
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

const BENCHMARKS: Record<string, {
    label: string;
    overall_target: number;
    semantic_target: number;
    grammar_target: number;
    keyword_target: number;
    confidence_target: number;
    focus: string;
}> = {
    balanced: {
        label: 'Balanced Benchmark',
        overall_target: 75,
        semantic_target: 76,
        grammar_target: 72,
        keyword_target: 70,
        confidence_target: 7,
        focus: 'Well-rounded technical and behavioral clarity.'
    },
    hr_round: {
        label: 'HR Benchmark',
        overall_target: 74,
        semantic_target: 72,
        grammar_target: 80,
        keyword_target: 65,
        confidence_target: 7,
        focus: 'Communication, professionalism, and clarity.'
    },
    dsa_round: {
        label: 'DSA Benchmark',
        overall_target: 78,
        semantic_target: 82,
        grammar_target: 68,
        keyword_target: 78,
        confidence_target: 7,
        focus: 'Correctness, complexity analysis, and structured reasoning.'
    },
    salary_negotiation: {
        label: 'Negotiation Benchmark',
        overall_target: 76,
        semantic_target: 74,
        grammar_target: 80,
        keyword_target: 72,
        confidence_target: 8,
        focus: 'Value framing, professionalism, and collaborative negotiation.'
    },
    system_design: {
        label: 'System Design Benchmark',
        overall_target: 80,
        semantic_target: 82,
        grammar_target: 72,
        keyword_target: 80,
        confidence_target: 7,
        focus: 'Architecture trade-offs, scale, reliability, and judgment.'
    },
    behavioral_storytelling: {
        label: 'Behavioral Benchmark',
        overall_target: 77,
        semantic_target: 74,
        grammar_target: 82,
        keyword_target: 70,
        confidence_target: 7,
        focus: 'STAR structure, impact, and reflection.'
    },
    managerial_leadership: {
        label: 'Leadership Benchmark',
        overall_target: 79,
        semantic_target: 78,
        grammar_target: 80,
        keyword_target: 74,
        confidence_target: 8,
        focus: 'Leadership judgment, stakeholder handling, and execution clarity.'
    },
    rapid_fire: {
        label: 'Rapid Fire Benchmark',
        overall_target: 73,
        semantic_target: 74,
        grammar_target: 68,
        keyword_target: 72,
        confidence_target: 7,
        focus: 'Fast recall, concise responses, and control under pace.'
    }
};

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

function buildFallbackQuestion(topicHint?: string | null, difficultyHint: number = 2, modeHint: any = 'balanced') {
    const mode = normalizeInterviewMode(modeHint);
    const topic = String(topicHint || (mode === 'dsa_round' ? 'Problem Solving' : 'Interview Basics')).trim() || 'Interview Basics';
    const difficulty = Math.max(1, Math.min(5, Number(difficultyHint) || 2));

    if (mode === 'dsa_round') {
        return {
            question_text: 'Given a list of numbers, how would you find the largest number and what is the time complexity?',
            topic: 'Problem Solving',
            difficulty_level: difficulty,
            ideal_answer_keywords: ['loop', 'maximum', 'O(n)', 'edge cases']
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
    if (mode === 'hr_round' || mode === 'behavioral_storytelling' || mode === 'managerial_leadership') {
        return {
            question_text: 'Tell me about one project you are proud of. What was your role and what changed because of your work?',
            topic: 'Behavioral',
            difficulty_level: difficulty,
            ideal_answer_keywords: ['project', 'role', 'action', 'impact', 'learning']
        };
    }
    if (mode === 'salary_negotiation') {
        return {
            question_text: 'What compensation range would you ask for, and what is the main reason behind that number?',
            topic: 'Salary Negotiation',
            difficulty_level: difficulty,
            ideal_answer_keywords: ['range', 'market', 'impact', 'role', 'flexibility']
        };
    }

    return {
        question_text: `Let's continue with ${topic}. What is one small problem you handled, and how did you approach it?`,
        topic,
        difficulty_level: difficulty,
        ideal_answer_keywords: ['problem', 'approach', 'decision', 'result', 'learning']
    };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
        promise
            .then((value) => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch((error) => {
                clearTimeout(timer);
                reject(error);
            });
    });
}

function toNumber(value: any): number | null {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function average(values: Array<number | null | undefined>): number | null {
    const filtered = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (!filtered.length) return null;
    return Number((filtered.reduce((sum, value) => sum + value, 0) / filtered.length).toFixed(1));
}

function summarizeScore(score: number | null): string {
    if (score === null) return 'Not enough scored answers yet.';
    if (score >= 85) return 'Strong performance with clear, interview-ready answers.';
    if (score >= 70) return 'Solid performance with a few areas to sharpen.';
    if (score >= 55) return 'Mixed performance. Core ideas are present, but clarity and depth need work.';
    return 'Needs improvement. Answers are not yet consistently clear, complete, or accurate.';
}

function getBenchmarkProfile(mode: any) {
    const normalized = String(mode || 'balanced').trim().toLowerCase();
    return BENCHMARKS[normalized] || BENCHMARKS.balanced;
}

function computeReadinessScore(params: {
    averageFinalScore: number | null;
    communication: any;
    resumeConsistencySummary: any;
    adaptiveSummary: any;
    crossSessionWeaknessTracking: any;
}) {
    const overall = Number(params.averageFinalScore || 0);
    const confidence = Number(params.communication?.avg_confidence_score || 0) * 10;
    const fluency = Number(params.communication?.avg_fluency_score || 0) * 10;
    const reviewPenalty = Number(params.resumeConsistencySummary?.review_answers || 0) * 2;
    const alignmentBonus = Number(params.resumeConsistencySummary?.aligned_answers || 0) * 1.5;
    const adaptiveDepth = Number(params.adaptiveSummary?.total_adaptive_followups || 0) >= 2 ? 4 : 0;
    const weaknessPenalty = Array.isArray(params.crossSessionWeaknessTracking?.recurring_weak_topics)
        ? params.crossSessionWeaknessTracking.recurring_weak_topics.length * 3
        : 0;

    const composite = Math.max(
        0,
        Math.min(
            100,
            Math.round(
                (overall * 0.55) +
                (confidence * 0.12) +
                (fluency * 0.1) +
                alignmentBonus +
                adaptiveDepth -
                reviewPenalty -
                weaknessPenalty
            )
        )
    );

    let band = 'Developing';
    if (composite >= 85) band = 'Interview Ready';
    else if (composite >= 70) band = 'Almost Ready';
    else if (composite >= 55) band = 'Needs Focused Practice';

    return {
        score: composite,
        band
    };
}

function normalizeText(value: any): string {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenize(value: any): string[] {
    return normalizeText(value)
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token.length >= 3);
}

function uniqueStrings(values: string[]): string[] {
    return Array.from(new Set(values.filter(Boolean)));
}

function sentenceSplit(value: any): string[] {
    return String(value || '')
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean);
}

function buildAnswerEvidence(answerText: any, idealKeywords: any, questionText: any) {
    const originalAnswer = String(answerText || '').trim();
    if (!originalAnswer) {
        return {
            matched_keywords: [] as string[],
            missing_keywords: [] as string[],
            keyword_coverage_percent: 0,
            supporting_excerpt: null as string | null,
            evidence_summary: 'No answer text was available for evidence extraction.'
        };
    }

    const normalizedAnswer = normalizeText(originalAnswer);
    const answerTokens = new Set(tokenize(originalAnswer));
    const keywords = uniqueStrings(
        (Array.isArray(idealKeywords) ? idealKeywords : [])
            .map((item) => String(item || '').trim())
            .filter(Boolean)
    );

    const matchedKeywords: string[] = [];
    const missingKeywords: string[] = [];

    for (const keyword of keywords) {
        const normalizedKeyword = normalizeText(keyword);
        const keywordTokens = tokenize(keyword);
        const fullyMatched = normalizedKeyword && normalizedAnswer.includes(normalizedKeyword);
        const partiallyMatched = keywordTokens.length > 0 && keywordTokens.every((token) => answerTokens.has(token));
        if (fullyMatched || partiallyMatched) {
            matchedKeywords.push(keyword);
        } else {
            missingKeywords.push(keyword);
        }
    }

    const sentences = sentenceSplit(originalAnswer);
    const prioritizedTerms = uniqueStrings([
        ...matchedKeywords,
        ...tokenize(questionText).slice(0, 6)
    ]);

    let supportingExcerpt = sentences[0] || originalAnswer.slice(0, 220);
    let bestScore = -1;

    for (const sentence of sentences) {
        const normalizedSentence = normalizeText(sentence);
        const score = prioritizedTerms.reduce((total, term) => {
            const normalizedTerm = normalizeText(term);
            return normalizedTerm && normalizedSentence.includes(normalizedTerm) ? total + 1 : total;
        }, 0);

        if (score > bestScore) {
            bestScore = score;
            supportingExcerpt = sentence;
        }
    }

    const coveragePercent = keywords.length
        ? Math.round((matchedKeywords.length / keywords.length) * 100)
        : null;

    let evidenceSummary = 'Answer evidence was generated from the saved response.';
    if (coveragePercent !== null) {
        evidenceSummary = coveragePercent >= 75
            ? 'The answer covered most of the expected concepts and included directly relevant evidence.'
            : coveragePercent >= 40
                ? 'The answer covered some expected concepts, but important supporting points were missing.'
                : 'The answer showed limited evidence of the expected concepts for this question.';
    }

    return {
        matched_keywords: matchedKeywords,
        missing_keywords: missingKeywords,
        keyword_coverage_percent: coveragePercent,
        supporting_excerpt: supportingExcerpt || null,
        evidence_summary: evidenceSummary
    };
}

function inferAdaptiveDecision(previousAnswer: any, audioMetrics: any, currentTopic: any) {
    const normalized = normalizeText(previousAnswer);
    const wordCount = normalized ? normalized.split(' ').filter(Boolean).length : 0;
    const confidence = Number(audioMetrics?.confidence_score || 0);
    const fluency = Number(audioMetrics?.fluency_score || 0);
    const fillerWords = Number(audioMetrics?.filler_words || 0);

    let strategy: 'clarify' | 'deepen' | 'simplify' | 'move_on' | 'recover' = 'clarify';
    let rationale = 'The next question should clarify the last answer and make it more concrete.';
    let difficultyAdjustment = 0;

    if (/(skip|pass this|move on|next question)/.test(normalized)) {
        strategy = 'move_on';
        rationale = 'The candidate chose to skip, so the interview should move to a different prompt gracefully.';
        difficultyAdjustment = -1;
    } else if (/(help me|hint|clue|guidance|i don t know|not sure|confused)/.test(normalized) || wordCount < 20 || (confidence > 0 && confidence < 5)) {
        strategy = 'simplify';
        rationale = 'The candidate appears unsure, so the next question should be narrower and easier to answer.';
        difficultyAdjustment = -1;
    } else if (wordCount >= 90 && confidence >= 7 && fluency >= 7) {
        strategy = 'deepen';
        rationale = 'The candidate handled the answer well, so the next question can probe trade-offs and deeper judgment.';
        difficultyAdjustment = 1;
    } else if (fillerWords >= 8 && wordCount < 45) {
        strategy = 'recover';
        rationale = 'The candidate struggled with delivery, so the next question should reset with a cleaner entry point.';
        difficultyAdjustment = -1;
    }

    return {
        strategy,
        rationale,
        focus_topic: String(currentTopic || '').trim() || null,
        answer_word_count: wordCount,
        confidence_score: Number.isFinite(confidence) ? confidence : null,
        fluency_score: Number.isFinite(fluency) ? fluency : null,
        filler_words: Number.isFinite(fillerWords) ? fillerWords : null,
        difficulty_adjustment: difficultyAdjustment
    };
}

const RESUME_SKILL_LEXICON = [
    'python', 'java', 'javascript', 'typescript', 'react', 'node', 'node js', 'nodejs',
    'sql', 'nosql', 'postgresql', 'mysql', 'mongodb', 'docker', 'kubernetes', 'aws',
    'azure', 'gcp', 'machine learning', 'deep learning', 'tensorflow', 'pytorch',
    'git', 'ci cd', 'graphql', 'redis', 'microservices', 'system design', 'linux'
];

function buildResumeSignals(resumeText: any, parsedSkills: any) {
    const normalizedResume = normalizeText(resumeText);
    const explicitSkills = uniqueStrings(
        (Array.isArray(parsedSkills) ? parsedSkills : [])
            .map((skill) => String(skill || '').trim().toLowerCase())
            .filter(Boolean)
    );
    const lexiconMatches = RESUME_SKILL_LEXICON.filter((skill) => normalizedResume.includes(normalizeText(skill)));
    const skillSet = uniqueStrings([...explicitSkills, ...lexiconMatches]);

    return {
        has_resume: Boolean(String(resumeText || '').trim()),
        normalized_resume: normalizedResume,
        skills: skillSet
    };
}

function buildResumeConsistency(answerText: any, resumeSignals: { has_resume: boolean; normalized_resume: string; skills: string[] }) {
    if (!resumeSignals?.has_resume) {
        return {
            available: false,
            alignment_status: 'unavailable',
            aligned_resume_signals: [] as string[],
            unverified_claims: [] as string[],
            summary: 'No resume was attached to this session, so consistency validation is unavailable.'
        };
    }

    const normalizedAnswer = normalizeText(answerText);
    const alignedSignals = resumeSignals.skills.filter((skill) => normalizedAnswer.includes(normalizeText(skill)));
    const unsupportedSignals = RESUME_SKILL_LEXICON
        .filter((skill) => normalizedAnswer.includes(normalizeText(skill)))
        .filter((skill) => !resumeSignals.skills.includes(skill));

    const alignmentStatus = unsupportedSignals.length > 0
        ? 'review'
        : alignedSignals.length > 0
            ? 'aligned'
            : 'neutral';

    let summary = 'The answer does not strongly reference resume-backed skills or projects.';
    if (alignmentStatus === 'aligned') {
        summary = 'The answer is consistent with skills or technologies already present in the resume.';
    } else if (alignmentStatus === 'review') {
        summary = 'The answer mentions technologies not clearly supported by the uploaded resume and may need verification.';
    }

    return {
        available: true,
        alignment_status: alignmentStatus,
        aligned_resume_signals: alignedSignals.slice(0, 8),
        unverified_claims: unsupportedSignals.slice(0, 8),
        summary
    };
}

function isBehavioralQuestion(question: any) {
    const topic = normalizeText(question?.topic);
    const text = normalizeText(question?.question_text);
    const behavioralTopics = ['behavioral', 'leadership', 'ownership', 'communication', 'stakeholder management', 'execution', 'conflict resolution'];
    const textSignals = [
        'tell me about a time',
        'describe a time',
        'walk me through a time',
        'difficult disagreement',
        'took ownership',
        'resolved it',
        'stakeholder',
        'team conflict'
    ];

    return behavioralTopics.some((item) => topic.includes(item)) || textSignals.some((item) => text.includes(item));
}

function extractStoryBankCard(question: any) {
    const answerText = String(question?.latest_answer?.answer_text || '').trim();
    if (!answerText || question?.latest_answer?.skipped || !isBehavioralQuestion(question)) {
        return null;
    }

    const sentences = sentenceSplit(answerText);
    const titleBase = String(question?.topic || 'Behavioral Story').trim() || 'Behavioral Story';
    const title = `${titleBase}: ${String(question?.question_text || 'Interview Example').slice(0, 54).trim()}`;
    const supportingExcerpt = sentences[0] || answerText.slice(0, 180);
    const outcomeSentence = sentences.find((sentence) => /(result|outcome|impact|improved|reduced|increased|delivered|shipped|resolved|learned)/i.test(sentence)) || null;
    const starSignals = {
        situation: /(team|project|client|production|deadline|stakeholder|issue|bug|system)/i.test(answerText),
        task: /(needed to|had to|was responsible|my role|task was|goal was)/i.test(answerText),
        action: /(i did|i led|i worked|i proposed|i implemented|i decided|i coordinated|i aligned)/i.test(answerText),
        result: /(result|outcome|impact|improved|reduced|increased|delivered|learned|resolved)/i.test(answerText)
    };
    const starCoverage = Object.values(starSignals).filter(Boolean).length;

    let coachingNote = 'Strong candidate story for behavioral reuse.';
    if (starCoverage < 3) {
        coachingNote = 'This story needs clearer STAR structure before reuse in a real interview.';
    } else if (!outcomeSentence) {
        coachingNote = 'Good story foundation, but add a stronger measurable outcome for better impact.';
    }

    return {
        question_id: question.id,
        title,
        topic: question.topic || 'Behavioral',
        source_question: question.question_text,
        supporting_excerpt: supportingExcerpt,
        outcome_highlight: outcomeSentence,
        star_coverage: starCoverage,
        star_breakdown: starSignals,
        coaching_note: coachingNote,
        score: question?.latest_answer?.score?.final_score ?? null
    };
}

async function buildAnswerRewrite(question: any) {
    const answerText = String(question?.latest_answer?.answer_text || '').trim();
    if (!answerText || question?.latest_answer?.skipped) {
        return null;
    }

    try {
        const response = await axios.post(`${ML_SERVICE_URL}/rewrite_answer`, {
            answer_text: answerText,
            question_text: question?.question_text || '',
            ideal_keywords: Array.isArray(question?.ideal_answer_keywords) ? question.ideal_answer_keywords : [],
            ideal_answer_text: question?.ideal_answer_text || null,
            feedback_text: question?.latest_answer?.score?.feedback_text || null
        });

        return {
            rewritten_answer: response.data?.rewritten_answer || answerText,
            rewrite_summary: response.data?.rewrite_summary || 'A polished version of the original answer was generated.'
        };
    } catch (error) {
        console.error('Failed to generate answer rewrite:', error);
        return {
            rewritten_answer: answerText,
            rewrite_summary: 'Rewrite generation is unavailable, so the original answer is shown here.'
        };
    }
}

// POST /interviews/start
router.post('/start', authenticate, async (req: AuthRequest, res) => {
    const { resumeId, topics } = req.body;
    const userId = req.user.id;
    console.log('Starting interview for user:', userId, 'resumeId:', resumeId);

    try {
        const interviewMode = normalizeInterviewMode(req.body.interviewMode);
        const includeMandatoryTopics = interviewMode === 'dsa_round';
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
        const liveCoachingEnabled = Boolean(req.body.liveCoachingEnabled);
        const pressureLevel = ['off', 'moderate', 'intense'].includes(String(req.body.pressureLevel || ''))
            ? String(req.body.pressureLevel)
            : 'off';

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
                    live_coaching_enabled: liveCoachingEnabled,
                    pressure_level: pressureLevel,
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

        const [{ data: question }, { data: session }] = await Promise.all([
            supabase
                .from('questions')
                .select('ideal_answer_keywords, question_text, ideal_answer_text, topic, difficulty_level')
                .eq('id', questionId)
                .single(),
            supabase
                .from('interview_sessions')
                .select('resume_profile_id, conversation_context')
                .eq('id', sessionId)
                .single()
        ]);

        const payload = {
            answer_text: answerText,
            audio_url: audioUrl,
            question_text: question?.question_text,
            ideal_keywords: question?.ideal_answer_keywords,
            ideal_answer_text: question?.ideal_answer_text
        };

        const scorePromise = (async () => {
            if (skippedByUser) {
                return {
                    semantic_score: 0,
                    grammar_score: 0,
                    keyword_score: 0,
                    final_score: 0,
                    feedback_text: "Question skipped by user."
                };
            }

            if (answerText && answerText.trim()) {
                try {
                    const response = await withTimeout(
                        axios.post(`${ML_SERVICE_URL}/score_answer`, payload),
                        SCORE_ANSWER_TIMEOUT_MS,
                        'Scoring timed out'
                    );
                    return response.data;
                } catch (mlErr) {
                    console.error("ML scoring unavailable or slow:", mlErr);
                    return {
                        semantic_score: 0,
                        grammar_score: 0,
                        keyword_score: 0,
                        final_score: 0,
                        feedback_text: "Answer saved. Detailed scoring is taking longer than expected."
                    };
                }
            }

            if (audioUrl) {
                return {
                    semantic_score: 0,
                    grammar_score: 0,
                    keyword_score: 0,
                    final_score: 0,
                    feedback_text: "Voice answer recorded. Detailed analysis available in voice metrics."
                };
            }

            throw new Error("No answer text or audio provided");
        })();

        const nextQuestionPromise = (async () => {
            let nextQuestion = null;
            let adaptiveDecision = null;
            try {
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
                let difficultyHint = avgScore >= 8 ? 4 : avgScore >= 6 ? 3 : 2;
                const answerForContext = skippedByUser ? "User skipped this question." : String(answerText || "");
                const userSignals = detectConversationSignals(answerForContext);
                adaptiveDecision = inferAdaptiveDecision(answerForContext, req.body.voiceMetrics || null, question?.topic || null);
                difficultyHint = Math.max(1, Math.min(5, difficultyHint + Number(adaptiveDecision?.difficulty_adjustment || 0)));

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

                const configuredMode = normalizeInterviewMode(session?.conversation_context?.interview_mode);
                const includeMandatoryTopics = configuredMode === 'dsa_round';
                const contextTopicsWithTechnical = withMandatoryTechnicalTopics(contextTopics, includeMandatoryTopics);
                const { data: askedQuestionRows } = await supabase
                    .from('questions')
                    .select('question_text')
                    .eq('session_id', sessionId)
                    .order('created_at', { ascending: true });
                const askedQuestions = (askedQuestionRows || [])
                    .map((row: any) => String(row.question_text || '').trim())
                    .filter(Boolean);

                const contextualResponse = await withTimeout(
                    axios.post(`${ML_SERVICE_URL}/conversation/generate_contextual_questions`, {
                        user_intro_analysis: {
                            ...(session?.conversation_context || {}),
                            user_signals: userSignals,
                            adaptive_context: adaptiveDecision,
                            interview_mode: configuredMode,
                            mode_prompt: modePrompt(configuredMode)
                        },
                        resume_text: resumeText,
                        selected_topics: withMandatoryTechnicalTopics([question?.topic || contextTopicsWithTechnical[0] || 'General'], includeMandatoryTopics),
                        count: 1,
                        difficulty_hint: difficultyHint,
                        previous_answer: answerForContext,
                        audio_metrics: req.body.voiceMetrics || null,
                        conversation_history: conversationHistory,
                        asked_questions: askedQuestions,
                        diversity_nonce: `${configuredMode}-${sessionId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
                    }),
                    NEXT_QUESTION_TIMEOUT_MS,
                    'Next question generation timed out'
                );

                const generatedQuestions = Array.isArray(contextualResponse.data?.questions) ? contextualResponse.data.questions : [];
                const q = generatedQuestions[0] && String(generatedQuestions[0]?.question_text || '').trim()
                    ? generatedQuestions[0]
                    : buildFallbackQuestion(question?.topic || contextTopicsWithTechnical[0] || 'General', difficultyHint, configuredMode);

                if (q && String(q.question_text || '').trim()) {
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
                    }
                }

                try {
                    const existingContext = session?.conversation_context || {};
                    const adaptiveHistory = Array.isArray(existingContext?.adaptive_history) ? existingContext.adaptive_history.slice(-11) : [];
                    adaptiveHistory.push({
                        created_at: new Date().toISOString(),
                        previous_topic: question?.topic || null,
                        next_question_id: nextQuestion?.id || null,
                        next_question_text: nextQuestion?.question_text || null,
                        strategy: adaptiveDecision?.strategy || null,
                        rationale: adaptiveDecision?.rationale || null,
                        difficulty: difficultyHint
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
                } catch (adaptivePersistErr) {
                    console.error('Failed to persist adaptive history for answer flow:', adaptivePersistErr);
                }
            } catch (genErr) {
                console.error("Failed to generate next question:", genErr);
            }

            return { nextQuestion, adaptiveDecision };
        })();

        const [mlResponse, nextQuestionResult] = await Promise.all([scorePromise, nextQuestionPromise]);

        const writeOperations: Promise<any>[] = [
            Promise.resolve(
                supabase
                    .from('ai_scores')
                    .insert([{
                        answer_id: answer.id,
                        semantic_score: mlResponse.semantic_score,
                        grammar_score: mlResponse.grammar_score,
                        keyword_score: mlResponse.keyword_score,
                        final_score: mlResponse.final_score,
                        feedback_text: mlResponse.feedback_text
                    }])
            )
        ];

        if (req.body.voiceMetrics) {
            const vm = req.body.voiceMetrics;
            writeOperations.push(
                Promise.resolve(
                    supabase
                        .from('confidence_metrics')
                        .insert([{
                            answer_id: answer.id,
                            wpm: vm.wpm,
                            filler_word_count: vm.filler_words,
                            pause_duration: vm.pause_duration,
                            fluency_score: vm.fluency_score,
                            confidence_score: vm.confidence_score
                        }])
                )
            );
        }

        const writeResults = await Promise.allSettled(writeOperations);
        for (const result of writeResults) {
            if (result.status === 'fulfilled' && result.value?.error) {
                console.error('Background write failed:', result.value.error);
            } else if (result.status === 'rejected') {
                console.error('Background write rejected:', result.reason);
            }
        }

        res.json({
            answer,
            evaluation: mlResponse,
            next_question: nextQuestionResult.nextQuestion,
            adaptive_decision: nextQuestionResult.adaptiveDecision
        });

    } catch (error: any) {
        console.error("POST /interviews/answer failed:", error);
        res.status(500).json({
            error: error?.message || "Failed to submit answer",
            details: error?.details || null,
            hint: error?.hint || null
        });
    }
});

router.post('/answer-metrics', authenticate, async (req: AuthRequest, res) => {
    const { answerId, voiceMetrics } = req.body || {};

    if (!answerId || !voiceMetrics) {
        return res.status(400).json({ error: 'answerId and voiceMetrics are required' });
    }

    try {
        const { data: answerRow, error: answerError } = await supabase
            .from('answers')
            .select('id, session_id')
            .eq('id', answerId)
            .single();

        if (answerError || !answerRow) {
            return res.status(404).json({ error: 'Answer not found' });
        }

        const { data: sessionRow, error: sessionError } = await supabase
            .from('interview_sessions')
            .select('id, user_id')
            .eq('id', answerRow.session_id)
            .single();

        if (sessionError || !sessionRow) {
            return res.status(404).json({ error: 'Interview session not found for answer' });
        }

        if (sessionRow.user_id !== req.user.id) {
            return res.status(403).json({ error: 'You are not allowed to update this answer' });
        }

        const vm = voiceMetrics;
        const { error: deleteError } = await supabase
            .from('confidence_metrics')
            .delete()
            .eq('answer_id', answerId);

        if (deleteError) {
            console.error('Failed to clear previous answer metrics:', deleteError);
        }

        const { error: insertError } = await supabase
            .from('confidence_metrics')
            .insert([{
                answer_id: answerId,
                wpm: vm.wpm,
                filler_word_count: vm.filler_words,
                pause_duration: vm.pause_duration,
                pitch_variance: vm.pitch_variance,
                volume_consistency: vm.volume_consistency,
                fluency_score: vm.fluency_score,
                confidence_score: vm.confidence_score
            }]);

        if (insertError) {
            console.error('Failed to insert answer metrics:', insertError);
            return res.status(500).json({ error: insertError.message || 'Failed to save answer metrics' });
        }

        return res.json({ success: true });
    } catch (error: any) {
        console.error('POST /interviews/answer-metrics failed:', error);
        return res.status(500).json({ error: error?.message || 'Failed to save answer metrics' });
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
        const { data: session, error: sessionError } = await supabase
            .from('interview_sessions')
            .select('*')
            .eq('id', sessionId)
            .single();

        if (sessionError) throw sessionError;

        let resumeProfile: any = null;
        if (session?.resume_profile_id) {
            const { data: profile } = await supabase
                .from('resume_profiles')
                .select('resume_text, parsed_skills')
                .eq('id', session.resume_profile_id)
                .single();
            resumeProfile = profile || null;
        }
        const resumeSignals = buildResumeSignals(resumeProfile?.resume_text, resumeProfile?.parsed_skills);

        const { data: questions, error: qError } = await supabase
            .from('questions')
            .select(`
                *,
                answers (
                    *,
                    ai_scores (*),
                    confidence_metrics (*)
                )
            `)
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });

        if (qError) throw qError;
        const { data: conversationTurns } = await supabase
            .from('conversation_turns')
            .select('speaker, message_text, created_at')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });

        const normalizedQuestions = (questions || []).map((q: any, index: number) => {
            const sortedAnswers = [...(q.answers || [])].sort((a: any, b: any) => {
                const aTs = new Date(a.created_at || 0).getTime();
                const bTs = new Date(b.created_at || 0).getTime();
                return bTs - aTs;
            });
            const latestAnswer = sortedAnswers[0] || null;
            const latestScore = latestAnswer?.ai_scores?.[0] || null;
            const latestMetrics = latestAnswer?.confidence_metrics?.[0] || null;
            const latestText = String(latestAnswer?.answer_text || latestAnswer?.transcript || '').trim();
            const answerEvidence = buildAnswerEvidence(latestText, q.ideal_answer_keywords, q.question_text);
            const resumeConsistency = buildResumeConsistency(latestText, resumeSignals);

            return {
                ...q,
                order: index + 1,
                answers: sortedAnswers,
                latest_answer: latestAnswer ? {
                    id: latestAnswer.id,
                    answer_text: latestText || null,
                    transcript: latestAnswer?.transcript || null,
                    audio_url: latestAnswer?.audio_url || null,
                    created_at: latestAnswer?.created_at || null,
                    skipped: latestText.startsWith(SKIP_ANSWER_MARKER),
                    score: latestScore ? {
                        semantic_score: toNumber(latestScore.semantic_score),
                        grammar_score: toNumber(latestScore.grammar_score),
                        keyword_score: toNumber(latestScore.keyword_score),
                        final_score: toNumber(latestScore.final_score),
                        feedback_text: latestScore.feedback_text || null
                    } : null,
                    voice_metrics: latestMetrics ? {
                        wpm: toNumber(latestMetrics.wpm),
                        filler_word_count: toNumber(latestMetrics.filler_word_count),
                        pause_duration: toNumber(latestMetrics.pause_duration),
                        fluency_score: toNumber(latestMetrics.fluency_score),
                        confidence_score: toNumber(latestMetrics.confidence_score)
                    } : null,
                    evidence: answerEvidence,
                    resume_consistency: resumeConsistency
                } : null
            };
        });

        const askedQuestions = normalizedQuestions.filter((q: any) => (q.answers || []).length > 0);
        const sessionDiscussionQuestions = askedQuestions.map((q: any, index: number) => ({
            ...q,
            order: index + 1
        }));

        const qa_history_base = sessionDiscussionQuestions.map((q: any, index: number) => {
            const latestAnswer = q.latest_answer || null;
            return {
                order: index + 1,
                question_id: q.id,
                question_text: q.question_text,
                topic: q.topic,
                difficulty_level: q.difficulty_level,
                asked_at: q.created_at || null,
                attempts: (q.answers || []).length,
                latest_answer_text: latestAnswer?.answer_text || null,
                latest_answer_created_at: latestAnswer?.created_at || null,
                skipped: Boolean(latestAnswer?.skipped),
                latest_score: latestAnswer?.score || null
            };
        });

        const answeredQuestions = sessionDiscussionQuestions.filter((q: any) => !q.latest_answer?.skipped);
        const skippedQuestions = sessionDiscussionQuestions.filter((q: any) => q.latest_answer?.skipped);
        const userIntroAnswer = String(session?.user_intro_summary || '').trim();
        const introAiTurn = (conversationTurns || []).find((turn: any) => turn?.speaker === 'ai');
        const introUserTurn = (conversationTurns || []).find((turn: any) => turn?.speaker === 'user');
        const introReportQuestion = userIntroAnswer ? {
            id: `intro-${sessionId}`,
            order: 1,
            question_text: 'Please introduce yourself and share your background.',
            topic: 'Introduction',
            difficulty_level: null,
            asked_at: introAiTurn?.created_at || session?.start_time || null,
            attempts: 1,
            answer: {
                id: `intro-answer-${sessionId}`,
                answer_text: userIntroAnswer,
                transcript: userIntroAnswer,
                audio_url: null,
                created_at: introUserTurn?.created_at || null,
                skipped: false,
                score: null,
                voice_metrics: null,
                evidence: buildAnswerEvidence(userIntroAnswer, [], 'Please introduce yourself and share your background.'),
                resume_consistency: buildResumeConsistency(userIntroAnswer, resumeSignals)
            },
            answer_rewrite: {
                rewritten_answer: userIntroAnswer,
                rewrite_summary: 'This is the candidate introduction captured at the start of the interview.'
            }
        } : null;
        const qa_history = [
            ...(introReportQuestion ? [{
                order: 1,
                question_id: introReportQuestion.id,
                question_text: introReportQuestion.question_text,
                topic: introReportQuestion.topic,
                difficulty_level: introReportQuestion.difficulty_level,
                asked_at: introReportQuestion.asked_at,
                attempts: 1,
                latest_answer_text: userIntroAnswer,
                latest_answer_created_at: introReportQuestion.answer.created_at,
                skipped: false,
                latest_score: null
            }] : []),
            ...qa_history_base.map((item: any, index: number) => ({
                ...item,
                order: index + (introReportQuestion ? 2 : 1)
            }))
        ];
        const scoredAnswers = answeredQuestions
            .map((q: any) => q.latest_answer?.score)
            .filter(Boolean);
        const voiceEntries = answeredQuestions
            .map((q: any) => q.latest_answer)
            .filter((answer: any) => answer?.voice_metrics);

        const topicMap = new Map<string, { count: number; scores: number[] }>();
        for (const question of answeredQuestions) {
            const topic = String(question.topic || 'General').trim() || 'General';
            const finalScore = toNumber(question.latest_answer?.score?.final_score);
            if (!topicMap.has(topic)) {
                topicMap.set(topic, { count: 0, scores: [] });
            }
            const current = topicMap.get(topic)!;
            current.count += 1;
            if (finalScore !== null) current.scores.push(finalScore);
        }

        const topic_breakdown = Array.from(topicMap.entries())
            .map(([topic, meta]) => ({
                topic,
                questions_answered: meta.count,
                average_score: average(meta.scores)
            }))
            .sort((a, b) => (b.average_score || 0) - (a.average_score || 0));

        const average_final_score = average(scoredAnswers.map((score: any) => toNumber(score.final_score)));
        const communication = {
            avg_wpm: average(voiceEntries.map((entry: any) => entry.voice_metrics?.wpm)),
            avg_fluency_score: average(voiceEntries.map((entry: any) => entry.voice_metrics?.fluency_score)),
            avg_confidence_score: average(voiceEntries.map((entry: any) => entry.voice_metrics?.confidence_score)),
            avg_pause_duration: average(voiceEntries.map((entry: any) => entry.voice_metrics?.pause_duration)),
            avg_filler_word_count: average(voiceEntries.map((entry: any) => entry.voice_metrics?.filler_word_count))
        };

        const start = session?.start_time ? new Date(session.start_time).getTime() : null;
        const end = session?.end_time ? new Date(session.end_time).getTime() : null;
        const durationMinutes = start && end && end >= start
            ? Number(((end - start) / 60000).toFixed(1))
            : null;

        const reportQuestionsBase = sessionDiscussionQuestions.map((q: any) => ({
            id: q.id,
            order: q.order,
            question_text: q.question_text,
            topic: q.topic,
            difficulty_level: q.difficulty_level,
            asked_at: q.created_at || null,
            attempts: (q.answers || []).length,
            answer: q.latest_answer
        }));
        const evaluated_report_questions = await Promise.all(
            reportQuestionsBase.map(async (q: any) => ({
                ...q,
                answer_rewrite: await buildAnswerRewrite(q)
            }))
        );
        const report_questions = [
            ...(introReportQuestion ? [introReportQuestion] : []),
            ...evaluated_report_questions.map((q: any, index: number) => ({
                ...q,
                order: index + (introReportQuestion ? 2 : 1)
            }))
        ];

        const stats = {
            total_questions_asked: sessionDiscussionQuestions.length + (introReportQuestion ? 1 : 0),
            answered_questions: answeredQuestions.length + (introReportQuestion ? 1 : 0),
            skipped_questions: skippedQuestions.length,
            audio_answers: answeredQuestions.filter((q: any) => q.latest_answer?.audio_url).length,
            text_answers: answeredQuestions.filter((q: any) => !q.latest_answer?.audio_url).length + (introReportQuestion ? 1 : 0),
            completion_rate: sessionDiscussionQuestions.length + (introReportQuestion ? 1 : 0)
                ? Number((((answeredQuestions.length + (introReportQuestion ? 1 : 0)) / (sessionDiscussionQuestions.length + (introReportQuestion ? 1 : 0))) * 100).toFixed(1))
                : 0,
            average_final_score,
            average_semantic_score: average(scoredAnswers.map((score: any) => toNumber(score.semantic_score))),
            average_grammar_score: average(scoredAnswers.map((score: any) => toNumber(score.grammar_score))),
            average_keyword_score: average(scoredAnswers.map((score: any) => toNumber(score.keyword_score))),
            duration_minutes: durationMinutes
        };

        const adaptiveHistory = Array.isArray(session?.conversation_context?.adaptive_history)
            ? session.conversation_context.adaptive_history
            : [];
        const adaptiveStrategyCounts = adaptiveHistory.reduce((acc: Record<string, number>, item: any) => {
            const key = String(item?.strategy || '').trim();
            if (!key) return acc;
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});

        const adaptive_summary = {
            total_adaptive_followups: adaptiveHistory.length,
            strategies: adaptiveStrategyCounts,
            recent_decisions: adaptiveHistory.slice(-5).reverse()
        };

        const story_bank = answeredQuestions
            .map((question: any) => extractStoryBankCard(question))
            .filter(Boolean)
            .sort((a: any, b: any) => (Number(b?.score || 0) - Number(a?.score || 0)));
        const story_bank_summary = {
            total_stories: story_bank.length,
            strongest_story_title: story_bank[0]?.title || null,
            stories_needing_structure_work: story_bank.filter((story: any) => Number(story?.star_coverage || 0) < 3).length
        };

        const consistencyAnswers = answeredQuestions
            .map((q: any) => q.latest_answer?.resume_consistency)
            .filter((item: any) => item?.available);
        const resume_consistency_summary = {
            available: Boolean(resumeSignals.has_resume),
            aligned_answers: consistencyAnswers.filter((item: any) => item.alignment_status === 'aligned').length,
            review_answers: consistencyAnswers.filter((item: any) => item.alignment_status === 'review').length,
            neutral_answers: consistencyAnswers.filter((item: any) => item.alignment_status === 'neutral').length,
            top_verified_signals: uniqueStrings(
                consistencyAnswers.flatMap((item: any) => Array.isArray(item.aligned_resume_signals) ? item.aligned_resume_signals : [])
            ).slice(0, 8),
            top_unverified_claims: uniqueStrings(
                consistencyAnswers.flatMap((item: any) => Array.isArray(item.unverified_claims) ? item.unverified_claims : [])
            ).slice(0, 8)
        };

        const summary = {
            headline: summarizeScore(average_final_score),
            strongest_topic: topic_breakdown[0]?.topic || null,
            improvement_topic: topic_breakdown.length > 1 ? topic_breakdown[topic_breakdown.length - 1]?.topic : null
        };

        const benchmark = getBenchmarkProfile(session?.conversation_context?.interview_mode);

        let cross_session_weakness_tracking = null;
        try {
            const { data: userSessions } = await supabase
                .from('interview_sessions')
                .select('id, user_id, start_time')
                .eq('user_id', session.user_id)
                .order('start_time', { ascending: false })
                .limit(8);

            const otherSessionIds = (userSessions || []).map((item: any) => item.id);
            if (otherSessionIds.length > 0) {
                const { data: priorAnswers } = await supabase
                    .from('answers')
                    .select('session_id, ai_scores(final_score), questions(topic)')
                    .in('session_id', otherSessionIds);

                const priorTopicMap: Record<string, number[]> = {};
                (priorAnswers || []).forEach((item: any) => {
                    const score = Number(item?.ai_scores?.[0]?.final_score || 0);
                    const topic = String(item?.questions?.topic || 'General');
                    if (!score) return;
                    if (!priorTopicMap[topic]) priorTopicMap[topic] = [];
                    priorTopicMap[topic].push(score);
                });

                const recurringWeakTopics = Object.keys(priorTopicMap)
                    .map((topic) => ({
                        topic,
                        averageScore: average(priorTopicMap[topic]) ?? 0,
                        occurrences: priorTopicMap[topic].length
                    }))
                    .filter((item) => item.occurrences >= 2 && item.averageScore < 65)
                    .sort((a, b) => Number(a.averageScore || 0) - Number(b.averageScore || 0))
                    .slice(0, 3);

                cross_session_weakness_tracking = {
                    recurring_weak_topics: recurringWeakTopics
                };
            }
        } catch (crossSessionErr) {
            console.error('Failed to build cross-session weakness tracking for report:', crossSessionErr);
        }

        const benchmark_comparison = {
            profile: benchmark,
            deltas: {
                overall: Number((Number(average_final_score || 0) - benchmark.overall_target).toFixed(1)),
                semantic: Number((Number(stats.average_semantic_score || 0) - benchmark.semantic_target).toFixed(1)),
                grammar: Number((Number(stats.average_grammar_score || 0) - benchmark.grammar_target).toFixed(1)),
                keyword: Number((Number(stats.average_keyword_score || 0) - benchmark.keyword_target).toFixed(1)),
                confidence: Number((((Number(communication.avg_confidence_score || 0)) - benchmark.confidence_target)).toFixed(1))
            }
        };

        const readiness = computeReadinessScore({
            averageFinalScore: average_final_score,
            communication,
            resumeConsistencySummary: resume_consistency_summary,
            adaptiveSummary: adaptive_summary,
            crossSessionWeaknessTracking: cross_session_weakness_tracking
        });

        const coding_round = session?.conversation_context?.coding_round || null;
        const coding_round_history = Array.isArray(session?.conversation_context?.coding_round_history)
            ? session.conversation_context.coding_round_history
            : [];

        res.json({
            session,
            questions: sessionDiscussionQuestions,
            qa_history,
            report_questions,
            stats,
            communication,
            topic_breakdown,
            adaptive_summary,
            story_bank,
            story_bank_summary,
            resume_consistency_summary,
            cross_session_weakness_tracking,
            benchmark_comparison,
            readiness,
            summary,
            coding_round,
            coding_round_history
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
