'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BarChart2, Clock3, FileText, LogOut, Sparkles, UserCircle2, Target, TrendingUp } from 'lucide-react';
import { ProgressChart, MasteryChart } from '@/components/DashboardCharts';
import { AppLoadingScreen, InlineLoadingBlock } from '@/components/AppLoadingScreen';

const MODE_META: Record<string, { title: string; blurb: string }> = {
    balanced: { title: 'Balanced Mix', blurb: 'Mixed technical + behavioral interview.' },
    hr_round: { title: 'HR Round', blurb: 'Culture fit, communication, and conflict scenarios.' },
    dsa_round: { title: 'DSA Round', blurb: 'Algorithms, complexity, and edge cases.' },
    salary_negotiation: { title: 'Salary Negotiation', blurb: 'Compensation discussion and value framing.' },
    system_design: { title: 'System Design', blurb: 'Architecture and scaling trade-offs.' },
    behavioral_storytelling: { title: 'Behavioral Storytelling', blurb: 'STAR-based experience storytelling.' },
    managerial_leadership: { title: 'Managerial Leadership', blurb: 'People leadership and stakeholder management.' },
    rapid_fire: { title: 'Rapid Fire', blurb: 'Fast mixed questions for quick thinking.' }
};

function getMode(session: any): string {
    const mode = String(session?.conversation_context?.interview_mode || 'balanced');
    return MODE_META[mode] ? mode : 'balanced';
}

