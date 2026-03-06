'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BarChart2, Clock3, FileText, LogOut, Sparkles } from 'lucide-react';
import { ProgressChart, MasteryChart } from '@/components/DashboardCharts';

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
            <div className="app-shell flex min-h-screen items-center justify-center">
                <div className="glass-card px-8 py-6 text-sm subtle-text">Loading dashboard...</div>
            </div>
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

                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                        <div className="glass-card p-6">
                            <h3 className="mb-4 flex items-center gap-2 text-lg font-medium text-slate-200">
                                <BarChart2 size={18} />
                                Progress History
                            </h3>
                            {progressData.length > 0 ? (
                                <ProgressChart data={progressData} />
                            ) : (
                                <div className="flex h-64 items-center justify-center subtle-text">No data yet</div>
                            )}
                        </div>
                        <div className="glass-card p-6">
                            <h3 className="mb-4 text-lg font-medium text-slate-200">Topic Mastery</h3>
                            {masteryData.length > 0 ? (
                                <MasteryChart data={masteryData} />
                            ) : (
                                <div className="flex h-64 items-center justify-center subtle-text">No data yet</div>
                            )}
                        </div>
                    </div>

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
                                                    <Link href={`/interview/room/${session.id}/result`} className="ghost-btn px-3 py-1.5 text-xs">
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
