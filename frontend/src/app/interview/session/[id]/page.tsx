'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import axios from 'axios';
import { Volume2, Loader2, Send, X, Sparkles } from 'lucide-react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
const ML_URL = process.env.NEXT_PUBLIC_ML_URL || 'http://localhost:8000';

type Phase = 'ai_intro' | 'user_intro' | 'questioning' | 'complete';
type Turn = 'ai' | 'user';
type RecordingMode = 'user_intro' | 'questioning';

interface AudioMetrics {
    transcript: string;
    emotion: string;
    confidence_score: number;
    gaps: Array<{ start: number; end: number; duration: number }>;
    fluency_score: number;
    wpm: number;
    filler_words: number;
    pitch_variance?: number;
    volume_consistency?: number;
}

interface Question {
    id: string;
    question_text: string;
    audio_base64?: string;
    topic?: string;
    difficulty?: number;
}

interface AdaptiveDecision {
    strategy: 'clarify' | 'deepen' | 'simplify' | 'move_on' | 'recover';
    rationale: string;
    focus_topic?: string | null;
    difficulty_adjustment?: number;
}

type CoachStyleMode = 'supportive' | 'balanced' | 'strict';
type PressureLevel = 'off' | 'moderate' | 'intense';

const SILENCE_THRESHOLD = 0.02;
const SILENCE_HOLD_MS = 5000;
const NO_SPEECH_TIMEOUT_MS = 5000;
const MAX_RECORDING_MS = 90000;
const MAX_NO_RESPONSE_ATTEMPTS = 2;
const CODING_ROUND_TRIGGER_AFTER_ANSWERS = 2;
const CODING_ENABLED_MODES = new Set(['balanced', 'dsa_round', 'system_design', 'rapid_fire']);
const SKIP_ANSWER_MARKER = '[SKIPPED_BY_USER]';

const ENCOURAGEMENT_MESSAGES = [
    "No worries, you might be thinking. Take your time. If you don't know, you can say skip this question.",
    "It's absolutely okay. If you want, just say skip this question and we will move ahead."
];
const FEMALE_VOICE_HINTS = ['jenny', 'aria', 'zira', 'sara', 'emma', 'female', 'woman'];

const normalizeText = (value: string) => value.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

const isSkipIntent = (text?: string | null) => {
    const normalized = normalizeText(text || '');
    if (!normalized) return false;
    return (
        normalized === 'skip' ||
        normalized.includes('skip this question') ||
        normalized.includes('skip question') ||
        normalized.includes('skip this') ||
        normalized.includes('can i skip') ||
        normalized.includes('i want to skip') ||
        normalized.includes('pass this question') ||
        normalized.includes('pass this')
    );
};

const formatAdaptiveNotice = (decision: AdaptiveDecision) => {
    const labels: Record<AdaptiveDecision['strategy'], string> = {
        deepen: 'Adaptive follow-up: going deeper based on your previous answer.',
        clarify: 'Adaptive follow-up: asking for more specificity from your previous answer.',
        simplify: 'Adaptive follow-up: narrowing the scope to support a clearer response.',
        move_on: 'Adaptive follow-up: moving to a new prompt after your skip request.',
        recover: 'Adaptive follow-up: resetting with a cleaner question to help you recover.'
    };

    return `${labels[decision.strategy]} ${decision.rationale}`;
};

const getPressureConfig = (pressureLevel: PressureLevel) => {
    if (pressureLevel === 'intense') {
        return {
            label: 'Intense Pressure',
            maxRecordingMs: 45000,
            noSpeechTimeoutMs: 3000,
            silenceHoldMs: 3000,
            banner: 'Fast-paced simulation: keep answers concise and decisive.'
        };
    }
    if (pressureLevel === 'moderate') {
        return {
            label: 'Moderate Pressure',
            maxRecordingMs: 60000,
            noSpeechTimeoutMs: 4000,
            silenceHoldMs: 4000,
            banner: 'Moderate pressure simulation: prioritize structure and brevity.'
        };
    }
    return {
        label: 'Pressure Off',
        maxRecordingMs: MAX_RECORDING_MS,
        noSpeechTimeoutMs: NO_SPEECH_TIMEOUT_MS,
        silenceHoldMs: SILENCE_HOLD_MS,
        banner: ''
    };
};

const buildLiveCoachingCues = ({
    transcript,
    metrics,
    feedback,
    question,
    coachStyle
}: {
    transcript: string;
    metrics: AudioMetrics | null;
    feedback: any;
    question: Question | null;
    coachStyle: CoachStyleMode;
}) => {
    const cues: string[] = [];
    const normalized = normalizeText(transcript || '');
    const wordCount = normalized ? normalized.split(' ').filter(Boolean).length : 0;
    const questionText = normalizeText(question?.question_text || '');
    const topic = normalizeText(question?.topic || '');
    const isBehavioral = topic.includes('behavioral') || topic.includes('leadership') || questionText.includes('tell me about a time') || questionText.includes('describe a time');

    if (wordCount < 30) {
        cues.push(isBehavioral
            ? 'Add more detail: give context, your action, and the result.'
            : 'Add more depth: explain your approach, trade-offs, and the final takeaway.');
    }
    if (metrics?.filler_words && metrics.filler_words >= 6) {
        cues.push('Reduce filler words and finish one point cleanly before starting the next.');
    }
    if (metrics?.wpm && metrics.wpm > 175) {
        cues.push('Slow down slightly so the interviewer can follow your reasoning.');
    } else if (metrics?.wpm && metrics.wpm < 95) {
        cues.push('Increase your pace a little to sound more confident and conversational.');
    }
    if (metrics?.confidence_score && metrics.confidence_score < 6) {
        cues.push('Lead with your main point first, then add supporting details to sound more confident.');
    }
    if (isBehavioral && !/(result|impact|learned|improved|reduced|increased|delivered|resolved)/.test(normalized)) {
        cues.push('Close the story with a clear outcome or measurable impact.');
    }
    if (!isBehavioral && !/(trade off|tradeoff|complexity|edge case|assumption)/.test(normalized)) {
        cues.push('Mention trade-offs, complexity, or assumptions explicitly for stronger technical answers.');
    }
    if (typeof feedback?.feedback_text === 'string' && /specific|concrete|example/i.test(feedback.feedback_text)) {
        cues.push('Use one concrete example instead of staying abstract.');
    }

    const unique = Array.from(new Set(cues)).slice(0, 3);
    if (!unique.length) {
        unique.push(coachStyle === 'strict'
            ? 'Your answer is acceptable, but tighten structure and make the opening sentence sharper.'
            : 'Good answer overall. Keep the same structure and make the next response equally clear.');
    }

    return unique;
};

