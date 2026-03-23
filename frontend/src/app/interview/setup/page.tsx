'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import {
    CheckSquare,
    Square,
    Sparkles,
    Brain,
    MessageCircle,
    Users,
    Binary,
    Network,
    Zap,
    Briefcase
} from 'lucide-react';
import axios from 'axios';
import ResumeUpload from '@/components/ResumeUpload';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
const MIN_LAUNCH_SCREEN_MS = 6500;
const CODING_ENABLED_MODES = new Set<InterviewModeId>(['balanced', 'dsa_round', 'system_design', 'rapid_fire']);

type InterviewModeId =
    | 'balanced'
    | 'hr_round'
    | 'dsa_round'
    | 'salary_negotiation'
    | 'system_design'
    | 'behavioral_storytelling'
    | 'managerial_leadership'
    | 'rapid_fire';

type DifficultyPreference = 'easy' | 'medium' | 'hard';
type CoachStyle = 'supportive' | 'balanced' | 'strict';
type PressureLevel = 'off' | 'moderate' | 'intense';

const MODE_CONFIG: Array<{
    id: InterviewModeId;
    title: string;
    description: string;
    icon: any;
    defaults: string[];
}> = [
    {
        id: 'balanced',
        title: 'Balanced Mix',
        description: 'A practical blend of technical and behavioral rounds.',
        icon: Brain,
        defaults: ['React', 'Node.js', 'System Design', 'Behavioral']
    },
    {
        id: 'hr_round',
        title: 'HR Round',
        description: 'Communication, ownership, conflict handling, and culture fit.',
        icon: Users,
        defaults: ['Behavioral', 'Communication', 'Conflict Resolution']
    },
    {
        id: 'dsa_round',
        title: 'DSA Round',
        description: 'Algorithmic thinking, complexity analysis, and edge cases.',
        icon: Binary,
        defaults: ['Data Structures and Algorithms', 'Problem Solving']
    },
    {
        id: 'salary_negotiation',
        title: 'Salary Negotiation',
        description: 'Offer strategy, value framing, and objection handling.',
        icon: Briefcase,
        defaults: ['Salary Negotiation', 'Offer Strategy', 'Career Growth']
    },
    {
        id: 'system_design',
        title: 'System Design',
        description: 'Architecture trade-offs, scaling, and reliability scenarios.',
        icon: Network,
        defaults: ['System Design', 'Scalability', 'Architecture']
    },
    {
        id: 'behavioral_storytelling',
        title: 'Behavioral Storytelling',
        description: 'STAR-style stories with measurable impact and clarity.',
        icon: Briefcase,
        defaults: ['Behavioral', 'Leadership', 'Ownership']
    },
    {
        id: 'managerial_leadership',
        title: 'Managerial Leadership',
        description: 'People management, prioritization, and stakeholder alignment.',
        icon: Users,
        defaults: ['Leadership', 'Stakeholder Management', 'Execution']
    },
    {
        id: 'rapid_fire',
        title: 'Rapid Fire',
        description: 'High-frequency mixed questions to train fast thinking.',
        icon: Zap,
        defaults: ['JavaScript', 'Node.js', 'SQL', 'System Design']
    }
];

