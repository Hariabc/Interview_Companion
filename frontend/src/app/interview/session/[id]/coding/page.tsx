'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import axios from 'axios';
import { supabase } from '@/lib/supabaseClient';
import { Loader2, Play, CheckCircle2, ArrowLeft } from 'lucide-react';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
const FEMALE_VOICE_HINTS = ['jenny', 'aria', 'zira', 'sara', 'emma', 'female', 'woman'];

interface CodingChallenge {
    id: string;
    title: string;
    prompt: string;
    languages: string[];
    starter_code: Record<string, string>;
    visible_tests: Array<{ input: string; expected: string }>;
    intro_audio_base64?: string | null;
}

interface CodingRunResult {
    mode: 'run' | 'submit';
    passed: number;
    total: number;
    all_passed?: boolean;
    results: Array<{
        hidden?: boolean;
        input: string;
        expected: string;
        output: string;
        stderr: string;
        passed: boolean;
    }>;
    feedback?: {
        summary: string;
        time_complexity: string;
        space_complexity: string;
        optimizations: string[];
        positives: string[];
        negatives: string[];
    };
    feedback_audio_base64?: string | null;
}

const MONACO_LANGUAGE_MAP: Record<string, string> = {
    python: 'python',
    javascript: 'javascript',
    cpp: 'cpp',
    java: 'java',
    sql: 'sql'
};