export default function Dashboard() {
    const router = useRouter();
    const [stats, setStats] = useState<any>(null);
    const [progressData, setProgressData] = useState<any[]>([]);
    const [masteryData, setMasteryData] = useState<any[]>([]);
    const [recentSessions, setRecentSessions] = useState<any[]>([]);
    const [weaknessTracking, setWeaknessTracking] = useState<any>(null);
    const [profile, setProfile] = useState<any>(null);
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [modePerformance, setModePerformance] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [modeFilter, setModeFilter] = useState<string>('all');

    useEffect(() => {
        const fetchData = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                router.push('/login');
                return;
            }
            setUser(session.user);

            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/dashboard/stats`, {
                    headers: { Authorization: `Bearer ${session.access_token}` }
                });

                if (response.ok) {
                    const data = await response.json();
                    setStats(data.stats);
                    setProgressData(data.progressHistory || []);
                    setMasteryData(data.topicMastery || []);
                    setRecentSessions(data.recentSessions || []);
                    setWeaknessTracking(data.weaknessTracking || null);
                    setProfile(data.profile || null);
                    setRecommendations(data.recommendations || []);
                    setModePerformance(data.modePerformance || []);
                } else {
                    const err = await response.json();
                    setError(err.error || 'Failed to fetch dashboard data');
                }
            } catch (fetchError: any) {
                console.error('Failed to fetch dashboard stats', fetchError);
                setError(fetchError.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [router]);

    const modeOptions = useMemo(() => {
        const found = Array.from(new Set(recentSessions.map((s) => getMode(s))));
        return ['all', ...found];
    }, [recentSessions]);

    const filteredSessions = useMemo(() => {
        if (modeFilter === 'all') return recentSessions;
        return recentSessions.filter((session) => getMode(session) === modeFilter);
    }, [recentSessions, modeFilter]);

    if (loading) {
        return (
            <AppLoadingScreen
                badge="Loading Dashboard"
                title="Assembling your practice command center"
                description="We are gathering your session history, readiness insights, topic mastery, and recommended next practice so the dashboard opens with useful context."
                stageLabel="Syncing analytics"
                steps={['Loading session history', 'Calculating readiness trends', 'Preparing your personalized recommendations']}
            />
        );
    }

    if (error) {
        return (
            <div className="app-shell flex min-h-screen items-center justify-center p-4">
                <div className="glass-card max-w-md p-6 text-center">
                    <h2 className="mb-2 text-xl font-semibold text-rose-300">Error Loading Dashboard</h2>
                    <p className="subtle-text mb-4 text-sm">{error}</p>
                    <button onClick={() => window.location.reload()} className="brand-btn">
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="app-shell px-6 py-8 md:px-10">
            <div className="mx-auto max-w-7xl">
                <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="pill mb-3">Performance Dashboard</p>
                        <h1 className="section-title" style={{ fontFamily: 'var(--font-space-grotesk), sans-serif' }}>
                            Welcome back, {user?.email?.split('@')[0]}
                        </h1>
                        <p className="subtle-text mt-2 text-sm">
                            {(stats?.totalSessions || 0)} sessions completed | Avg score {(stats?.avgScores?.overall || 0)}%
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link href="/dashboard/profile" className="ghost-btn gap-2 text-sm">
                            <UserCircle2 size={15} />
                            Profile
                        </Link>
                        <Link href="/interview/setup" className="brand-btn gap-2 text-sm">
                            <FileText size={15} />
                            Start New Interview
                        </Link>
                        <button
                            onClick={async () => { await supabase.auth.signOut(); router.push('/'); }}
                            className="ghost-btn gap-2 text-sm"
                        >
                            <LogOut size={15} />
                            Sign Out
                        </button>
                    </div>
                </header>

                <main className="space-y-7">
                    <section className="glass-card relative overflow-hidden p-6 md:p-8">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_30%),radial-gradient(circle_at_85%_20%,rgba(16,185,129,0.14),transparent_22%),linear-gradient(135deg,rgba(15,23,42,0.35),rgba(15,23,42,0.05))]" />
                        <div className="relative grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
                            <div>
                                <p className="text-xs uppercase tracking-[0.24em] text-cyan-200/80">Today&apos;s Snapshot</p>
                                <h2 className="mt-3 text-2xl font-semibold text-slate-50 md:text-3xl">
                                    {stats?.readiness?.band || 'Developing'} candidate profile for {profile?.targetRole || 'your target role'}
                                </h2>
                                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                                    You&apos;ve completed {stats?.totalSessions || 0} sessions, built an average score of {stats?.avgScores?.overall || 0}%, and your current momentum is {weaknessTracking?.momentum || 'still forming'}.
                                </p>
                                <div className="mt-5 flex flex-wrap gap-2">
                                    {(profile?.focusAreas || []).slice(0, 3).map((item: string) => (
                                        <span key={item} className="rounded-full border border-white/15 bg-white/8 px-3 py-1 text-xs text-slate-100">
                                            Focus: {item}
                                        </span>
                                    ))}
                                    {((profile?.focusAreas || []).length === 0) ? (
                                        <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
                                            No repeated weak area detected yet
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <InsightCard
                                    eyebrow="Readiness"
                                    title={`${stats?.readiness?.score || 0}/100`}
                                    detail={`${stats?.readiness?.band || 'Developing'} overall interview readiness`}
                                    accent="cyan"
                                />
                                <InsightCard
                                    eyebrow="Benchmark"
                                    title={`${Number(stats?.benchmarkComparison?.delta || 0) > 0 ? '+' : ''}${stats?.benchmarkComparison?.delta || 0}`}
                                    detail={`Against ${stats?.benchmarkComparison?.label || 'Balanced'} benchmark`}
                                    accent="emerald"
                                />
                                <InsightCard
                                    eyebrow="Streak"
                                    title={`${profile?.sessionStreak || 0} days`}
                                    detail="Consecutive practice-day momentum"
                                    accent="amber"
                                />
                                <InsightCard
                                    eyebrow="Priority"
                                    title={weaknessTracking?.recurringWeakTopics?.[0]?.topic || 'Keep practicing'}
                                    detail={weaknessTracking?.recurringWeakTopics?.[0]
                                        ? `Current weakest recurring topic at ${weaknessTracking.recurringWeakTopics[0].averageScore}%`
                                        : 'More sessions will unlock sharper prioritization'}
                                    accent="rose"
                                />
                            </div>
                        </div>
                    </section>

                    <section className="glass-card p-5">
                        <div className="mb-4 flex items-center gap-2 text-slate-200">
                            <Sparkles size={16} className="text-cyan-300" />
                            <h3 className="text-lg font-medium">Practice Modes</h3>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            {Object.entries(MODE_META).map(([mode, meta]) => (
                                <Link
                                    key={mode}
                                    href={`/interview/setup?mode=${mode}`}
                                    className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-cyan-400/40 hover:bg-cyan-500/5"
                                >
                                    <p className="font-semibold text-slate-100">{meta.title}</p>
                                    <p className="mt-1 text-xs text-slate-300">{meta.blurb}</p>
                                </Link>
                            ))}
                        </div>
                    </section>

                    <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <StatCard label="Total Sessions" value={stats?.totalSessions || 0} />
                        <StatCard label="Average Score" value={`${stats?.avgScores?.overall || 0}%`} />
                        <StatCard label="Questions Answered" value={stats?.questionCount || 0} />
                    </section>

                    <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <StatCard label="Readiness Score" value={`${stats?.readiness?.score || 0}/100`} />
                        <StatCard label="Readiness Band" value={stats?.readiness?.band || 'Developing'} />
                        <StatCard
                            label={`${stats?.benchmarkComparison?.label || 'Benchmark'} Delta`}
                            value={`${Number(stats?.benchmarkComparison?.delta || 0) > 0 ? '+' : ''}${stats?.benchmarkComparison?.delta || 0}%`}
                        />
                    </section>

                    <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1.15fr,0.85fr]">
                        <div className="glass-card p-6">
                            <div className="mb-4 flex items-center gap-2 text-slate-200">
                                <UserCircle2 size={18} className="text-cyan-300" />
                                <h3 className="text-lg font-medium">Personal Progress Hub</h3>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <MetricPanel
                                    label="Target Role"
                                    title={profile?.targetRole || 'Not set yet'}
                                    detail={profile?.yearsExperience !== null && profile?.yearsExperience !== undefined
                                        ? `${profile.yearsExperience}+ years experience inferred from your interview context.`
                                        : 'We will infer your experience level from your resume and interview history.'}
                                />
                                <MetricPanel
                                    label="Current Momentum"
                                    title={weaknessTracking?.momentum || 'N/A'}
                                    detail={`${profile?.sessionStreak || 0} day streak | Focused areas: ${(profile?.focusAreas || []).slice(0, 2).join(', ') || 'Still building pattern data'}`}
                                />
                                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                                    <p className="text-xs uppercase tracking-wide subtle-text">Strongest Topics</p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {(profile?.strongestTopics || []).length > 0 ? profile.strongestTopics.map((topic: string) => (
                                            <span key={topic} className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
                                                {topic}
                                            </span>
                                        )) : <p className="text-sm subtle-text">Complete more scored answers to unlock this.</p>}
                                    </div>
                                </div>
                                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                                    <p className="text-xs uppercase tracking-wide subtle-text">Preferred Modes</p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {(profile?.preferredModes || []).length > 0 ? profile.preferredModes.map((mode: string) => (
                                            <span key={mode} className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100">
                                                {mode}
                                            </span>
                                        )) : <p className="text-sm subtle-text">Your preferences will appear after more practice.</p>}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="glass-card p-6">
                            <div className="mb-4 flex items-center gap-2 text-slate-200">
                                <Target size={18} className="text-amber-300" />
                                <h3 className="text-lg font-medium">Recommended Next Practice</h3>
                            </div>
                            <div className="space-y-3">
                                {recommendations.length > 0 ? recommendations.map((item: any) => (
                                    <div key={item.title} className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-cyan-400/30 hover:bg-cyan-500/5">
                                        <p className="font-medium text-slate-100">{item.title}</p>
                                        <p className="mt-1 text-sm subtle-text">{item.detail}</p>
                                        <Link href={item.href} className="mt-3 inline-flex rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-100 transition hover:border-cyan-300/50">
                                            {item.actionLabel}
                                        </Link>
                                    </div>
                                )) : (
                                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm subtle-text">
                                        Start a few more interviews and we will begin recommending the most useful next step.
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                        <div className="glass-card p-6">
                            <h3 className="mb-4 flex items-center gap-2 text-lg font-medium text-slate-200">
                                <BarChart2 size={18} />
                                Progress History
                            </h3>
                            {progressData.length > 0 ? (
                                <ProgressChart data={progressData} />
                            ) : (
                                <InlineLoadingBlock
                                    title="Progress chart will appear here"
                                    description="Complete a few scored sessions and we will render your timeline with meaningful trends."
                                />
                            )}
                        </div>
                        <div className="glass-card p-6">
                            <h3 className="mb-4 text-lg font-medium text-slate-200">Topic Mastery</h3>
                            {masteryData.length > 0 ? (
                                <MasteryChart data={masteryData} />
                            ) : (
                                <InlineLoadingBlock
                                    title="Topic mastery is still building"
                                    description="Once you answer more questions across sessions, this section will map your strongest and weakest domains."
                                />
                            )}
                        </div>
                    </div>

                    <section className="glass-card p-6">
                        <div className="mb-4 flex items-center gap-2 text-slate-200">
                            <TrendingUp size={18} className="text-emerald-300" />
                            <h3 className="text-lg font-medium">Interview Mode Performance</h3>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            {modePerformance.length > 0 ? modePerformance.map((item: any) => (
                                <div key={item.mode} className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:-translate-y-0.5 hover:border-white/20">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="font-medium text-slate-100">{item.label}</p>
                                            <p className="mt-1 text-xs subtle-text">{item.sessions} sessions</p>
                                        </div>
                                        <span className="rounded-lg border border-white/10 bg-slate-950/45 px-2 py-1 text-xs text-slate-100">
                                            {item.score}%
                                        </span>
                                    </div>
                                    <p className="mt-3 text-sm subtle-text">
                                        Benchmark delta {item.delta > 0 ? '+' : ''}{item.delta}
                                    </p>
                                    <div className="mt-3 h-1.5 rounded-full bg-slate-800">
                                        <div
                                            className={`h-1.5 rounded-full ${item.delta >= 0 ? 'bg-emerald-400' : 'bg-amber-300'}`}
                                            style={{ width: `${Math.max(10, Math.min(100, item.score || 0))}%` }}
                                        />
                                    </div>
                                </div>
                            )) : (
                                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm subtle-text">
                                    Mode-level trends will appear once you complete scored sessions.
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="glass-card p-6">
                        <div className="mb-4 flex items-center gap-2 text-slate-200">
                            <Sparkles size={16} className="text-cyan-300" />
                            <h3 className="text-lg font-medium">Cross-Session Weakness Tracking</h3>
                        </div>
                        <div className="grid gap-6 lg:grid-cols-[0.9fr,1.1fr]">
                            <div className="grid gap-3 sm:grid-cols-3">
                                <StatCard label="Momentum" value={weaknessTracking?.momentum || 'N/A'} />
                                <StatCard label="Trend Delta" value={`${Number(weaknessTracking?.trendDelta || 0) > 0 ? '+' : ''}${weaknessTracking?.trendDelta || 0}`} />
                                <StatCard label="Weak Topics" value={weaknessTracking?.recurringWeakTopics?.length || 0} />
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                                    <p className="text-xs uppercase tracking-wide subtle-text">Recurring Weak Topics</p>
                                    {Array.isArray(weaknessTracking?.recurringWeakTopics) && weaknessTracking.recurringWeakTopics.length > 0 ? (
                                        <div className="mt-3 space-y-3">
                                            {weaknessTracking.recurringWeakTopics.map((item: any) => (
                                                <div key={item.topic} className="rounded-lg border border-white/10 bg-slate-950/35 p-3">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="text-sm font-medium text-slate-100">{item.topic}</span>
                                                        <span className="text-xs text-rose-200">{item.averageScore}%</span>
                                                    </div>
                                                    <p className="mt-1 text-xs subtle-text">Seen in {item.occurrences} scored answers</p>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="mt-3 text-sm subtle-text">No recurring weak topics detected yet.</p>
                                    )}
                                </div>
                                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                                    <p className="text-xs uppercase tracking-wide subtle-text">Weakest Dimensions</p>
                                    {Array.isArray(weaknessTracking?.weakestDimensions) && weaknessTracking.weakestDimensions.length > 0 ? (
                                        <div className="mt-3 space-y-3">
                                            {weaknessTracking.weakestDimensions.map((item: any) => (
                                                <div key={item.label} className="rounded-lg border border-white/10 bg-slate-950/35 p-3">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="text-sm font-medium text-slate-100">{item.label}</span>
                                                        <span className="text-xs text-amber-200">{item.score}%</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="mt-3 text-sm subtle-text">No cross-session dimension trends are available yet.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>

                    <div className="glass-card p-6">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <h3 className="flex items-center gap-2 text-lg font-medium text-slate-200">
                                <Clock3 size={18} />
                                Recent Sessions
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {modeOptions.map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={() => setModeFilter(mode)}
                                        className={`rounded-full border px-3 py-1 text-xs transition ${modeFilter === mode
                                            ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-100'
                                            : 'border-white/15 bg-white/5 text-slate-300 hover:border-white/30'}`}
                                    >
                                        {mode === 'all' ? 'All Modes' : MODE_META[mode]?.title || mode}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-3">
                            {filteredSessions.length > 0 ? filteredSessions.map((session) => {
                                const mode = getMode(session);
                                return (
                                    <div key={session.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <p className="font-medium text-slate-100">
                                                    {session.topics && session.topics.length > 0
                                                        ? `${session.topics.slice(0, 3).join(', ')}${session.topics.length > 3 ? '...' : ''} Interview`
                                                        : 'General Interview Session'}
                                                </p>
                                                <p className="subtle-text text-xs">
                                                    {new Date(session.start_time).toLocaleDateString()} | {session.status}
                                                </p>
                                                <p className="mt-1 inline-flex rounded-lg border border-violet-400/25 bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-200">
                                                    {MODE_META[mode]?.title || 'Balanced Mix'}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {session.total_score ? (
                                                    <span className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-200">
                                                        {session.total_score}%
                                                    </span>
                                                ) : null}
                                                <span className={`rounded-lg border px-2 py-1 text-xs font-medium ${session.status === 'completed'
                                                    ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'
                                                    : session.status === 'in_progress'
                                                        ? 'border-cyan-400/25 bg-cyan-500/10 text-cyan-100'
                                                        : 'border-white/20 bg-white/10 text-slate-200'
                                                    }`}>
                                                    {session.status.replace('_', ' ').toUpperCase()}
                                                </span>
                                                {session.status === 'completed' ? (
                                                    <Link href={`/interview/report/${session.id}`} className="ghost-btn px-3 py-1.5 text-xs">
                                                        View Report
                                                    </Link>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                );
                            }) : (
                                <div className="py-6 text-center subtle-text">No sessions for the selected mode.</div>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
    return (
        <article className="glass-card p-5">
            <p className="subtle-text text-xs uppercase tracking-wide">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-100">{value}</p>
        </article>
    );
}

function InsightCard({
    eyebrow,
    title,
    detail,
    accent
}: {
    eyebrow: string;
    title: string;
    detail: string;
    accent: 'cyan' | 'emerald' | 'amber' | 'rose';
}) {
    const accentClass = {
        cyan: 'border-cyan-400/20 bg-cyan-500/10',
        emerald: 'border-emerald-400/20 bg-emerald-500/10',
        amber: 'border-amber-300/20 bg-amber-400/10',
        rose: 'border-rose-400/20 bg-rose-500/10'
    }[accent];

    return (
        <article className={`rounded-2xl border p-4 backdrop-blur-sm ${accentClass}`}>
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-200/70">{eyebrow}</p>
            <p className="mt-2 text-xl font-semibold text-white">{title}</p>
            <p className="mt-1 text-sm text-slate-200/80">{detail}</p>
        </article>
    );
}

function MetricPanel({ label, title, detail }: { label: string; title: string; detail: string }) {
    return (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide subtle-text">{label}</p>
            <p className="mt-2 text-lg font-semibold text-slate-100">{title}</p>
            <p className="mt-2 text-sm subtle-text">{detail}</p>
        </div>
    );
}