export default function InterviewSession() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const sessionId = params.id as string;

    const [sessionToken, setSessionToken] = useState<string | null>(null);
    const [phase, setPhase] = useState<Phase>('ai_intro');
    const [turn, setTurn] = useState<Turn>('ai');
    const [questions, setQuestions] = useState<Question[]>([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [aiIntroText, setAiIntroText] = useState('');
    const [isPlayingAudio, setIsPlayingAudio] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [micLevel, setMicLevel] = useState(0);
    const [textAnswer, setTextAnswer] = useState('');
    const [audioMetrics, setAudioMetrics] = useState<AudioMetrics | null>(null);
    const [feedback, setFeedback] = useState<any>(null);
    const [adaptiveDecision, setAdaptiveDecision] = useState<AdaptiveDecision | null>(null);
    const [spokenAnswersCount, setSpokenAnswersCount] = useState(0);
    const [codingRoundCompleted, setCodingRoundCompleted] = useState(false);
    const [codingRoundEnabled, setCodingRoundEnabled] = useState(true);
    const [sessionNotice, setSessionNotice] = useState<string | null>(null);
    const [clockText, setClockText] = useState('--:--:--');
    const [liveCoachingEnabled, setLiveCoachingEnabled] = useState(false);
    const [coachStyleMode, setCoachStyleMode] = useState<CoachStyleMode>('balanced');
    const [liveCoachingCues, setLiveCoachingCues] = useState<string[]>([]);
    const [pressureLevel, setPressureLevel] = useState<PressureLevel>('off');

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const maxRecordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const silenceStartedAtRef = useRef<number | null>(null);
    const speechDetectedRef = useRef(false);
    const hasInitializedRef = useRef(false);
    const activeQuestionIdRef = useRef<string | null>(null);
    const recordingModeRef = useRef<RecordingMode | null>(null);
    const recordingQuestionIdRef = useRef<string | null>(null);
    const sessionTokenRef = useRef<string | null>(null);
    const recordingStartedAtRef = useRef<number | null>(null);
    const stopReasonRef = useRef<'manual' | 'silence' | 'timeout' | 'no_speech_timeout' | null>(null);
    const noResponseAttemptsRef = useRef(0);
    const isEndingRef = useRef(false);
    const pendingTimeoutsRef = useRef<number[]>([]);
    const latestTranscriptRef = useRef('');
    const micLevelRef = useRef(0);
    const lastMicUiUpdateRef = useRef(0);
    const codingTransitionActiveRef = useRef(false);
    const isPlayingAudioRef = useRef(false);
    const setAudioPlaybackState = (playing: boolean) => {
        isPlayingAudioRef.current = playing;
        setIsPlayingAudio(playing);
    };

    const applySessionRuntimeConfig = (sessionPayload: any) => {
        const context = sessionPayload?.conversation_context || {};
        const mode = String(context?.interview_mode || 'balanced');
        setCodingRoundEnabled(CODING_ENABLED_MODES.has(mode));
        setLiveCoachingEnabled(Boolean(context?.live_coaching_enabled));
        const style = String(context?.coach_style || 'balanced');
        setCoachStyleMode(style === 'supportive' || style === 'strict' ? style : 'balanced');
        const pressure = String(context?.pressure_level || 'off');
        setPressureLevel(pressure === 'moderate' || pressure === 'intense' ? pressure : 'off');
    };

    useEffect(() => {
        isEndingRef.current = false;
        codingTransitionActiveRef.current = false;
        if (hasInitializedRef.current) {
            return;
        }
        hasInitializedRef.current = true;

        const initSession = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) {
                    router.push('/login');
                    return;
                }
                setSessionToken(session.access_token);
                sessionTokenRef.current = session.access_token;
                try {
                    const sessionResponse = await axios.get(
                        `${BACKEND_URL}/interviews/${sessionId}`,
                        { headers: { Authorization: `Bearer ${session.access_token}` } }
                    );
                    applySessionRuntimeConfig(sessionResponse.data?.session);
                } catch (sessionConfigErr) {
                    console.error('Failed to load session runtime config:', sessionConfigErr);
                }
                const resumedFromCoding =
                    searchParams.get('resumeFromCoding') === '1' ||
                    (typeof window !== 'undefined' && sessionStorage.getItem(`ic_coding_done_${sessionId}`) === '1');
                if (resumedFromCoding) {
                    codingTransitionActiveRef.current = false;
                    setCodingRoundCompleted(true);
                    const serverQuestions = await hydrateQuestionsFromServer();
                    if (serverQuestions.length) {
                        const pendingId = typeof window !== 'undefined'
                            ? sessionStorage.getItem(`ic_pending_question_${sessionId}`)
                            : null;
                        let resumeIndex = serverQuestions.length - 1;
                        if (pendingId) {
                            const foundIndex = serverQuestions.findIndex((q) => q.id === pendingId);
                            if (foundIndex >= 0) resumeIndex = foundIndex;
                        }
                        setCurrentQuestionIndex(resumeIndex);
                        const resumeQuestion = serverQuestions[resumeIndex];
                        activeQuestionIdRef.current = resumeQuestion?.id || null;
                        setPhase('questioning');
                        setTurn('ai');
                        if (typeof window !== 'undefined') {
                            sessionStorage.removeItem(`ic_pending_question_${sessionId}`);
                            sessionStorage.removeItem(`ic_coding_done_${sessionId}`);
                        }
                        if (resumeQuestion?.audio_base64) {
                            playAudioFromBase64(
                                resumeQuestion.audio_base64,
                                () => beginUserTurn('questioning', resumeQuestion.id),
                                resumeQuestion.question_text
                            );
                        } else if (resumeQuestion?.question_text) {
                            speakWithPreferredFemaleVoice(
                                resumeQuestion.question_text,
                                () => beginUserTurn('questioning', resumeQuestion.id)
                            );
                        } else if (resumeQuestion?.id) {
                            scheduleManagedTimeout(() => beginUserTurn('questioning', resumeQuestion.id), 300);
                        }
                        return;
                    }

                    // Recovery path: if question list is unavailable, generate the next question dynamically.
                    try {
                        const recoveryResponse = await axios.post(
                            `${BACKEND_URL}/conversation/next-question`,
                            {
                                sessionId,
                                previousAnswer: typeof window !== 'undefined'
                                    ? (sessionStorage.getItem('ic_latest_transcript') || 'Continue interview after coding round')
                                    : 'Continue interview after coding round',
                                audioMetrics: null,
                                currentTopic: null
                            },
                            { headers: { Authorization: `Bearer ${session.access_token}` } }
                        );

                        const recoveredQuestion = recoveryResponse.data?.question;
                        if (recoveredQuestion?.id) {
                            setQuestions([recoveredQuestion]);
                            setCurrentQuestionIndex(0);
                            activeQuestionIdRef.current = recoveredQuestion.id;
                            setPhase('questioning');
                            setTurn('ai');
                            if (typeof window !== 'undefined') {
                                sessionStorage.removeItem(`ic_pending_question_${sessionId}`);
                                sessionStorage.removeItem(`ic_coding_done_${sessionId}`);
                            }
                            speakWithPreferredFemaleVoice(
                                recoveredQuestion.question_text || 'Let us continue the interview.',
                                () => beginUserTurn('questioning', recoveredQuestion.id)
                            );
                            return;
                        }
                    } catch (recoveryErr) {
                        console.error('Failed to recover interview after coding round:', recoveryErr);
                    }

                    setError('Could not restore interview question after coding round.');
                    return;
                }

                startAIIntroduction(session.access_token);
            } catch (err) {
                console.error('Session init error:', err);
                setError('Failed to initialize session');
            }
        };

        initSession();

        const stopOnBackNavigation = () => {
            stopAllSessionMedia();
        };
        window.addEventListener('popstate', stopOnBackNavigation);

        return () => {
            window.removeEventListener('popstate', stopOnBackNavigation);
            pendingTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
            pendingTimeoutsRef.current = [];
            cleanupRecorderResources();
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = '';
                audioRef.current = null;
            }
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
        };
    }, [sessionId, router, searchParams]);

    useEffect(() => {
        activeQuestionIdRef.current = questions[currentQuestionIndex]?.id || null;
    }, [questions, currentQuestionIndex]);

    useEffect(() => {
        isPlayingAudioRef.current = isPlayingAudio;
    }, [isPlayingAudio]);

    useEffect(() => {
        const formatClock = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
        setClockText(formatClock());
        const interval = window.setInterval(() => {
            setClockText(formatClock());
        }, 1000);
        return () => window.clearInterval(interval);
    }, []);

    const cleanupRecorderResources = () => {
        if (recordingIntervalRef.current) {
            clearInterval(recordingIntervalRef.current);
            recordingIntervalRef.current = null;
        }
        if (maxRecordingTimeoutRef.current) {
            clearTimeout(maxRecordingTimeoutRef.current);
            maxRecordingTimeoutRef.current = null;
        }
        if (animationFrameRef.current !== null) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => undefined);
            audioContextRef.current = null;
        }
        analyserRef.current = null;
        silenceStartedAtRef.current = null;
        speechDetectedRef.current = false;
        micLevelRef.current = 0;
        setMicLevel(0);

        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
    };

    const scheduleManagedTimeout = (cb: () => void, delay: number) => {
        const timeoutId = window.setTimeout(() => {
            pendingTimeoutsRef.current = pendingTimeoutsRef.current.filter((id) => id !== timeoutId);
            if (isEndingRef.current) {
                return;
            }
            cb();
        }, delay);
        pendingTimeoutsRef.current.push(timeoutId);
        return timeoutId;
    };

    const stopAllSessionMedia = () => {
        isEndingRef.current = true;
        pendingTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
        pendingTimeoutsRef.current = [];
        stopReasonRef.current = 'manual';
        stopRecordingAuto();
        cleanupRecorderResources();

        if (audioRef.current) {
            audioRef.current.onplay = null;
            audioRef.current.onended = null;
            audioRef.current.onerror = null;
            audioRef.current.pause();
            audioRef.current.src = '';
            audioRef.current = null;
        }

        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        if (typeof window !== 'undefined') {
            document.querySelectorAll('audio').forEach((audioEl) => {
                try {
                    audioEl.pause();
                    audioEl.currentTime = 0;
                    audioEl.src = '';
                } catch {
                    // no-op
                }
            });
        }

        setAudioPlaybackState(false);
        setIsRecording(false);
    };

    const getPreferredFemaleVoice = () => {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
            return null;
        }
        const voices = window.speechSynthesis.getVoices();
        if (!voices?.length) return null;
        return (
            voices.find((v) => FEMALE_VOICE_HINTS.some((hint) => v.name.toLowerCase().includes(hint))) ||
            voices.find((v) => FEMALE_VOICE_HINTS.some((hint) => v.voiceURI.toLowerCase().includes(hint))) ||
            null
        );
    };

    const speakWithBrowserTTS = (text: string, onEnd?: () => void) => {
        if (isEndingRef.current) {
            return;
        }
        if (!text?.trim()) {
            onEnd?.();
            return;
        }
        try {
            if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
                onEnd?.();
                return;
            }
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = '';
                audioRef.current = null;
            }
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1;
            utterance.pitch = 1;
            const femaleVoice = getPreferredFemaleVoice();
            if (femaleVoice) {
                utterance.voice = femaleVoice;
            }
            setTurn('ai');
            setAudioPlaybackState(true);
            utterance.onend = () => {
                if (isEndingRef.current) return;
                setAudioPlaybackState(false);
                onEnd?.();
            };
            utterance.onerror = () => {
                if (isEndingRef.current) return;
                setAudioPlaybackState(false);
                onEnd?.();
            };
            window.speechSynthesis.speak(utterance);
        } catch (err) {
            console.error('Browser TTS failed:', err);
            setAudioPlaybackState(false);
            onEnd?.();
        }
    };

    const speakWithPreferredFemaleVoice = async (text: string, onEnd?: () => void) => {
        if (isEndingRef.current) return;
        if (!text?.trim()) {
            onEnd?.();
            return;
        }
        try {
            const ttsResponse = await axios.post(
                `${ML_URL}/synthesize_speech`,
                null,
                {
                    params: {
                        text,
                        voice: 'female_friendly'
                    }
                }
            );
            const audioBase64 = ttsResponse.data?.audio_base64;
            if (audioBase64) {
                playAudioFromBase64(audioBase64, onEnd, text);
                return;
            }
        } catch (err) {
            console.error('Preferred female TTS failed, falling back to browser TTS:', err);
        }
        speakWithBrowserTTS(text, onEnd);
    };

    const playAudioFromBase64 = (base64Audio: string, onEnd?: () => void, fallbackText?: string) => {
        if (isEndingRef.current) {
            return;
        }
        if (!base64Audio) {
            speakWithBrowserTTS(fallbackText || '', onEnd);
            return;
        }
        try {
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
            if (audioRef.current) {
                audioRef.current.onplay = null;
                audioRef.current.onended = null;
                audioRef.current.onerror = null;
                audioRef.current.pause();
                audioRef.current.src = '';
            }

            const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);
            audioRef.current = audio;

            audio.onplay = () => {
                if (isEndingRef.current) {
                    audio.pause();
                    return;
                }
                setTurn('ai');
                setAudioPlaybackState(true);
            };
            audio.onended = () => {
                if (isEndingRef.current) {
                    return;
                }
                setAudioPlaybackState(false);
                onEnd?.();
            };
            audio.onerror = () => {
                if (isEndingRef.current) {
                    return;
                }
                setAudioPlaybackState(false);
                if (fallbackText) {
                    speakWithBrowserTTS(fallbackText, onEnd);
                    return;
                }
                onEnd?.();
            };

            audio.play().catch((err) => {
                console.error('Audio play failed:', err);
                setAudioPlaybackState(false);
                if (fallbackText) {
                    speakWithBrowserTTS(fallbackText, onEnd);
                } else {
                    onEnd?.();
                }
            });
        } catch (err) {
            console.error('Audio playback error:', err);
            if (fallbackText) {
                speakWithBrowserTTS(fallbackText, onEnd);
            } else {
                onEnd?.();
            }
        }
    };

    const beginUserTurn = async (nextPhase: 'user_intro' | 'questioning', questionIdHint?: string) => {
        if (isEndingRef.current || codingTransitionActiveRef.current) {
            return;
        }
        const browserSpeaking = typeof window !== 'undefined' && 'speechSynthesis' in window
            ? window.speechSynthesis.speaking
            : false;
        const htmlAudioPlaying = !!(audioRef.current && !audioRef.current.paused && !audioRef.current.ended);
        if (isPlayingAudioRef.current || browserSpeaking || htmlAudioPlaying) {
            return;
        }
        if (mediaRecorderRef.current?.state === 'recording') {
            return;
        }
        setSessionNotice(null);
        let nextMode: RecordingMode = 'user_intro';
        let nextQuestionId: string | undefined;

        if (nextPhase === 'questioning') {
            let stableQuestionId = questionIdHint || questions[currentQuestionIndex]?.id || activeQuestionIdRef.current;
            if (!stableQuestionId) {
                const serverQuestions = await hydrateQuestionsFromServer();
                stableQuestionId =
                    serverQuestions[currentQuestionIndex]?.id ||
                    serverQuestions[0]?.id ||
                    serverQuestions[serverQuestions.length - 1]?.id;
            }
            if (!stableQuestionId) {
                setError('No active question found for this turn.');
                return;
            }
            activeQuestionIdRef.current = stableQuestionId;
            nextMode = 'questioning';
            nextQuestionId = stableQuestionId;
        }

        setPhase(nextPhase);
        setTurn('user');
        setFeedback(null);
        if (pressureLevel !== 'off') {
            setSessionNotice(getPressureConfig(pressureLevel).banner);
        }
        await startRecordingAuto(nextMode, nextQuestionId);
    };

    const startAIIntroduction = async (token: string) => {
        if (isEndingRef.current) {
            return;
        }
        try {
            const response = await axios.post(
                `${BACKEND_URL}/conversation/start`,
                { sessionId },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            const { intro_text, audio_base64 } = response.data;
            setAiIntroText(intro_text);

            if (audio_base64) {
                playAudioFromBase64(audio_base64, () => {
                    beginUserTurn('user_intro');
                }, intro_text);
            } else {
                speakWithPreferredFemaleVoice(intro_text, () => {
                    scheduleManagedTimeout(() => beginUserTurn('user_intro'), 400);
                });
            }
        } catch (err: any) {
            console.error('AI intro error:', err);
            setError('Failed to start conversation');
        }
    };

    const hydrateQuestionsFromServer = async (): Promise<Question[]> => {
        const token = sessionTokenRef.current || sessionToken;
        if (!token) {
            return [];
        }

        try {
            const response = await axios.get(
                `${BACKEND_URL}/interviews/${sessionId}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            applySessionRuntimeConfig(response.data?.session);
            const serverQuestions = (response.data?.questions || []) as Question[];
            if (serverQuestions.length) {
                setQuestions(serverQuestions);
                const safeIndex = Math.min(currentQuestionIndex, serverQuestions.length - 1);
                setCurrentQuestionIndex(safeIndex);
                activeQuestionIdRef.current = serverQuestions[safeIndex]?.id || serverQuestions[0]?.id || null;
            }
            return serverQuestions;
        } catch (err) {
            console.error('Failed to hydrate questions from server:', err);
            return [];
        }
    };

    const stopRecordingAuto = () => {
        const recorder = mediaRecorderRef.current;
        if (!recorder || recorder.state !== 'recording') {
            return;
        }

        if (!stopReasonRef.current) {
            stopReasonRef.current = 'manual';
        }
        recorder.stop();
        setIsRecording(false);
    };

    const speakEncouragement = (message: string, onDone: () => void) => {
        if (isEndingRef.current) {
            return;
        }
        void speakWithPreferredFemaleVoice(message, () => {
            if (!isEndingRef.current) onDone();
        });
    };

    const endInterviewDueToNoResponse = async () => {
        try {
            const token = sessionTokenRef.current || sessionToken;
            if (token) {
                await axios.post(
                    `${BACKEND_URL}/interviews/end`,
                    { sessionId },
                    { headers: { Authorization: `Bearer ${token}` } }
                );
            }
        } catch (err) {
            console.error('Failed to end interview after no response:', err);
        } finally {
            setPhase('complete');
            router.push(`/interview/report/${sessionId}`);
        }
    };

    const handleNoResponse = async (modeAtStop: RecordingMode | null, questionIdAtStop?: string) => {
        if (isEndingRef.current || codingTransitionActiveRef.current) {
            return;
        }
        noResponseAttemptsRef.current += 1;
        const attempt = noResponseAttemptsRef.current;
        const message = ENCOURAGEMENT_MESSAGES[Math.min(attempt - 1, ENCOURAGEMENT_MESSAGES.length - 1)];

        setTurn('ai');
        setError(null);
        setSessionNotice(message);

        if (attempt >= MAX_NO_RESPONSE_ATTEMPTS) {
            // In questioning mode, skip current question instead of ending interview.
            if (modeAtStop === 'questioning') {
                const skipMessage = "No problem. I will skip this question and move to the next one.";
                setSessionNotice(skipMessage);
                speakWithPreferredFemaleVoice(skipMessage, async () => {
                    if (isEndingRef.current) return;
                    noResponseAttemptsRef.current = 0;
                    await submitAnswer(
                        `${SKIP_ANSWER_MARKER} auto_skip_no_response`,
                        null,
                        null,
                        questionIdAtStop || activeQuestionIdRef.current || undefined
                    );
                });
                return;
            }
            await endInterviewDueToNoResponse();
            return;
        }

        speakEncouragement(message, () => {
            const nextMode = modeAtStop === 'questioning' ? 'questioning' : 'user_intro';
            beginUserTurn(nextMode, questionIdAtStop);
        });
    };

    const startRecordingAuto = async (mode: RecordingMode, questionId?: string) => {
        try {
            if (isEndingRef.current || codingTransitionActiveRef.current) {
                return;
            }
            const pressureConfig = getPressureConfig(pressureLevel);
            cleanupRecorderResources();
            recordingModeRef.current = mode;
            recordingQuestionIdRef.current = questionId || null;
            recordingStartedAtRef.current = Date.now();
            stopReasonRef.current = null;

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                if (isEndingRef.current || codingTransitionActiveRef.current) {
                    return;
                }
                const modeAtStop = recordingModeRef.current;
                const questionIdAtStop = recordingQuestionIdRef.current;
                const hadSpeech = speechDetectedRef.current;
                const stopReason = stopReasonRef.current;
                cleanupRecorderResources();
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                if (!hadSpeech && stopReason === 'no_speech_timeout') {
                    await handleNoResponse(modeAtStop, questionIdAtStop || undefined);
                    return;
                }
                if (audioBlob.size > 0) {
                    await processAudioAnswer(audioBlob, modeAtStop, questionIdAtStop || undefined);
                } else {
                    await handleNoResponse(modeAtStop, questionIdAtStop || undefined);
                }
            };

            mediaRecorder.start(250);
            setIsRecording(true);
            setRecordingTime(0);
            setTurn('user');

            recordingIntervalRef.current = setInterval(() => {
                setRecordingTime((prev) => prev + 1);
            }, 1000);

            maxRecordingTimeoutRef.current = setTimeout(() => {
                stopReasonRef.current = 'timeout';
                stopRecordingAuto();
            }, pressureConfig.maxRecordingMs);

            const audioContext = new AudioContext();
            audioContextRef.current = audioContext;
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);
            analyserRef.current = analyser;

            const dataArray = new Float32Array(analyser.fftSize);

            const monitor = () => {
                const activeRecorder = mediaRecorderRef.current;
                const activeAnalyser = analyserRef.current;
                if (!activeRecorder || activeRecorder.state !== 'recording' || !activeAnalyser) {
                    return;
                }

                activeAnalyser.getFloatTimeDomainData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    sum += Math.abs(dataArray[i]);
                }
                const avgAmplitude = sum / dataArray.length;
                const now = Date.now();
                const normalizedMicLevel = Math.max(0, Math.min(1, avgAmplitude / (SILENCE_THRESHOLD * 3.5)));
                micLevelRef.current = normalizedMicLevel;
                if (now - lastMicUiUpdateRef.current > 120) {
                    setMicLevel(normalizedMicLevel);
                    lastMicUiUpdateRef.current = now;
                }

                if (avgAmplitude > SILENCE_THRESHOLD) {
                    speechDetectedRef.current = true;
                    noResponseAttemptsRef.current = 0;
                    silenceStartedAtRef.current = null;
                } else if (speechDetectedRef.current) {
                    if (!silenceStartedAtRef.current) {
                        silenceStartedAtRef.current = now;
                    } else if (now - silenceStartedAtRef.current > pressureConfig.silenceHoldMs) {
                        stopReasonRef.current = 'silence';
                        stopRecordingAuto();
                        return;
                    }
                } else if (recordingStartedAtRef.current && now - recordingStartedAtRef.current > pressureConfig.noSpeechTimeoutMs) {
                    stopReasonRef.current = 'no_speech_timeout';
                    stopRecordingAuto();
                    return;
                }

                animationFrameRef.current = requestAnimationFrame(monitor);
            };

            animationFrameRef.current = requestAnimationFrame(monitor);
        } catch (err) {
            console.error('Recording error:', err);
            setError('Failed to access microphone');
        }
    };

    const recoverWithFallbackIntroQuestion = async (
        token: string,
        introContextText: string,
        greetingText?: string | null,
        greetingAudioBase64?: string | null
    ): Promise<boolean> => {
        try {
            const fallbackResponse = await axios.post(
                `${BACKEND_URL}/conversation/next-question`,
                {
                    sessionId,
                    previousAnswer: introContextText?.trim() || 'Candidate shared introduction. Start with a foundational technical question.',
                    audioMetrics: null,
                    currentTopic: null
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            const fallbackQuestion = fallbackResponse.data?.question as Question | undefined;
            if (!fallbackQuestion?.id) {
                return false;
            }

            noResponseAttemptsRef.current = 0;
            setQuestions([fallbackQuestion]);
            setCurrentQuestionIndex(0);
            activeQuestionIdRef.current = fallbackQuestion.id;
            playGreetingThenFirstQuestion(greetingText || null, greetingAudioBase64 || null, fallbackQuestion);
            return true;
        } catch (fallbackErr) {
            console.error('Fallback intro question generation failed:', fallbackErr);
            return false;
        }
    };

    const processAudioAnswer = async (audioBlob: Blob, modeHint?: RecordingMode | null, questionIdHint?: string) => {
        setLoading(true);
        try {
            const mode = modeHint || recordingModeRef.current || (phase === 'user_intro' ? 'user_intro' : 'questioning');

            if (mode === 'user_intro') {
                let token = sessionTokenRef.current || sessionToken;
                if (!token) {
                    const { data: { session } } = await supabase.auth.getSession();
                    token = session?.access_token || null;
                    if (token) {
                        setSessionToken(token);
                        sessionTokenRef.current = token;
                    }
                }
                if (!token) {
                    throw new Error('Session token not available. Please login again.');
                }

                let analyzedIntroTranscript = '';
                try {
                    const introTranscriptForm = new FormData();
                    introTranscriptForm.append('file', audioBlob, 'user_intro.webm');
                    const introAnalysisResponse = await axios.post(
                        `${ML_URL}/transcribe_audio`,
                        introTranscriptForm,
                        { headers: { 'Content-Type': 'multipart/form-data' } }
                    );
                    analyzedIntroTranscript = String(introAnalysisResponse.data?.transcript || '').trim();
                    if (analyzedIntroTranscript) {
                        latestTranscriptRef.current = analyzedIntroTranscript;
                    }
                } catch (analysisErr) {
                    console.error('Intro audio analysis failed:', analysisErr);
                }

                const formData = new FormData();
                formData.append('audio', audioBlob, 'user_intro.webm');
                formData.append('sessionId', sessionId);

                let response;
                try {
                    response = await axios.post(
                        `${BACKEND_URL}/conversation/user-response`,
                        formData,
                        {
                            headers: {
                                Authorization: `Bearer ${token}`
                            }
                        }
                    );
                } catch (introErr: any) {
                    const introErrorMsg = introErr?.response?.data?.error || introErr?.response?.data?.detail || '';
                    if (String(introErrorMsg).includes('No user introduction provided')) {
                        // Fallback path: resend intro as text using analyzed transcript
                        const transcript = analyzedIntroTranscript;
                        if (!transcript) {
                            throw new Error('Could not detect your introduction clearly. Please try again.');
                        }

                        response = await axios.post(
                            `${BACKEND_URL}/conversation/user-response`,
                            {
                                sessionId,
                                textResponse: transcript
                            },
                            {
                                headers: {
                                    Authorization: `Bearer ${token}`
                                }
                            }
                        );
                    } else {
                        throw introErr;
                    }
                }

                if (response.data?.conversation_complete === false && response.data?.follow_up_prompt) {
                    const followUpText = String(response.data.follow_up_prompt || '').trim();
                    const followUpAudio = response.data?.follow_up_audio_base64 || null;
                    if (followUpText) {
                        setSessionNotice(followUpText);
                        if (followUpAudio) {
                            playAudioFromBase64(followUpAudio, () => beginUserTurn('user_intro'), followUpText);
                        } else {
                            speakWithPreferredFemaleVoice(followUpText, () => beginUserTurn('user_intro'));
                        }
                        return;
                    }
                }

                const generatedQuestions = response.data.questions || [];
                if (isEndingRef.current) {
                    return;
                }
                if (!generatedQuestions.length) {
                    const recovered = await recoverWithFallbackIntroQuestion(
                        token,
                        analyzedIntroTranscript || response.data?.user_intro_text || '',
                        response.data?.greeting_text || null,
                        response.data?.greeting_audio_base64 || null
                    );
                    if (recovered) {
                        return;
                    }
                    throw new Error('No interview questions were generated from your introduction.');
                }
                const greetingText = response.data?.greeting_text || null;
                const greetingAudioBase64 = response.data?.greeting_audio_base64 || null;
                noResponseAttemptsRef.current = 0;
                setQuestions(generatedQuestions);
                setCurrentQuestionIndex(0);
                activeQuestionIdRef.current = generatedQuestions[0]?.id || null;
                playGreetingThenFirstQuestion(greetingText, greetingAudioBase64, generatedQuestions[0]);
                return;
            }

            const formData = new FormData();
            formData.append('file', audioBlob, 'answer.webm');

            const uploadPromise = (async (): Promise<string | null> => {
                try {
                    const fileName = `${sessionId}_${Date.now()}.webm`;
                    const filePath = `answers/${fileName}`;
                    const { error: uploadError } = await supabase.storage
                        .from('voice-answers')
                        .upload(filePath, audioBlob, {
                            contentType: audioBlob.type || 'audio/webm',
                            upsert: false
                        });

                    if (uploadError) {
                        console.error('Audio upload failed. Continuing without audio URL:', uploadError);
                        return null;
                    }

                    const { data: { publicUrl } } = supabase.storage
                        .from('voice-answers')
                        .getPublicUrl(filePath);
                    return publicUrl;
                } catch (uploadErr) {
                    console.error('Audio upload error. Continuing without audio URL:', uploadErr);
                    return null;
                }
            })();

            const analysisPromise = axios.post(
                `${ML_URL}/transcribe_audio`,
                formData,
                { headers: { 'Content-Type': 'multipart/form-data' } }
            );

            const [publicUrl, analysisResponse] = await Promise.all([uploadPromise, analysisPromise]);
            const transcript = String(analysisResponse.data?.transcript || '').trim();
            const fastMetrics: AudioMetrics = {
                transcript,
                emotion: 'neutral',
                confidence_score: 0,
                gaps: [],
                fluency_score: 0,
                wpm: 0,
                filler_words: 0
            };
            setAudioMetrics(fastMetrics);
            latestTranscriptRef.current = transcript;
            if (typeof window !== 'undefined') {
                sessionStorage.setItem('ic_latest_transcript', latestTranscriptRef.current);
            }
            if (!transcript) {
                await handleNoResponse(mode, questionIdHint || activeQuestionIdRef.current || undefined);
                return;
            }
            if (isSkipIntent(transcript)) {
                const responsePayload = await submitAnswer(
                    `${SKIP_ANSWER_MARKER} ${transcript}`,
                    publicUrl,
                    null,
                    questionIdHint || activeQuestionIdRef.current || undefined
                );
                if (responsePayload?.answer?.id) {
                    void persistVoiceMetricsInBackground(responsePayload.answer.id, audioBlob);
                }
                return;
            }
            const responsePayload = await submitAnswer(transcript, publicUrl, null, questionIdHint || activeQuestionIdRef.current || undefined);
            if (responsePayload?.answer?.id) {
                void persistVoiceMetricsInBackground(responsePayload.answer.id, audioBlob);
            }
        } catch (err: any) {
            const backendError = err?.response?.data?.error || err?.response?.data?.detail;
            const fallbackError = err?.message || 'Unknown error';
            const message = backendError || fallbackError;
            console.error('Audio processing error:', err?.response?.data || err);
            setError(`Failed to process audio: ${message}`);
        } finally {
            setLoading(false);
        }
    };

    const persistVoiceMetricsInBackground = async (answerId: string, audioBlob: Blob) => {
        try {
            let token = sessionTokenRef.current || sessionToken;
            if (!token) {
                const { data: { session } } = await supabase.auth.getSession();
                token = session?.access_token || null;
                if (token) {
                    setSessionToken(token);
                    sessionTokenRef.current = token;
                }
            }
            if (!token) return;

            const formData = new FormData();
            formData.append('file', audioBlob, 'answer.webm');

            const analysisResponse = await axios.post(
                `${ML_URL}/analyze_audio`,
                formData,
                { headers: { 'Content-Type': 'multipart/form-data' } }
            );

            const metrics = analysisResponse.data as AudioMetrics;
            setAudioMetrics(metrics);

            await axios.post(
                `${BACKEND_URL}/interviews/answer-metrics`,
                {
                    answerId,
                    voiceMetrics: metrics
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );
        } catch (backgroundErr) {
            console.error('Background voice metric persistence failed:', backgroundErr);
        }
    };

    const recoverNextQuestionAfterAnswer = async (): Promise<{ question: Question | null; adaptiveDecision: AdaptiveDecision | null }> => {
        try {
            let token = sessionTokenRef.current || sessionToken;
            if (!token) {
                const { data: { session } } = await supabase.auth.getSession();
                token = session?.access_token || null;
                if (token) {
                    setSessionToken(token);
                    sessionTokenRef.current = token;
                }
            }
            if (!token) {
                return { question: null, adaptiveDecision: null };
            }

            const response = await axios.post(
                `${BACKEND_URL}/conversation/next-question`,
                {
                    sessionId,
                    previousAnswer: latestTranscriptRef.current || 'Please continue with the interview.',
                    audioMetrics: audioMetrics || null,
                    currentTopic: questions[currentQuestionIndex]?.topic || null
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            const q = response.data?.question as Question | undefined;
            const decision = (response.data?.adaptive_decision || null) as AdaptiveDecision | null;
            if (q?.id && q?.question_text) {
                return { question: q, adaptiveDecision: decision };
            }
        } catch (err) {
            console.error('Failed to recover next question after answer:', err);
        }

        return {
            question: {
                id: `local-fallback-${Date.now()}`,
                question_text: 'Let us continue with a technical follow-up. Explain a recent problem you solved, your approach, and the time-space trade-offs.',
                topic: 'Data Structures and Algorithms',
                difficulty: 3
            },
            adaptiveDecision: null
        };
    };

    const goToNextTurn = (nextQuestionFromApi?: Question | null) => {
        if (isEndingRef.current) {
            return;
        }
        const transitionDelay = 250;

        scheduleManagedTimeout(() => {
            if (isEndingRef.current || codingTransitionActiveRef.current) {
                return;
            }
            setFeedback(null);

            // Prefer adaptive question from API so the interview reacts to the latest user answer.
            if (nextQuestionFromApi) {
                const nextIndex = currentQuestionIndex + 1;
                setQuestions((prev) => {
                    const updated = [...prev];
                    if (updated[nextIndex]) {
                        updated[nextIndex] = nextQuestionFromApi;
                    } else {
                        updated.push(nextQuestionFromApi);
                    }
                    return updated;
                });
                setCurrentQuestionIndex(nextIndex);
                if (nextQuestionFromApi.audio_base64) {
                    playAudioFromBase64(nextQuestionFromApi.audio_base64, () => beginUserTurn('questioning', nextQuestionFromApi.id), nextQuestionFromApi.question_text);
                } else {
                    speakWithPreferredFemaleVoice(nextQuestionFromApi.question_text || '', () => beginUserTurn('questioning', nextQuestionFromApi.id));
                }
                return;
            }

            if (currentQuestionIndex < questions.length - 1) {
                const nextIndex = currentQuestionIndex + 1;
                setCurrentQuestionIndex(nextIndex);
                const nextQuestion = questions[nextIndex];
                if (nextQuestion?.audio_base64) {
                    playAudioFromBase64(nextQuestion.audio_base64, () => beginUserTurn('questioning', nextQuestion.id), nextQuestion.question_text);
                } else {
                    speakWithPreferredFemaleVoice(nextQuestion?.question_text || '', () => beginUserTurn('questioning', nextQuestion?.id));
                }
                return;
            }

            void (async () => {
                const recovered = await recoverNextQuestionAfterAnswer();
                const recoveredQuestion = recovered.question;
                if (!recoveredQuestion) {
                    setError('Could not load the next question. Please try once more.');
                    return;
                }
                setAdaptiveDecision(recovered.adaptiveDecision);
                if (recovered.adaptiveDecision) {
                    setSessionNotice(formatAdaptiveNotice(recovered.adaptiveDecision));
                }
                const nextIndex = currentQuestionIndex + 1;
                setQuestions((prev) => {
                    const updated = [...prev];
                    if (updated[nextIndex]) {
                        updated[nextIndex] = recoveredQuestion;
                    } else {
                        updated.push(recoveredQuestion);
                    }
                    return updated;
                });
                setCurrentQuestionIndex(nextIndex);
                setPhase('questioning');
                setTurn('ai');
                if (recoveredQuestion.audio_base64) {
                    playAudioFromBase64(
                        recoveredQuestion.audio_base64,
                        () => beginUserTurn('questioning', recoveredQuestion.id),
                        recoveredQuestion.question_text
                    );
                } else {
                    speakWithPreferredFemaleVoice(
                        recoveredQuestion.question_text || '',
                        () => beginUserTurn('questioning', recoveredQuestion.id)
                    );
                }
            })();
        }, transitionDelay);
    };

    const playGreetingThenFirstQuestion = (
        greetingText: string | null,
        greetingAudioBase64: string | null,
        firstQuestion: Question
    ) => {
        if (isEndingRef.current) {
            return;
        }
        const playFirstQuestion = () => {
            if (isEndingRef.current) {
                return;
            }
            if (firstQuestion?.audio_base64) {
                playAudioFromBase64(
                    firstQuestion.audio_base64,
                    () => beginUserTurn('questioning', firstQuestion?.id),
                    firstQuestion?.question_text
                );
            } else {
                speakWithPreferredFemaleVoice(
                    firstQuestion?.question_text || '',
                    () => beginUserTurn('questioning', firstQuestion?.id)
                );
            }
        };

        if (greetingText?.trim() || greetingAudioBase64) {
            if (greetingAudioBase64) {
                playAudioFromBase64(greetingAudioBase64, () => {
                    scheduleManagedTimeout(playFirstQuestion, 350);
                }, greetingText || undefined);
            } else {
                speakWithPreferredFemaleVoice(greetingText || '', () => {
                    scheduleManagedTimeout(playFirstQuestion, 350);
                });
            }
            return;
        }

        playFirstQuestion();
    };

    const startCodingRound = async (nextQuestionAfterRound?: Question | null) => {
        if (isEndingRef.current) {
            return;
        }
        codingTransitionActiveRef.current = true;
        if (typeof window !== 'undefined') {
            const indexedNextQuestion = questions[currentQuestionIndex + 1];
            const pendingQuestionId =
                nextQuestionAfterRound?.id ||
                indexedNextQuestion?.id ||
                activeQuestionIdRef.current ||
                questions[currentQuestionIndex]?.id ||
                null;
            if (pendingQuestionId) {
                sessionStorage.setItem(`ic_pending_question_${sessionId}`, pendingQuestionId);
            }
            // We already speak transition on this page; suppress duplicate intro voice on coding page load.
            sessionStorage.setItem(`ic_skip_coding_intro_audio_${sessionId}`, '1');
        }

        // Pause ongoing capture/playback but keep session active for transition narration.
        stopReasonRef.current = 'manual';
        stopRecordingAuto();
        cleanupRecorderResources();
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = '';
            audioRef.current = null;
        }
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        setAudioPlaybackState(false);
        setIsRecording(false);
        setTurn('ai');

        const transitionMessage =
            "Great progress so far. We will now move to the coding round. I will switch your screen in a few seconds.";

        try {
            const ttsResponse = await axios.post(
                `${ML_URL}/synthesize_speech`,
                null,
                {
                    params: {
                        text: transitionMessage,
                        voice: 'female_friendly'
                    }
                }
            );
            const transitionAudio = ttsResponse.data?.audio_base64;
            if (transitionAudio) {
                // No browser fallback here to avoid dual voices from mixed playback paths.
                playAudioFromBase64(transitionAudio);
            } else {
                speakWithPreferredFemaleVoice(transitionMessage);
            }
        } catch (transitionTtsErr) {
            console.error('Coding transition TTS failed:', transitionTtsErr);
            speakWithPreferredFemaleVoice(transitionMessage);
        }

        scheduleManagedTimeout(() => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = '';
                audioRef.current = null;
            }
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
            router.push(`/interview/session/${sessionId}/coding`);
        }, 4000);
    };

    const submitAnswer = async (text: string, audioUrl: string | null, metrics: AudioMetrics | null, questionIdHint?: string) => {
        if (isEndingRef.current) {
            return;
        }
        setLoading(true);
        try {
            let token = sessionTokenRef.current || sessionToken;
            if (!token) {
                const { data: { session } } = await supabase.auth.getSession();
                token = session?.access_token || null;
                if (token) {
                    setSessionToken(token);
                    sessionTokenRef.current = token;
                }
            }
            if (!token) {
                throw new Error('Session token not available. Please login again.');
            }

            let resolvedQuestionId = questionIdHint || questions[currentQuestionIndex]?.id || activeQuestionIdRef.current;

            if (!resolvedQuestionId) {
                const serverQuestions = await hydrateQuestionsFromServer();
                resolvedQuestionId =
                    serverQuestions[currentQuestionIndex]?.id ||
                    serverQuestions[0]?.id ||
                    serverQuestions[serverQuestions.length - 1]?.id ||
                    null;
            }

            if (!resolvedQuestionId) {
                throw new Error('No active question found for this answer.');
            }
            activeQuestionIdRef.current = resolvedQuestionId;

            const response = await axios.post(
                `${BACKEND_URL}/interviews/answer`,
                {
                    sessionId,
                    questionId: resolvedQuestionId,
                    answerText: text,
                    audioUrl,
                    voiceMetrics: metrics
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            const { evaluation, next_question, adaptive_decision } = response.data;
            if (isEndingRef.current) {
                return;
            }
            noResponseAttemptsRef.current = 0;
            setFeedback(evaluation);
            if (liveCoachingEnabled) {
                setLiveCoachingCues(buildLiveCoachingCues({
                    transcript: text,
                    metrics,
                    feedback: evaluation,
                    question: questions[currentQuestionIndex] || null,
                    coachStyle: coachStyleMode
                }));
            } else {
                setLiveCoachingCues([]);
            }
            setAdaptiveDecision(adaptive_decision || null);
            if (adaptive_decision) {
                setSessionNotice(formatAdaptiveNotice(adaptive_decision));
            }
            const nextCount = spokenAnswersCount + 1;
            setSpokenAnswersCount(nextCount);

            if (codingRoundEnabled && !codingRoundCompleted && nextCount >= CODING_ROUND_TRIGGER_AFTER_ANSWERS) {
                await startCodingRound(next_question || null);
                return;
            }

            goToNextTurn(next_question || null);
            return response.data;
        } catch (err: any) {
            const backendError = err?.response?.data?.error || err?.response?.data?.detail;
            const backendHint = err?.response?.data?.hint;
            const fallbackError = err?.message || 'Unknown error';
            const message = backendHint ? `${backendError || fallbackError} (${backendHint})` : (backendError || fallbackError);
            console.error('Answer submission error:', err?.response?.data || err);
            setError(`Failed to submit answer: ${message}`);
            return null;
        } finally {
            setLoading(false);
        }
    };

    const endInterviewNow = async () => {
        stopAllSessionMedia();
        codingTransitionActiveRef.current = true;
        try {
            let token = sessionTokenRef.current || sessionToken;
            if (!token) {
                const { data: { session } } = await supabase.auth.getSession();
                token = session?.access_token || null;
                if (token) {
                    setSessionToken(token);
                    sessionTokenRef.current = token;
                }
            }
            if (!token) {
                throw new Error('Session token not available. Please login again.');
            }

            await axios.post(
                `${BACKEND_URL}/interviews/end`,
                { sessionId },
                { headers: { Authorization: `Bearer ${token}` } }
            );
        } catch (err) {
            console.error('Failed to end interview:', err);
        } finally {
            setPhase('complete');
            router.push(`/interview/report/${sessionId}`);
        }
    };

    const handleTextSubmit = async () => {
        if (!textAnswer.trim()) {
            return;
        }

        if (phase === 'user_intro') {
            try {
                let token = sessionTokenRef.current || sessionToken;
                if (!token) {
                    const { data: { session } } = await supabase.auth.getSession();
                    token = session?.access_token || null;
                    if (token) {
                        setSessionToken(token);
                        sessionTokenRef.current = token;
                    }
                }
                if (!token) {
                    throw new Error('Session token not available. Please login again.');
                }
                setLoading(true);
                const response = await axios.post(
                    `${BACKEND_URL}/conversation/user-response`,
                    {
                        sessionId,
                        textResponse: textAnswer.trim()
                    },
                    { headers: { Authorization: `Bearer ${token}` } }
                );

                const generatedQuestions = response.data.questions || [];
                if (!generatedQuestions.length) {
                    const recovered = await recoverWithFallbackIntroQuestion(
                        token,
                        textAnswer.trim(),
                        response.data?.greeting_text || null,
                        response.data?.greeting_audio_base64 || null
                    );
                    if (recovered) {
                        setTextAnswer('');
                        return;
                    }
                    throw new Error('No interview questions were generated from your introduction.');
                }
                const greetingText = response.data?.greeting_text || null;
                const greetingAudioBase64 = response.data?.greeting_audio_base64 || null;
                setQuestions(generatedQuestions);
                setCurrentQuestionIndex(0);
                activeQuestionIdRef.current = generatedQuestions[0]?.id || null;
                setTextAnswer('');
                playGreetingThenFirstQuestion(greetingText, greetingAudioBase64, generatedQuestions[0]);
            } catch (err) {
                console.error('Text introduction error:', err);
                setError('Failed to process introduction');
            } finally {
                setLoading(false);
            }
            return;
        }

        latestTranscriptRef.current = textAnswer.trim();
        if (typeof window !== 'undefined') {
            sessionStorage.setItem('ic_latest_transcript', latestTranscriptRef.current);
        }
        const trimmedText = textAnswer.trim();
        if (isSkipIntent(trimmedText)) {
            await submitAnswer(`${SKIP_ANSWER_MARKER} ${trimmedText}`, null, null);
            setTextAnswer('');
            return;
        }
        await submitAnswer(trimmedText, null, null);
        setTextAnswer('');
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const currentQuestion = questions[currentQuestionIndex];
    const userWaveScales = [
        0.22 + (micLevel * 0.95),
        0.28 + (micLevel * 1.1),
        0.2 + (micLevel * 0.85),
        0.3 + (micLevel * 1.2)
    ];

    return (
        <div className="app-shell relative flex flex-col overflow-hidden animate-panel-in">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(56,189,248,0.06)_0%,rgba(15,23,42,0)_30%,rgba(34,197,94,0.04)_100%)]" />
            <div className="pointer-events-none absolute -left-24 top-24 h-56 w-56 rounded-full bg-cyan-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -right-24 top-40 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
            <div className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl" />

            <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/70 px-4 py-4 backdrop-blur md:px-6">
                <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-4">
                        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 shadow-lg shadow-cyan-500/20" />
                        <div>
                            <h1 className="text-lg font-semibold tracking-wide" style={{ fontFamily: 'var(--font-space-grotesk), sans-serif' }}>Interview Studio</h1>
                            <p className="text-xs text-slate-400">Session {sessionId?.toString().slice(0, 8)}</p>
                        </div>
                        <span className="hidden rounded-full border border-emerald-300/35 bg-emerald-500/15 px-2.5 py-1 text-[11px] uppercase tracking-wider text-emerald-200 md:inline-flex">
                            Live
                        </span>
                        {phase === 'questioning' && (
                            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-200">
                                Question {currentQuestionIndex + 1} / {Math.max(questions.length, 1)}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {process.env.NODE_ENV !== 'production' && (
                            <button
                                onClick={() => startCodingRound(null)}
                                className="rounded-full border border-amber-300/60 bg-amber-500/15 px-3 py-1 text-xs text-amber-100 transition hover:bg-amber-500/25"
                            >
                                Go To Coding (Test)
                            </button>
                        )}
                        <div className={`rounded-full border px-3 py-1 text-xs transition-all duration-300 ${turn === 'ai'
                            ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200'
                            : 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200'
                            } ${turn === 'ai' ? 'animate-live-pulse' : ''}`}>
                            {turn === 'ai' ? 'AI Speaking Turn' : 'Your Speaking Turn'}
                        </div>
                        <button
                            onClick={endInterviewNow}
                            className="rounded-full border border-rose-400/70 bg-rose-500/15 px-3 py-1 text-xs text-rose-200 transition hover:bg-rose-500/30"
                        >
                            End Interview
                        </button>
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="rounded-full border border-white/15 p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-12 lg:p-6">
                <section className="glass-card lg:col-span-8 p-4 md:p-6 shadow-[0_30px_90px_-45px_rgba(56,189,248,0.45)]">
                    <div className="mb-4 flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3">
                        <div>
                            <p className="text-sm font-medium text-slate-200">Live Interview Room</p>
                            <p className="text-[11px] text-slate-400">Natural turn-based conversation</p>
                        </div>
                        <p suppressHydrationWarning className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300">{clockText}</p>
                    </div>

                    <div className="grid min-h-[320px] grid-cols-1 gap-4 md:grid-cols-2">
                        <div className={`relative flex min-h-[320px] flex-col overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/80 via-slate-900 to-blue-950/70 p-4 transition-all duration-500 ${turn === 'ai'
                            ? 'ring-2 ring-cyan-300/35 shadow-[0_0_45px_-20px_rgba(34,211,238,0.7)]'
                            : 'opacity-90'
                            }`}>
                            <div className="absolute right-4 top-4 text-cyan-300/40">
                                <Volume2 size={28} />
                            </div>
                            <p className="mb-3 text-xs uppercase tracking-wider text-cyan-200/70">AI Interviewer</p>
                            <div className="relative mx-auto flex h-[252px] w-full max-w-[206px] items-center justify-center overflow-hidden rounded-2xl border border-cyan-400/15 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.16),transparent_38%),linear-gradient(180deg,rgba(15,23,42,0.82),rgba(8,15,30,0.95))]">
                                <div className="absolute inset-x-8 top-5 h-24 rounded-full bg-cyan-400/10 blur-3xl" />
                                <div className={`relative flex h-24 w-24 items-center justify-center rounded-3xl border border-cyan-300/25 bg-cyan-400/10 transition ${isPlayingAudio ? 'shadow-[0_0_40px_-12px_rgba(34,211,238,0.8)]' : ''}`}>
                                    <Volume2 size={40} className={`text-cyan-200 ${isPlayingAudio ? 'animate-pulse' : ''}`} />
                                </div>
                                <div className="absolute bottom-5 left-1/2 h-3 w-28 -translate-x-1/2 rounded-full bg-slate-950/70 blur-md" />
                            </div>
                            <div className="mt-4">
                                <h2 className="text-xl font-bold text-white" style={{ fontFamily: 'var(--font-space-grotesk), sans-serif' }}>
                                    AI Interviewer
                                </h2>
                                <p className="mt-1 text-sm text-cyan-100/70">
                                    Professional interviewer mode with adaptive questioning, live evaluation, and real-time turn guidance.
                                </p>
                            </div>

                            <div className="mt-auto flex items-center gap-3 pt-10">
                                <div className={`h-3.5 w-3.5 rounded-full ${isPlayingAudio ? 'bg-cyan-300 animate-pulse' : 'bg-cyan-900 border border-cyan-500'}`} />
                                <p className="text-sm text-cyan-100/90">{isPlayingAudio ? 'Speaking live' : turn === 'user' && isRecording ? 'Listening to your answer' : 'Standing by'}</p>
                                <span className={`voice-bars ${isPlayingAudio ? 'opacity-100' : 'opacity-35'}`}>
                                    <span className="voice-bar bg-cyan-300" />
                                    <span className="voice-bar bg-cyan-300" />
                                    <span className="voice-bar bg-cyan-300" />
                                    <span className="voice-bar bg-cyan-300" />
                                </span>
                            </div>
                            <div className={`pointer-events-none absolute -bottom-20 -right-12 h-44 w-44 rounded-full bg-cyan-400/20 blur-2xl ${isPlayingAudio ? 'animate-pulse' : ''}`} />
                        </div>

                        <div className={`relative flex min-h-[320px] flex-col overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/70 via-slate-900 to-slate-900 p-6 transition-all duration-500 ${turn === 'user'
                            ? 'ring-2 ring-emerald-300/35 shadow-[0_0_45px_-20px_rgba(16,185,129,0.7)]'
                            : 'opacity-90'
                            }`}>
                            <div className="absolute right-4 top-4 text-emerald-300/40">
                                <Sparkles size={22} />
                            </div>
                            <p className="text-xs uppercase tracking-wider text-emerald-200/70">Candidate</p>
                            <h2 className="mt-1 text-xl font-bold" style={{ fontFamily: 'var(--font-space-grotesk), sans-serif' }}>You</h2>
                            <div className="mt-5 space-y-2">
                                <div className="flex items-center gap-3">
                                    <div className={`h-3.5 w-3.5 rounded-full ${isRecording ? 'bg-rose-400 animate-pulse' : 'bg-emerald-900 border border-emerald-500'}`} />
                                    <p className="text-sm text-emerald-100/90">
                                        {isRecording ? `Listening ${formatTime(recordingTime)}` : 'Waiting for your turn'}
                                    </p>
                                    <span className={`voice-bars ${isRecording ? 'opacity-100' : 'opacity-35'}`}>
                                        {userWaveScales.map((scale, idx) => (
                                            <span
                                                key={idx}
                                                className="voice-bar bg-emerald-300"
                                                style={{
                                                    animation: 'none',
                                                    transform: `scaleY(${isRecording ? scale : 0.28})`,
                                                    transition: 'transform 110ms linear, opacity 160ms ease'
                                                }}
                                            />
                                        ))}
                                    </span>
                                </div>
                                <p className="text-xs leading-relaxed text-emerald-100/65">
                                    Microphone starts automatically on your turn. You can also type if needed.
                                </p>
                            </div>
                            <div className="mt-auto" />
                            <div className={`pointer-events-none absolute -bottom-16 -left-10 h-36 w-36 rounded-full bg-emerald-400/15 blur-2xl ${isRecording ? 'animate-pulse' : ''}`} />
                        </div>
                    </div>
                </section>

                <aside className="glass-card lg:col-span-4 flex flex-col p-4 md:p-5 shadow-[0_30px_90px_-55px_rgba(59,130,246,0.45)]">
                    <div className="mb-4 rounded-xl border border-white/10 bg-slate-950/65 p-4 animate-panel-in">
                        <p className="mb-2 text-xs uppercase tracking-wider text-slate-400">Current Prompt</p>
                        <div className="min-h-[130px] rounded-lg border border-white/10 bg-slate-900/60 p-3 transition-all duration-300">
                            {phase === 'ai_intro' && <p className="text-slate-200">{aiIntroText || 'Preparing introduction...'}</p>}
                            {phase === 'user_intro' && (
                                <p className="text-slate-200">Your turn: introduce yourself, your experience, and what you are looking for.</p>
                            )}
                            {phase === 'questioning' && currentQuestion && (
                                <p className="text-base leading-relaxed text-slate-100">{currentQuestion.question_text}</p>
                            )}
                        </div>
                    </div>
                    {sessionNotice && (
                        <div className="mb-4 rounded-xl border border-cyan-500/30 bg-cyan-950/25 p-3 animate-panel-in">
                            <p className="text-sm text-cyan-100">{sessionNotice}</p>
                        </div>
                    )}
                    {pressureLevel !== 'off' && (
                        <div className="mb-4 rounded-xl border border-rose-500/25 bg-rose-950/20 p-3 animate-panel-in">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-rose-300">{getPressureConfig(pressureLevel).label}</p>
                                <span className="text-[11px] uppercase tracking-wider text-rose-200/80">
                                    Answer Window {Math.round(getPressureConfig(pressureLevel).maxRecordingMs / 1000)}s
                                </span>
                            </div>
                            <p className="mt-2 text-sm text-slate-200">{getPressureConfig(pressureLevel).banner}</p>
                        </div>
                    )}
                    {error && (
                        <div className="mb-4 rounded-xl border border-rose-500/35 bg-rose-950/30 p-3 animate-panel-in">
                            <div className="flex items-start justify-between gap-3">
                                <p className="text-sm text-rose-100">{error}</p>
                                <button
                                    onClick={() => setError(null)}
                                    className="rounded border border-rose-400/40 px-2 py-0.5 text-[11px] text-rose-200 transition hover:bg-rose-500/20"
                                >
                                    Dismiss
                                </button>
                            </div>
                        </div>
                    )}

                    {loading && (
                        <div className="mb-4 flex items-center gap-3 rounded-xl border border-cyan-500/25 bg-cyan-950/25 p-3 animate-panel-in">
                            <Loader2 className="animate-spin text-cyan-300" size={18} />
                            <p className="text-sm text-cyan-100">Analyzing your response...</p>
                        </div>
                    )}

                    {feedback && (
                        <div className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-4 animate-panel-in">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold text-emerald-300">Evaluation</p>
                                <p className="text-2xl font-bold text-white">{feedback.final_score}</p>
                            </div>
                            <p className="mt-2 text-sm text-slate-200">{feedback.feedback_text}</p>
                        </div>
                    )}

                    {liveCoachingEnabled && (isRecording || liveCoachingCues.length > 0) && (
                        <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-950/20 p-4 animate-panel-in">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-amber-300">Live Coach</p>
                                <span className="text-[11px] uppercase tracking-wider text-amber-200/80">
                                    {isRecording ? 'Active' : 'Latest Cues'}
                                </span>
                            </div>
                            {isRecording ? (
                                <p className="mt-2 text-sm text-slate-200">
                                    {normalizeText(currentQuestion?.topic || '').includes('behavioral')
                                        ? 'Use STAR: set the context, your role, your action, and the result.'
                                        : 'Lead with your answer first, then explain assumptions, trade-offs, and edge cases.'}
                                </p>
                            ) : null}
                            {liveCoachingCues.length > 0 ? (
                                <div className="mt-3 space-y-2">
                                    {liveCoachingCues.map((cue) => (
                                        <div key={cue} className="rounded-lg border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100">
                                            {cue}
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    )}

                    {audioMetrics && (
                        <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
                            <div className="rounded-lg border border-white/10 bg-slate-950/60 p-3">
                                <p className="text-xs text-slate-400">Emotion</p>
                                <p className="capitalize">{audioMetrics.emotion}</p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-slate-950/60 p-3">
                                <p className="text-xs text-slate-400">Confidence</p>
                                <p>{audioMetrics.confidence_score}/10</p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-slate-950/60 p-3">
                                <p className="text-xs text-slate-400">WPM</p>
                                <p>{audioMetrics.wpm}</p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-slate-950/60 p-3">
                                <p className="text-xs text-slate-400">Gaps</p>
                                <p>{audioMetrics.gaps.length}</p>
                            </div>
                        </div>
                    )}

                    <div className="mt-auto rounded-xl border border-white/10 bg-slate-950/70 p-3">
                        <p className="mb-2 text-xs uppercase tracking-wider text-slate-400">Fallback Text Reply</p>
                        <div className="relative">
                            <textarea
                                className="w-full resize-none rounded-xl border border-white/10 bg-slate-900/60 p-3 pr-14 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-500/50"
                                rows={4}
                                placeholder="If microphone is blocked, type your answer here..."
                                value={textAnswer}
                                onChange={(e) => setTextAnswer(e.target.value)}
                            />
                            <button
                                onClick={handleTextSubmit}
                                disabled={!textAnswer.trim() || loading}
                                className="absolute bottom-2 right-2 rounded-lg bg-cyan-600 p-2 transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <Send size={18} />
                            </button>
                        </div>
                    </div>
                </aside>
            </main>

        </div>
    );
}
