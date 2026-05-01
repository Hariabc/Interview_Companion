'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import axios from 'axios';
import {
    Camera,
    CameraOff,
    Loader2,
    Mic,
    MicOff,
    Send,
    Sparkles,
    Video,
    Volume2,
    X
} from 'lucide-react';

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
type CameraStatus = 'requesting' | 'ready' | 'blocked' | 'unsupported';

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
    const [cameraStatus, setCameraStatus] = useState<CameraStatus>('requesting');
    const [cameraEnabled, setCameraEnabled] = useState(true);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const cameraStreamRef = useRef<MediaStream | null>(null);
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
            cleanupCameraResources();
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

    useEffect(() => {
        void requestCameraAccess();

        return () => {
            cleanupCameraResources();
        };
    }, []);

    useEffect(() => {
        if (videoRef.current && cameraStreamRef.current && cameraEnabled) {
            videoRef.current.srcObject = cameraStreamRef.current;
        }
    }, [cameraEnabled, cameraStatus]);

    const cleanupCameraResources = () => {
        if (cameraStreamRef.current) {
            cameraStreamRef.current.getTracks().forEach((track) => track.stop());
            cameraStreamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    };

    const requestCameraAccess = async () => {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            setCameraStatus('unsupported');
            setCameraEnabled(false);
            return;
        }

        setCameraStatus('requesting');
        try {
            cleanupCameraResources();
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                },
                audio: false
            });
            cameraStreamRef.current = stream;
            setCameraEnabled(true);
            setCameraStatus('ready');
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play().catch(() => undefined);
            }
        } catch (err) {
            console.error('Camera permission error:', err);
            setCameraStatus('blocked');
            setCameraEnabled(false);
        }
    };

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
                question_text: 'Let us continue with something simple. Pick one recent task you worked on and explain your approach clearly.',
                topic: 'Problem Solving',
                difficulty: 2
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
        <div className="min-h-screen bg-[#111111] text-zinc-100 animate-panel-in">
            <header className="flex min-h-[64px] items-center justify-between border-b border-white/10 bg-[#181818] px-4 py-3 md:px-6">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#2d8cff] text-white">
                        <Video size={21} />
                    </div>
                    <div className="min-w-0">
                        <h1 className="truncate text-base font-semibold text-white">Interview Meeting</h1>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                            <span>Session {sessionId?.toString().slice(0, 8)}</span>
                            <span className="hidden h-1 w-1 rounded-full bg-zinc-600 sm:inline-block" />
                            <span suppressHydrationWarning>{clockText}</span>
                            {phase === 'questioning' && (
                                <>
                                    <span className="hidden h-1 w-1 rounded-full bg-zinc-600 sm:inline-block" />
                                    <span>Question {currentQuestionIndex + 1} of {Math.max(questions.length, 1)}</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                    <div className="flex items-center gap-2">
                    {process.env.NODE_ENV !== 'production' && (
                        <button
                            onClick={() => startCodingRound(null)}
                            className="hidden rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-100 transition hover:bg-amber-500/20 md:inline-flex"
                        >
                            Coding Test
                        </button>
                    )}
                    <span className={`hidden items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium md:inline-flex ${turn === 'ai'
                        ? 'border-sky-400/40 bg-sky-500/10 text-sky-100'
                        : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                        }`}>
                        <span className={`h-2 w-2 rounded-full ${turn === 'ai' ? 'bg-sky-300' : 'bg-emerald-300'}`} />
                        {turn === 'ai' ? 'Interviewer speaking' : 'Candidate speaking'}
                    </span>
                    <button
                        onClick={endInterviewNow}
                        className="hidden rounded-md bg-[#d93025] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#c5221f] sm:inline-flex"
                    >
                        End Interview
                    </button>
                    <button
                        onClick={() => router.push('/dashboard')}
                        aria-label="Close meeting"
                        title="Close"
                        className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                    >
                        <X size={18} />
                    </button>
                </div>
            </header>

            <main className="grid min-h-[calc(100vh-144px)] grid-cols-1 gap-0 lg:grid-cols-[1fr_380px]">
                <section className="flex min-h-[560px] flex-col bg-[#111111]">
                    <div className="grid flex-1 grid-cols-1 gap-3 p-3 md:grid-cols-2 md:p-5">
                        <div className={`relative min-h-[280px] overflow-hidden rounded-lg border bg-[#202020] shadow-2xl transition ${turn === 'ai'
                            ? 'border-sky-400/70 ring-2 ring-sky-400/25'
                            : 'border-white/10'
                            }`}>
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(14,165,233,0.22),transparent_34%),linear-gradient(145deg,#242424,#151515)]" />
                            <div className="relative flex h-full min-h-[280px] flex-col items-center justify-center p-6 text-center">
                                <div className={`flex h-28 w-28 items-center justify-center rounded-full border border-sky-300/25 bg-sky-500/15 ${isPlayingAudio ? 'animate-live-pulse' : ''}`}>
                                    <Volume2 size={44} className={isPlayingAudio ? 'text-sky-200' : 'text-zinc-300'} />
                                </div>
                                <h2 className="mt-5 text-xl font-semibold text-white">AI Interviewer</h2>
                                <div className="mt-3 flex items-center gap-2 rounded-md bg-black/35 px-3 py-1.5 text-sm text-zinc-200">
                                    <span className={`h-2.5 w-2.5 rounded-full ${isPlayingAudio ? 'bg-sky-300' : 'bg-zinc-500'}`} />
                                    {isPlayingAudio ? 'Speaking' : turn === 'user' && isRecording ? 'Listening' : 'Ready'}
                                    <span className={`voice-bars ml-1 ${isPlayingAudio ? 'opacity-100' : 'opacity-30'}`}>
                                        <span className="voice-bar bg-sky-300" />
                                        <span className="voice-bar bg-sky-300" />
                                        <span className="voice-bar bg-sky-300" />
                                        <span className="voice-bar bg-sky-300" />
                                    </span>
                                </div>
                            </div>
                            <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded bg-black/55 px-2.5 py-1.5 text-sm font-medium text-white backdrop-blur">
                                <Volume2 size={15} />
                                Interviewer
                            </div>
                        </div>

                        <div className={`relative min-h-[280px] overflow-hidden rounded-lg border bg-[#202020] shadow-2xl transition ${turn === 'user'
                            ? 'border-emerald-400/70 ring-2 ring-emerald-400/25'
                            : 'border-white/10'
                            }`}>
                            {cameraStatus === 'ready' && cameraEnabled ? (
                                <video
                                    ref={videoRef}
                                    className="h-full min-h-[280px] w-full object-cover"
                                    autoPlay
                                    muted
                                    playsInline
                                />
                            ) : (
                                <div className="flex h-full min-h-[280px] flex-col items-center justify-center bg-[linear-gradient(145deg,#252525,#161616)] p-6 text-center">
                                    <div className="flex h-28 w-28 items-center justify-center rounded-full border border-white/10 bg-white/5">
                                        {cameraStatus === 'requesting' ? (
                                            <Loader2 size={42} className="animate-spin text-zinc-300" />
                                        ) : (
                                            <CameraOff size={42} className="text-zinc-300" />
                                        )}
                                    </div>
                                    <h2 className="mt-5 text-xl font-semibold text-white">You</h2>
                                    <p className="mt-2 max-w-xs text-sm text-zinc-400">
                                        {cameraStatus === 'requesting'
                                            ? 'Camera permission requested'
                                            : cameraStatus === 'blocked'
                                                ? 'Camera permission blocked'
                                                : cameraStatus === 'unsupported'
                                                    ? 'Camera unavailable'
                                                    : 'Camera off'}
                                    </p>
                                    {cameraStatus !== 'requesting' && (
                                        <button
                                            onClick={requestCameraAccess}
                                            className="mt-4 inline-flex items-center gap-2 rounded-md bg-[#2d8cff] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#1f7ae0]"
                                        >
                                            <Camera size={16} />
                                            Enable camera
                                        </button>
                                    )}
                                </div>
                            )}

                            <div className="absolute left-3 top-3 flex items-center gap-2 rounded-md border border-white/10 bg-black/55 px-3 py-1.5 text-sm text-white backdrop-blur">
                                {isRecording ? <Mic size={15} className="text-emerald-300" /> : <MicOff size={15} className="text-zinc-300" />}
                                {isRecording ? formatTime(recordingTime) : 'Muted'}
                                <span className={`voice-bars ${isRecording ? 'opacity-100' : 'opacity-25'}`}>
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
                            <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded bg-black/55 px-2.5 py-1.5 text-sm font-medium text-white backdrop-blur">
                                {cameraStatus === 'ready' && cameraEnabled ? <Camera size={15} /> : <CameraOff size={15} />}
                                Candidate
                            </div>
                        </div>
                    </div>

                </section>

                <aside className="flex min-h-[560px] flex-col border-l border-white/10 bg-[#1f1f1f]">
                    <div className="border-b border-white/10 px-5 py-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-sm font-semibold text-white">Interview Console</h2>
                                <p className="mt-1 text-xs text-zinc-400">
                                    {pressureLevel !== 'off' ? getPressureConfig(pressureLevel).label : 'Standard session'}
                                </p>
                            </div>
                            {loading && <Loader2 className="animate-spin text-sky-300" size={18} />}
                        </div>
                    </div>

                    <div className="flex-1 space-y-4 overflow-y-auto p-5">
                        <section className="rounded-lg border border-white/10 bg-[#282828] p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Current Prompt</p>
                                {currentQuestion?.difficulty && (
                                    <span className="rounded bg-white/10 px-2 py-1 text-xs text-zinc-300">Level {currentQuestion.difficulty}</span>
                                )}
                            </div>
                            {phase === 'ai_intro' && <p className="text-sm leading-6 text-zinc-100">{aiIntroText || 'Preparing introduction...'}</p>}
                            {phase === 'user_intro' && (
                                <p className="text-sm leading-6 text-zinc-100">Introduce yourself, your experience, and what you are looking for.</p>
                            )}
                            {phase === 'questioning' && currentQuestion && (
                                <p className="text-sm leading-6 text-zinc-100">{currentQuestion.question_text}</p>
                            )}
                        </section>

                        {(cameraStatus === 'requesting' || cameraStatus === 'blocked' || cameraStatus === 'unsupported') && (
                            <section className="rounded-lg border border-sky-400/25 bg-sky-500/10 p-4">
                                <div className="flex items-start gap-3">
                                    <Camera className="mt-0.5 shrink-0 text-sky-200" size={18} />
                                    <div>
                                        <p className="text-sm font-medium text-sky-100">
                                            {cameraStatus === 'requesting'
                                                ? 'Waiting for camera permission'
                                                : cameraStatus === 'blocked'
                                                    ? 'Camera permission needs attention'
                                                    : 'Camera is not available'}
                                        </p>
                                        {cameraStatus !== 'requesting' && (
                                            <button
                                                onClick={requestCameraAccess}
                                                className="mt-3 rounded-md border border-sky-300/40 bg-sky-400/10 px-3 py-2 text-xs font-medium text-sky-100 transition hover:bg-sky-400/20"
                                            >
                                                Request permission
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </section>
                        )}

                        {sessionNotice && (
                            <section className="rounded-lg border border-cyan-400/25 bg-cyan-500/10 p-4 animate-panel-in">
                                <p className="text-sm leading-6 text-cyan-50">{sessionNotice}</p>
                            </section>
                        )}

                        {pressureLevel !== 'off' && (
                            <section className="rounded-lg border border-rose-400/25 bg-rose-500/10 p-4 animate-panel-in">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-semibold text-rose-100">{getPressureConfig(pressureLevel).label}</p>
                                    <span className="text-xs text-rose-100">{Math.round(getPressureConfig(pressureLevel).maxRecordingMs / 1000)}s</span>
                                </div>
                                <p className="mt-2 text-sm leading-6 text-zinc-200">{getPressureConfig(pressureLevel).banner}</p>
                            </section>
                        )}

                        {error && (
                            <section className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-4 animate-panel-in">
                                <div className="flex items-start justify-between gap-3">
                                    <p className="text-sm leading-6 text-rose-50">{error}</p>
                                    <button
                                        onClick={() => setError(null)}
                                        aria-label="Dismiss error"
                                        title="Dismiss"
                                        className="rounded-md border border-rose-300/30 p-1 text-rose-100 transition hover:bg-rose-500/20"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            </section>
                        )}

                        {feedback && (
                            <section className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 p-4 animate-panel-in">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-semibold text-emerald-100">Evaluation</p>
                                    <p className="text-2xl font-semibold text-white">{feedback.final_score}</p>
                                </div>
                                <p className="mt-2 text-sm leading-6 text-zinc-100">{feedback.feedback_text}</p>
                            </section>
                        )}

                        {liveCoachingEnabled && (isRecording || liveCoachingCues.length > 0) && (
                            <section className="rounded-lg border border-amber-400/25 bg-amber-500/10 p-4 animate-panel-in">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-semibold text-amber-100">Live Coach</p>
                                    <Sparkles size={16} className="text-amber-200" />
                                </div>
                                {isRecording ? (
                                    <p className="mt-2 text-sm leading-6 text-zinc-100">
                                        {normalizeText(currentQuestion?.topic || '').includes('behavioral')
                                            ? 'Use STAR: context, role, action, result.'
                                            : 'Answer first, then cover assumptions, trade-offs, and edge cases.'}
                                    </p>
                                ) : null}
                                {liveCoachingCues.length > 0 ? (
                                    <div className="mt-3 space-y-2">
                                        {liveCoachingCues.map((cue) => (
                                            <p key={cue} className="rounded-md bg-black/25 px-3 py-2 text-sm leading-5 text-zinc-100">
                                                {cue}
                                            </p>
                                        ))}
                                    </div>
                                ) : null}
                            </section>
                        )}

                        {audioMetrics && (
                            <section className="grid grid-cols-2 gap-2 text-sm">
                                <div className="rounded-lg border border-white/10 bg-[#282828] p-3">
                                    <p className="text-xs text-zinc-500">Emotion</p>
                                    <p className="mt-1 capitalize text-zinc-100">{audioMetrics.emotion}</p>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-[#282828] p-3">
                                    <p className="text-xs text-zinc-500">Confidence</p>
                                    <p className="mt-1 text-zinc-100">{audioMetrics.confidence_score}/10</p>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-[#282828] p-3">
                                    <p className="text-xs text-zinc-500">WPM</p>
                                    <p className="mt-1 text-zinc-100">{audioMetrics.wpm}</p>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-[#282828] p-3">
                                    <p className="text-xs text-zinc-500">Gaps</p>
                                    <p className="mt-1 text-zinc-100">{audioMetrics.gaps.length}</p>
                                </div>
                            </section>
                        )}
                    </div>

                    <div className="border-t border-white/10 p-4">
                        <div className="relative">
                            <textarea
                                className="min-h-[96px] w-full resize-none rounded-lg border border-white/10 bg-[#151515] p-3 pr-14 text-sm leading-5 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-sky-400/60"
                                placeholder="Type an answer..."
                                value={textAnswer}
                                onChange={(e) => setTextAnswer(e.target.value)}
                            />
                            <button
                                onClick={handleTextSubmit}
                                disabled={!textAnswer.trim() || loading}
                                aria-label="Send answer"
                                title="Send"
                                className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-md bg-[#2d8cff] text-white transition hover:bg-[#1f7ae0] disabled:cursor-not-allowed disabled:opacity-45"
                            >
                                <Send size={17} />
                            </button>
                        </div>
                    </div>
                </aside>
            </main>
        </div>
    );
}