export default function InterviewSetup() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [skipResume, setSkipResume] = useState(false);
    const [topics, setTopics] = useState<string[]>([]);
    const [consent, setConsent] = useState(false);
    const [loading, setLoading] = useState(false);
    const [tipIndex, setTipIndex] = useState(0);
    const [selectedMode, setSelectedMode] = useState<InterviewModeId>('balanced');
    const [targetQuestions, setTargetQuestions] = useState(5);
    const [difficultyPreference, setDifficultyPreference] = useState<DifficultyPreference>('medium');
    const [coachStyle, setCoachStyle] = useState<CoachStyle>('balanced');
    const [liveCoachingEnabled, setLiveCoachingEnabled] = useState(true);
    const [pressureLevel, setPressureLevel] = useState<PressureLevel>('off');
    const availableTopics = [
        'React',
        'Node.js',
        'System Design',
        'Behavioral',
        'SQL',
        'Python',
        'Data Structures and Algorithms',
        'Problem Solving',
        'Communication',
        'Leadership',
        'Salary Negotiation',
        'Career Growth'
    ];

    const interviewTips = [
        'Use the first 20 seconds to structure your answer before details.',
        'Think in frameworks: STAR for behavioral, tradeoffs for system design.',
        'Say assumptions out loud before solving technical questions.',
        'When unsure, explain your approach and ask clarifying questions.',
        'Negotiate with data: market range, impact, and priorities.'
    ];

    const activeMode = useMemo(() => MODE_CONFIG.find((m) => m.id === selectedMode) || MODE_CONFIG[0], [selectedMode]);
    const codingRoundEnabled = CODING_ENABLED_MODES.has(selectedMode);

    useEffect(() => {
        const qMode = String(searchParams.get('mode') || '').toLowerCase() as InterviewModeId;
        if (MODE_CONFIG.some((m) => m.id === qMode)) {
            setSelectedMode(qMode);
        }
    }, [searchParams]);

    useEffect(() => {
        const defaults = activeMode.defaults;
        setTopics((prev) => Array.from(new Set([...defaults, ...prev])));
    }, [activeMode]);

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

    const applyModeDefaults = () => {
        setTopics((prev) => Array.from(new Set([...activeMode.defaults, ...prev])));
    };

    const handleStart = async () => {
        if (!consent) return alert('Please adhere to the research consent.');
        if (topics.length === 0) return alert('Select at least one topic.');

        const launchStartedAt = Date.now();
        setLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Not authenticated');

            const response = await axios.post(`${BACKEND_URL}/interviews/start`, {
                topics,
                resumeId: null,
                skipResume,
                interviewMode: selectedMode,
                targetQuestions,
                difficultyPreference,
                coachStyle,
                liveCoachingEnabled,
                pressureLevel
            }, {
                headers: { Authorization: `Bearer ${session.access_token}` }
            });

            const elapsed = Date.now() - launchStartedAt;
            const remaining = Math.max(0, MIN_LAUNCH_SCREEN_MS - elapsed);
            if (remaining > 0) {
                await new Promise((resolve) => setTimeout(resolve, remaining));
            }

            const sessionId = response.data.session.id;
            router.push(`/interview/session/${sessionId}`);

        } catch (e: any) {
            console.error(e);
            alert('Failed to start session: ' + e.message);
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
                        Applying {activeMode.title.toLowerCase()} settings and generating your first AI prompts...
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
            <div className="glass-card max-w-4xl w-full p-8">
                <div className="mb-2 flex items-center justify-center gap-3">
                    <Brain className="text-cyan-300" size={24} />
                    <h1 className="section-title text-center" style={{ fontFamily: 'var(--font-space-grotesk), sans-serif' }}>Setup Your Interview</h1>
                </div>
                <p className="subtle-text mb-8 text-center">Pick a round mode, tune the session controls, and launch your interview.</p>

                <div className="mb-8">
                    <label className="mb-3 block text-sm font-medium text-slate-400">Interview Mode</label>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {MODE_CONFIG.map((mode) => {
                            const Icon = mode.icon;
                            const active = selectedMode === mode.id;
                            return (
                                <button
                                    key={mode.id}
                                    type="button"
                                    onClick={() => setSelectedMode(mode.id)}
                                    className={`rounded-xl border p-4 text-left transition ${active
                                        ? 'border-cyan-400/60 bg-cyan-500/10'
                                        : 'border-white/10 bg-white/5 hover:border-white/25'}`}
                                >
                                    <div className="mb-2 flex items-center gap-2 text-slate-100">
                                        <Icon size={16} className={active ? 'text-cyan-300' : 'text-slate-400'} />
                                        <p className="font-semibold">{mode.title}</p>
                                    </div>
                                    <p className="text-sm text-slate-300">{mode.description}</p>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
                    <div>
                        <label className="mb-2 block text-sm font-medium text-slate-400">Target Questions</label>
                        <select
                            value={targetQuestions}
                            onChange={(e) => setTargetQuestions(Number(e.target.value))}
                            className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-slate-100"
                        >
                            {[3, 4, 5, 6, 8, 10].map((v) => <option key={v} value={v}>{v} questions</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="mb-2 block text-sm font-medium text-slate-400">Difficulty Preference</label>
                        <select
                            value={difficultyPreference}
                            onChange={(e) => setDifficultyPreference(e.target.value as DifficultyPreference)}
                            className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-slate-100"
                        >
                            <option value="easy">Easy</option>
                            <option value="medium">Medium</option>
                            <option value="hard">Hard</option>
                        </select>
                    </div>
                    <div>
                        <label className="mb-2 block text-sm font-medium text-slate-400">Coach Style</label>
                        <select
                            value={coachStyle}
                            onChange={(e) => setCoachStyle(e.target.value as CoachStyle)}
                            className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-slate-100"
                        >
                            <option value="supportive">Supportive</option>
                            <option value="balanced">Balanced</option>
                            <option value="strict">Strict</option>
                        </select>
                    </div>
                    <div>
                        <label className="mb-2 block text-sm font-medium text-slate-400">Pressure Simulation</label>
                        <select
                            value={pressureLevel}
                            onChange={(e) => setPressureLevel(e.target.value as PressureLevel)}
                            className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-slate-100"
                        >
                            <option value="off">Off</option>
                            <option value="moderate">Moderate</option>
                            <option value="intense">Intense</option>
                        </select>
                    </div>
                </div>

                <div className="mb-8 rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-sm font-medium text-slate-100">Live Coaching Mode</p>
                            <p className="mt-1 text-sm text-slate-300">
                                Show immediate coaching cues during the interview based on your answer quality, pace, confidence, and question type.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setLiveCoachingEnabled((prev) => !prev)}
                            className={`rounded-full border px-4 py-2 text-sm transition ${liveCoachingEnabled
                                ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-100'
                                : 'border-white/15 bg-white/5 text-slate-300 hover:border-white/30'}`}
                        >
                            {liveCoachingEnabled ? 'Enabled' : 'Disabled'}
                        </button>
                    </div>
                </div>

                <div className={`mb-8 rounded-xl border p-4 ${codingRoundEnabled
                    ? 'border-emerald-400/20 bg-emerald-500/10'
                    : 'border-amber-300/20 bg-amber-400/10'}`}>
                    <p className="text-sm font-medium text-slate-100">Coding Round</p>
                    <p className="mt-1 text-sm text-slate-300">
                        {codingRoundEnabled
                            ? 'This interview mode includes an in-session coding round after the spoken section.'
                            : 'This interview mode is conversation-only. Coding round is automatically disabled for this mode.'}
                    </p>
                </div>

                <div className="mb-8">
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <label className="block text-sm font-medium text-slate-400">Select Topics</label>
                        <button type="button" onClick={applyModeDefaults} className="ghost-btn px-3 py-1 text-xs">Apply {activeMode.title} defaults</button>
                    </div>
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

                <div className="mb-8 flex items-start gap-3 rounded-lg border border-cyan-800/40 bg-cyan-950/30 p-4">
                    <button onClick={() => setConsent(!consent)} className="mt-1 text-cyan-300" type="button">
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
                    {loading ? 'Launching Interview Room...' : `Start ${activeMode.title}`}
                </button>
            </div>
        </div>
    );
}
