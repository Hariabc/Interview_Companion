'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import MonacoEditor from '@monaco-editor/react';
import { supabase } from '@/lib/supabaseClient';
import { Play, CheckCircle2, ArrowLeft, Code2, Gauge, TerminalSquare, Sparkles, CheckCheck } from 'lucide-react';
import { AppLoadingScreen } from '@/components/AppLoadingScreen';
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
const FEMALE_VOICE_HINTS = ['jenny', 'aria', 'zira', 'sara', 'emma', 'female', 'woman'];
const MALE_VOICE_HINTS = ['guy', 'davis', 'mark', 'david', 'andrew', 'male', 'man'];

type InterviewerGender = 'female' | 'male';

interface CodingChallenge {
    id: string;
    title: string;
    prompt: string;
    languages: string[];
    starter_code: Record<string, string>;
    visible_tests: Array<{ input: string; expected: string }>;
    intro_audio_base64?: string | null;
    interviewer_gender?: InterviewerGender;
}

interface CodingRunResult {
    mode: 'run' | 'submit';
    passed: number;
    total: number;
    run_count?: number;
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
    coding_round_report?: {
        language: string;
        run_count: number;
        submit_count: number;
        visible_passed: number;
        visible_total: number;
        hidden_passed: number;
        hidden_total: number;
        completed_test_cases: number;
        code_metrics?: {
            line_count: number;
            non_empty_line_count: number;
            character_count: number;
        };
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
    const interviewerGenderRef = useRef<InterviewerGender>('female');

    const handleEditorMount = (editor: any, monaco: any) => {
        monaco.editor.defineTheme('interview-companion-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'comment', foreground: '6b7a99' },
                { token: 'keyword', foreground: '7dd3fc' },
                { token: 'string', foreground: '86efac' },
                { token: 'number', foreground: 'f9a8d4' }
            ],
            colors: {
                'editor.background': '#08111f',
                'editor.foreground': '#e5ecff',
                'editor.lineHighlightBackground': '#0f1b33',
                'editorLineNumber.foreground': '#51617f',
                'editorLineNumber.activeForeground': '#cbd5e1',
                'editor.selectionBackground': '#13304d',
                'editorCursor.foreground': '#67e8f9',
                'editorIndentGuide.background1': '#102038'
            }
        });
        monaco.editor.setTheme('interview-companion-dark');
        editor.focus();
    };

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
            const hints = interviewerGenderRef.current === 'male' ? MALE_VOICE_HINTS : FEMALE_VOICE_HINTS;
            const preferredVoice =
                voices.find((v) => hints.some((hint) => v.name.toLowerCase().includes(hint))) ||
                voices.find((v) => hints.some((hint) => v.voiceURI.toLowerCase().includes(hint)));
            if (preferredVoice) utterance.voice = preferredVoice;
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
                const storedGender = typeof window !== 'undefined'
                    ? sessionStorage.getItem(`ic_interviewer_gender_${sessionId}`)
                    : null;
                const gender =
                    payload.interviewer_gender === 'male' || payload.interviewer_gender === 'female'
                        ? payload.interviewer_gender
                        : storedGender === 'male' || storedGender === 'female'
                            ? storedGender
                            : 'female';
                interviewerGenderRef.current = gender;
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

    const latestReport = result?.coding_round_report || null;
    const currentCode = codeByLanguage[language] || '';

    if (loading) {
        return (
            <AppLoadingScreen
                badge="Coding Round"
                title="Setting up your coding challenge"
                description="We are loading the personalized problem, starter code, allowed languages, and coding-round context before the editor opens."
                stageLabel="Preparing editor"
                steps={['Loading challenge details', 'Preparing starter code', 'Opening your coding workspace']}
                compact
            />
        );
    }

    return (
        <div className="app-shell p-4 lg:p-6">
            <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 lg:grid-cols-3">
                <section className="glass-card lg:col-span-2 overflow-hidden">
                    <div className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(56,189,248,0.08),rgba(15,23,42,0.08))] p-5">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <p className="pill mb-3">Coding Interview Round</p>
                                <h1 className="text-2xl font-semibold text-slate-50" style={{ fontFamily: 'var(--font-space-grotesk), sans-serif' }}>
                                    {challenge?.title || 'Coding Round'}
                                </h1>
                                <p className="mt-2 max-w-3xl text-sm subtle-text">
                                    Solve the challenge, validate against sample cases, and submit for optimization feedback and complexity analysis.
                                </p>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                                <MetricBadge label="Language" value={language.toUpperCase()} icon={Code2} />
                                <MetricBadge label="Visible Tests" value={`${challenge?.visible_tests?.length || 0}`} icon={TerminalSquare} />
                                <MetricBadge label="Runs" value={`${result?.run_count || latestReport?.run_count || 0}`} icon={Gauge} />
                                <MetricBadge label="Passed" value={`${result?.passed || 0}/${result?.total || challenge?.visible_tests?.length || 0}`} icon={CheckCheck} />
                            </div>
                        </div>
                    </div>

                    <div className="p-4 md:p-5">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <div className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100">
                                    Interview editor
                                </div>
                                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                                    Real-time sample test validation
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <select
                                    value={language}
                                    onChange={(e) => setLanguage(e.target.value)}
                                    className="rounded-xl border border-white/20 bg-slate-950 px-3 py-2 text-xs text-slate-100"
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
                                    <Play size={14} /> Run Tests
                                </button>
                                <button
                                    onClick={submitCode}
                                    disabled={running}
                                    className="brand-btn px-3 py-2 text-xs disabled:opacity-50 flex items-center gap-1"
                                >
                                    <CheckCircle2 size={14} /> Final Submit
                                </button>
                            </div>
                        </div>

                        <div className="overflow-hidden rounded-2xl border border-white/15 shadow-[0_32px_80px_-46px_rgba(56,189,248,0.35)]">
                            <div className="flex items-center gap-2 border-b border-white/10 bg-slate-950/90 px-4 py-3">
                                <span className="h-3 w-3 rounded-full bg-rose-400/80" />
                                <span className="h-3 w-3 rounded-full bg-amber-300/80" />
                                <span className="h-3 w-3 rounded-full bg-emerald-400/80" />
                                <div className="ml-3 text-xs text-slate-400">{language}.{language === 'python' ? 'py' : language === 'javascript' ? 'js' : language === 'cpp' ? 'cpp' : language === 'java' ? 'java' : 'sql'}</div>
                            </div>
                            <div className="min-h-[520px]">
                                <MonacoEditor
                                    height="520px"
                                    onMount={handleEditorMount}
                                    language={MONACO_LANGUAGE_MAP[language] || 'plaintext'}
                                    value={currentCode}
                                    onChange={(value) => setCodeByLanguage((prev) => ({ ...prev, [language]: value || '' }))}
                                    options={{
                                        fontSize: 14,
                                        minimap: { enabled: false },
                                        scrollBeyondLastLine: false,
                                        wordWrap: 'on',
                                        automaticLayout: true,
                                        fontLigatures: true,
                                        padding: { top: 18, bottom: 18 },
                                        smoothScrolling: true
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </section>

                <aside className="glass-card flex flex-col p-4 md:p-5">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <h2 className="text-sm uppercase tracking-wide text-slate-400 mb-2">Challenge Brief</h2>
                        <div className="text-sm whitespace-pre-wrap text-slate-200">
                            {challenge?.prompt}
                        </div>
                    </div>

                    <div className="mt-4">
                        <h2 className="text-sm uppercase tracking-wide text-slate-400 mb-2">Sample Tests</h2>
                        <div className="space-y-2 max-h-52 overflow-auto">
                        {(challenge?.visible_tests || []).map((t, idx) => (
                            <div key={idx} className="bg-slate-950/70 border border-white/10 rounded-lg p-2 text-xs">
                                <p className="text-slate-400">Test {idx + 1}</p>
                                <p>Input: <span className="font-mono whitespace-pre-wrap">{t.input}</span></p>
                                <p>Expected: <span className="font-mono">{t.expected}</span></p>
                            </div>
                        ))}
                        </div>
                    </div>

                    {result && (
                        <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-xs space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-slate-100 font-semibold">Current Result</p>
                                <span className={`rounded-full border px-3 py-1 ${result.all_passed ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border-amber-300/20 bg-amber-400/10 text-amber-100'}`}>
                                    {result.passed}/{result.total} passed
                                </span>
                            </div>
                            {result.feedback && (
                                <div className="space-y-1">
                                    <p className="text-cyan-300">{result.feedback.summary}</p>
                                    <p>Time: {result.feedback.time_complexity}</p>
                                    <p>Space: {result.feedback.space_complexity}</p>
                                    {!!result.feedback.optimizations?.length && <p>Optimizations: {result.feedback.optimizations.join(' | ')}</p>}
                                    {!!result.feedback.positives?.length && <p>Positives: {result.feedback.positives.join(' | ')}</p>}
                                    {!!result.feedback.negatives?.length && <p>Needs work: {result.feedback.negatives.join(' | ')}</p>}
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
                                    className="mt-1 rounded-lg bg-slate-800 px-3 py-1.5 text-[11px] hover:bg-slate-700"
                                >
                                    Replay Feedback Voice
                                </button>
                            )}
                        </div>
                    )}

                    {latestReport && (
                        <div className="mt-4 rounded-2xl border border-emerald-400/15 bg-emerald-500/10 p-4 text-xs space-y-2">
                            <p className="text-sm font-semibold text-emerald-100">Submission Summary</p>
                            <p className="text-slate-200">Runs before submission: {latestReport.run_count}</p>
                            <p className="text-slate-200">Visible tests: {latestReport.visible_passed}/{latestReport.visible_total}</p>
                            <p className="text-slate-200">Hidden tests: {latestReport.hidden_passed}/{latestReport.hidden_total}</p>
                            <p className="text-slate-200">Code size: {latestReport.code_metrics?.non_empty_line_count || 0} non-empty lines</p>
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

function MetricBadge({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-lg">
            <div className="flex items-center gap-2 text-slate-300">
                <Icon size={14} className="text-cyan-300" />
                <span className="text-[11px] uppercase tracking-[0.2em]">{label}</span>
            </div>
            <p className="mt-2 text-sm font-medium text-slate-100">{value}</p>
        </div>
    );
}