export default function CodingRoundPage() {
    const params = useParams();
    const router = useRouter();
    const sessionId = Array.isArray(params.id) ? params.id[0] : (params.id as string);

    const [sessionToken, setSessionToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [challenge, setChallenge] = useState<CodingChallenge | null>(null);
    const [language, setLanguage] = useState('python');
    const [codeByLanguage, setCodeByLanguage] = useState<Record<string, string>>({});
    const [result, setResult] = useState<CodingRunResult | null>(null);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const hasInitializedRef = useRef(false);

    const speakFeedback = (text?: string | null) => {
        if (!text?.trim()) return;
        try {
            if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = '';
                audioRef.current = null;
            }
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1;
            utterance.pitch = 1;
            const voices = window.speechSynthesis.getVoices();
            const preferredFemaleVoice =
                voices.find((v) => FEMALE_VOICE_HINTS.some((hint) => v.name.toLowerCase().includes(hint))) ||
                voices.find((v) => FEMALE_VOICE_HINTS.some((hint) => v.voiceURI.toLowerCase().includes(hint)));
            if (preferredFemaleVoice) utterance.voice = preferredFemaleVoice;
            window.speechSynthesis.speak(utterance);
        } catch {
            // ignore fallback errors
        }
    };

    const getAuthToken = async (): Promise<string> => {
        if (sessionToken) return sessionToken;
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || '';
        if (token) setSessionToken(token);
        return token;
    };

    useEffect(() => {
        if (hasInitializedRef.current) {
            return;
        }
        hasInitializedRef.current = true;

        const init = async () => {
            try {
                if (!sessionId) {
                    throw new Error('Session id is missing');
                }
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) {
                    router.push('/login');
                    return;
                }
                setSessionToken(session.access_token);

                const response = await axios.get(`${BACKEND_URL}/coding/challenge`, {
                    params: { session_id: sessionId, round: 1 },
                    headers: { Authorization: `Bearer ${session.access_token}` }
                });
                const payload = response.data as CodingChallenge;
                setChallenge(payload);
                setLanguage(payload.languages?.[0] || 'python');
                setCodeByLanguage(payload.starter_code || {});

                const skipIntroAudio = typeof window !== 'undefined'
                    ? sessionStorage.getItem(`ic_skip_coding_intro_audio_${sessionId}`) === '1'
                    : false;
                if (typeof window !== 'undefined') {
                    sessionStorage.removeItem(`ic_skip_coding_intro_audio_${sessionId}`);
                }

                if (payload.intro_audio_base64 && !skipIntroAudio) {
                    const audio = new Audio(`data:audio/mp3;base64,${payload.intro_audio_base64}`);
                    audioRef.current = audio;
                    audio.play().catch(() => undefined);
                }
            } catch (err: any) {
                setError(err?.response?.data?.error || err?.message || 'Failed to load coding round');
            } finally {
                setLoading(false);
            }
        };

        init();
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = '';
            }
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
        };
    }, [router, sessionId]);

    const runCode = async () => {
        if (!challenge) return;
        const code = codeByLanguage[language] || '';
        if (!code.trim()) {
            setError('Please write code before running.');
            return;
        }
        try {
            setRunning(true);
            let token = await getAuthToken();
            if (!token) throw new Error('Session expired. Please login again.');
            const response = await axios.post(
                `${BACKEND_URL}/coding/run`,
                { language, code, session_id: sessionId, challenge_id: challenge.id },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setResult(response.data);
        } catch (err: any) {
            if (err?.response?.status === 401) {
                try {
                    const token = await getAuthToken();
                    if (!token) throw err;
                    const retry = await axios.post(
                        `${BACKEND_URL}/coding/run`,
                        { language, code, session_id: sessionId, challenge_id: challenge.id },
                        { headers: { Authorization: `Bearer ${token}` } }
                    );
                    setResult(retry.data);
                    return;
                } catch {
                    setError('Unauthorized. Please login again and retry.');
                    return;
                }
            }
            setError(err?.response?.data?.error || err?.message || 'Run failed');
        } finally {
            setRunning(false);
        }
    };

    const submitCode = async () => {
        if (!challenge) return;
        const code = codeByLanguage[language] || '';
        if (!code.trim()) {
            setError('Please write code before submitting.');
            return;
        }
        try {
            setRunning(true);
            let token = await getAuthToken();
            if (!token) throw new Error('Session expired. Please login again.');
            const userTranscript = typeof window !== 'undefined'
                ? sessionStorage.getItem('ic_latest_transcript') || null
                : null;
            const response = await axios.post(
                `${BACKEND_URL}/coding/submit`,
                { language, code, userTranscript, session_id: sessionId, challenge_id: challenge.id },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const payload = response.data as CodingRunResult;
            setResult(payload);
            if (payload.feedback_audio_base64) {
                const audio = new Audio(`data:audio/mp3;base64,${payload.feedback_audio_base64}`);
                audioRef.current = audio;
                audio.play().catch(() => {
                    speakFeedback(payload.feedback?.summary || null);
                });
            } else {
                speakFeedback(payload.feedback?.summary || null);
            }
        } catch (err: any) {
            if (err?.response?.status === 401) {
                try {
                    const token = await getAuthToken();
                    if (!token) throw err;
                    const userTranscript = typeof window !== 'undefined'
                        ? sessionStorage.getItem('ic_latest_transcript') || null
                        : null;
                    const retry = await axios.post(
                        `${BACKEND_URL}/coding/submit`,
                        { language, code, userTranscript, session_id: sessionId, challenge_id: challenge.id },
                        { headers: { Authorization: `Bearer ${token}` } }
                    );
                    const payload = retry.data as CodingRunResult;
                    setResult(payload);
                    if (payload.feedback_audio_base64) {
                        const audio = new Audio(`data:audio/mp3;base64,${payload.feedback_audio_base64}`);
                        audioRef.current = audio;
                        audio.play().catch(() => {
                            speakFeedback(payload.feedback?.summary || null);
                        });
                    } else {
                        speakFeedback(payload.feedback?.summary || null);
                    }
                    return;
                } catch {
                    setError('Unauthorized. Please login again and retry.');
                    return;
                }
            }
            setError(err?.response?.data?.error || err?.message || 'Submit failed');
        } finally {
            setRunning(false);
        }
    };

    const continueInterview = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = '';
            audioRef.current = null;
        }
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        if (typeof window !== 'undefined') {
            sessionStorage.setItem(`ic_coding_done_${sessionId}`, '1');
        }
        router.push(`/interview/session/${sessionId}?resumeFromCoding=1`);
    };

    if (loading) {
        return (
            <div className="app-shell flex items-center justify-center">
                <div className="glass-card flex items-center gap-3 px-6 py-4">
                    <Loader2 className="animate-spin text-cyan-400" />
                    <p>Loading coding round...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="app-shell p-4 lg:p-6">
            <div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-4">
                <section className="glass-card lg:col-span-2 p-4 flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                        <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-space-grotesk), sans-serif' }}>{challenge?.title || 'Coding Round'}</h1>
                        <div className="flex items-center gap-2">
                            <select
                                value={language}
                                onChange={(e) => setLanguage(e.target.value)}
                                className="rounded border border-white/20 bg-slate-950 px-2 py-1 text-xs"
                            >
                                {(challenge?.languages || []).map((lang) => (
                                    <option key={lang} value={lang}>{lang}</option>
                                ))}
                            </select>
                            <button
                                onClick={runCode}
                                disabled={running}
                                className="ghost-btn px-3 py-2 text-xs disabled:opacity-50 flex items-center gap-1"
                            >
                                <Play size={14} /> Run
                            </button>
                            <button
                                onClick={submitCode}
                                disabled={running}
                                className="brand-btn px-3 py-2 text-xs disabled:opacity-50 flex items-center gap-1"
                            >
                                <CheckCircle2 size={14} /> Submit
                            </button>
                        </div>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-white/15 flex-1 min-h-[420px]">
                        <MonacoEditor
                            height="100%"
                            theme="vs-dark"
                            language={MONACO_LANGUAGE_MAP[language] || 'plaintext'}
                            value={codeByLanguage[language] || ''}
                            onChange={(value) => setCodeByLanguage((prev) => ({ ...prev, [language]: value || '' }))}
                            options={{
                                fontSize: 14,
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                wordWrap: 'on',
                                automaticLayout: true
                            }}
                        />
                    </div>
                </section>

                <aside className="glass-card p-4 flex flex-col">
                    <h2 className="text-sm uppercase tracking-wide text-slate-400 mb-2">Problem</h2>
                    <div className="bg-slate-950/70 border border-white/10 rounded-xl p-3 text-sm whitespace-pre-wrap mb-3">
                        {challenge?.prompt}
                    </div>

                    <h2 className="text-sm uppercase tracking-wide text-slate-400 mb-2">Sample Tests</h2>
                    <div className="space-y-2 mb-3 max-h-52 overflow-auto">
                        {(challenge?.visible_tests || []).map((t, idx) => (
                            <div key={idx} className="bg-slate-950/70 border border-white/10 rounded-lg p-2 text-xs">
                                <p className="text-slate-400">Test {idx + 1}</p>
                                <p>Input: <span className="font-mono whitespace-pre-wrap">{t.input}</span></p>
                                <p>Expected: <span className="font-mono">{t.expected}</span></p>
                            </div>
                        ))}
                    </div>

                    {result && (
                        <div className="bg-slate-950/70 border border-white/10 rounded-xl p-3 text-xs space-y-2 mb-3">
                            <p className="text-slate-200">Result: {result.passed}/{result.total} passed</p>
                            {result.feedback && (
                                <div className="space-y-1">
                                    <p className="text-cyan-300">{result.feedback.summary}</p>
                                    <p>Time: {result.feedback.time_complexity}</p>
                                    <p>Space: {result.feedback.space_complexity}</p>
                                    {!!result.feedback.optimizations?.length && <p>Optimizations: {result.feedback.optimizations.join(' | ')}</p>}
                                </div>
                            )}
                            <div className="max-h-40 overflow-auto space-y-1">
                                {result.results.map((r, idx) => (
                                    <p key={idx} className={r.passed ? 'text-emerald-300' : 'text-rose-300'}>
                                        Case {idx + 1}: {r.passed ? 'PASS' : 'FAIL'} {r.stderr ? `(stderr: ${r.stderr})` : ''}
                                    </p>
                                ))}
                            </div>
                            {result.feedback?.summary && (
                                <button
                                    onClick={() => speakFeedback(result.feedback?.summary || null)}
                                    className="mt-1 rounded bg-slate-700 px-2 py-1 text-[11px] hover:bg-slate-600"
                                >
                                    Replay Feedback Voice
                                </button>
                            )}
                        </div>
                    )}

                    <button
                        onClick={continueInterview}
                        className="brand-btn mt-auto w-full py-3 font-semibold flex items-center justify-center gap-2"
                    >
                        <ArrowLeft size={16} /> Continue Interview
                    </button>

                    {error && <p className="text-rose-300 text-xs mt-3">{error}</p>}
                </aside>
            </div>
        </div>
    );
}
