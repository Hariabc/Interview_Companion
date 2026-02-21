'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { CheckSquare, Square, Sparkles, Brain, MessageCircle } from 'lucide-react';
import axios from 'axios';
import ResumeUpload from '@/components/ResumeUpload';

// NOTE: In production, point to backend URL
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
const MIN_LAUNCH_SCREEN_MS = 6500;

export default function InterviewSetup() {
    const router = useRouter();
    const [skipResume, setSkipResume] = useState(false);
    const [topics, setTopics] = useState<string[]>([]);
    const [consent, setConsent] = useState(false);
    const [loading, setLoading] = useState(false);
    const [tipIndex, setTipIndex] = useState(0);

    const availableTopics = ['React', 'Node.js', 'System Design', 'Behavioral', 'SQL', 'Python'];
    const interviewTips = [
        'Use the first 20 seconds to structure your answer before details.',
        'Think in frameworks: STAR for behavioral, tradeoffs for system design.',
        'Say assumptions out loud before solving technical questions.',
        'Keep eye contact with the camera and pause briefly between points.',
        'When unsure, explain your approach and ask clarifying questions.'
    ];

    useEffect(() => {
        if (!loading) {
            return;
        }

        const interval = setInterval(() => {
            setTipIndex((prev) => (prev + 1) % interviewTips.length);
        }, 2200);

        return () => clearInterval(interval);
    }, [loading, interviewTips.length]);

    const toggleTopic = (t: string) => {
        if (topics.includes(t)) setTopics(topics.filter(i => i !== t));
        else setTopics([...topics, t]);
    };

    const handleStart = async () => {
        if (!consent) return alert("Please adhere to the research consent.");
        if (topics.length === 0) return alert("Select at least one topic.");
        // File upload logic would go here (upload to Supabase Storage -> parse via ML)
        // For MVP, we'll skip actual file parsing flow and just start session with topics.

        const launchStartedAt = Date.now();
        setLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Not authenticated");

            const response = await axios.post(`${BACKEND_URL}/interviews/start`, {
                topics,
                resumeId: null, // or expected ID after upload
                skipResume
            }, {
                headers: { Authorization: `Bearer ${session.access_token}` }
            });

            const elapsed = Date.now() - launchStartedAt;
            const remaining = Math.max(0, MIN_LAUNCH_SCREEN_MS - elapsed);
            if (remaining > 0) {
                await new Promise((resolve) => setTimeout(resolve, remaining));
            }

            const sessionId = response.data.session.id; // Assuming backend returns created session
            router.push(`/interview/session/${sessionId}`);

        } catch (e: any) {
            console.error(e);
            alert("Failed to start session: " + e.message);
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="app-shell flex items-center justify-center p-4">
                <div className="glass-card w-full max-w-2xl p-8">
                    <div className="mb-4 flex items-center justify-center gap-3 text-cyan-300">
                        <Sparkles size={20} className="animate-pulse" />
                        <h2 className="text-2xl font-bold">Preparing Your Interview Room</h2>
                    </div>

                    <p className="subtle-text mb-6 text-center">
                        Loading your selected topics and generating your first AI prompts...
                    </p>

                    <div className="mb-5 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
                            style={{ width: `${((tipIndex + 1) / interviewTips.length) * 100}%` }}
                        />
                    </div>

                    <div className="flex min-h-[96px] items-start gap-3 rounded-xl border border-white/10 bg-slate-950/60 p-5">
                        <MessageCircle className="text-cyan-400 mt-0.5" size={18} />
                        <div>
                            <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Interview Tip</p>
                            <p className="text-slate-100">{interviewTips[tipIndex]}</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="app-shell flex flex-col items-center justify-center p-4">
            <div className="glass-card max-w-3xl w-full p-8">
                <div className="mb-2 flex items-center justify-center gap-3">
                    <Brain className="text-cyan-300" size={24} />
                    <h1 className="section-title text-center" style={{ fontFamily: 'var(--font-space-grotesk), sans-serif' }}>Setup Your Interview</h1>
                </div>
                <p className="subtle-text mb-8 text-center">Choose topics and launch a real-time, turn-based virtual interview.</p>

                {/* Resume Upload */}
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-4">
                        <label className="flex cursor-pointer items-center gap-2 text-slate-300 hover:text-white">
                            <input
                                type="checkbox"
                                checked={skipResume}
                                onChange={(e) => setSkipResume(e.target.checked)}
                                className="h-5 w-5 rounded border-slate-700 bg-slate-800 bg-opacity-50 text-cyan-600 focus:ring-cyan-500"
                            />
                            <span>I don't have a resume / Practice topics only</span>
                        </label>
                    </div>

                    {!skipResume && (
                        <div className={`transition-all duration-300 ${skipResume ? 'opacity-50 pointer-events-none' : ''}`}>
                            <ResumeUpload />
                        </div>
                    )}
                </div>

                {/* Topics */}
                <div className="mb-8">
                    <label className="block text-sm font-medium text-slate-400 mb-2">Select Topics</label>
                    <div className="flex flex-wrap gap-3">
                        {availableTopics.map(t => (
                            <button
                                key={t}
                                onClick={() => toggleTopic(t)}
                                className={`rounded-full border px-4 py-2 transition ${topics.includes(t)
                                    ? 'border-cyan-500 bg-cyan-500/20 text-cyan-100'
                                    : 'border-white/15 bg-white/5 text-slate-300 hover:border-white/30'
                                    }`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Consent */}
                <div className="mb-8 flex items-start gap-3 rounded-lg border border-cyan-800/40 bg-cyan-950/30 p-4">
                    <button onClick={() => setConsent(!consent)} className="mt-1 text-cyan-300">
                        {consent ? <CheckSquare size={20} /> : <Square size={20} />}
                    </button>
                    <p className="text-sm text-slate-300">
                        I agree to participate in this research experiment. My interview data (audio, scores) will be logged anonymously for improving AI evaluation models.
                    </p>
                </div>

                <button
                    onClick={handleStart}
                    disabled={loading || !consent}
                    className="brand-btn w-full py-4 text-lg font-bold disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {loading ? 'Launching Interview Room...' : 'Start Mock Interview'}
                </button>

                {loading && (
                    <div className="mt-6 bg-slate-950/70 border border-slate-700/50 rounded-xl p-5">
                        <div className="flex items-center gap-2 mb-3 text-cyan-300">
                            <Sparkles size={16} className="animate-pulse" />
                            <p className="text-sm font-medium">Interview tips while we prepare your session</p>
                        </div>

                        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden mb-4">
                            <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full animate-[pulse_1.3s_ease-in-out_infinite]" style={{ width: `${((tipIndex + 1) / interviewTips.length) * 100}%` }} />
                        </div>

                        <div className="flex items-start gap-3 min-h-[54px]">
                            <MessageCircle className="text-cyan-400 mt-0.5" size={18} />
                            <p className="text-sm text-slate-200 animate-pulse">{interviewTips[tipIndex]}</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
