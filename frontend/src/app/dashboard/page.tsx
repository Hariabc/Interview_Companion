'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FileText, BarChart2 } from 'lucide-react';
import { ProgressChart, MasteryChart } from '@/components/DashboardCharts';

export default function Dashboard() {
    const router = useRouter();
    const [stats, setStats] = useState<any>(null);
    const [progressData, setProgressData] = useState<any[]>([]);
    const [masteryData, setMasteryData] = useState<any[]>([]);
    const [recentSessions, setRecentSessions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                router.push('/login');
                return;
            }
            setUser(session.user);

            try {
                // Fetch Dashboard Stats
                const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'}/dashboard/stats`, {
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`
                    }
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
            } catch (error: any) {
                console.error("Failed to fetch dashboard stats", error);
                setError(error.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [router]);

    if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Loading...</div>;

    if (error) return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-white p-4">
            <div className="bg-red-500/10 border border-red-500 p-6 rounded-xl max-w-md w-full text-center">
                <h2 className="text-xl font-bold text-red-500 mb-2">Error Loading Dashboard</h2>
                <p className="text-gray-300 mb-4">{error}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded-lg transition"
                >
                    Retry
                </button>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-950 text-white p-8">
            <header className="flex justify-between items-center mb-12 max-w-7xl mx-auto">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                        Welcome back, {user?.email?.split('@')[0]}
                    </h1>
                    <p className="text-gray-400 mt-2">
                        {stats?.totalSessions || 0} Sessions Completed • Avg Score: {stats?.avgScores?.overall || 0}%
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <Link
                        href="/interview/setup"
                        className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg font-medium transition text-sm"
                    >
                        Start New Interview
                    </Link>
                    <button
                        onClick={async () => { await supabase.auth.signOut(); router.push('/') }}
                        className="text-gray-400 hover:text-white text-sm"
                    >
                        Sign Out
                    </button>
                </div>
            </header>

            <main className="max-w-7xl mx-auto space-y-8">
                {/* Analytics Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800">
                        <h3 className="text-lg font-medium mb-4 text-gray-300 flex items-center gap-2">
                            <BarChart2 size={18} /> Progress History
                        </h3>
                        {progressData.length > 0 ? (
                            <ProgressChart data={progressData} />
                        ) : (
                            <div className="h-64 flex items-center justify-center text-gray-500">No data yet</div>
                        )}
                    </div>
                    <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800">
                        <h3 className="text-lg font-medium mb-4 text-gray-300">Topic Mastery</h3>
                        {masteryData.length > 0 ? (
                            <MasteryChart data={masteryData} />
                        ) : (
                            <div className="h-64 flex items-center justify-center text-gray-500">No data yet</div>
                        )}
                    </div>
                </div>

                {/* Recent Sessions List */}
                <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800">
                    <h3 className="text-lg font-medium mb-4 text-gray-300">Recent Sessions</h3>
                    <div className="space-y-3">
                        {recentSessions.length > 0 ? recentSessions.map((session) => (
                            <div key={session.id} className="flex justify-between items-center p-3 bg-gray-800/50 rounded-lg">
                                <div>
                                    <p className="font-medium">
                                        {session.topics && session.topics.length > 0
                                            ? `${session.topics.slice(0, 3).join(', ')}${session.topics.length > 3 ? '...' : ''} Interview`
                                            : 'General Interview Session'}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {new Date(session.start_time).toLocaleDateString()} • {session.status}
                                    </p>
                                </div>
                                <div className="flex items-center gap-4">
                                    {session.total_score && (
                                        <span className="text-emerald-400 font-bold">{session.total_score}%</span>
                                    )}
                                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${session.status === 'completed' ? 'bg-green-900/30 text-green-400 border border-green-800' :
                                        session.status === 'in_progress' ? 'bg-blue-900/30 text-blue-400 border border-blue-800' :
                                            'bg-gray-800 text-gray-400 border border-gray-700'
                                        }`}>
                                        {session.status.replace('_', ' ').toUpperCase()}
                                    </span>
                                    {session.status === 'completed' && (
                                        <Link
                                            href={`/interview/room/${session.id}/result`}
                                            className="text-xs bg-gray-800 hover:bg-gray-700 text-white px-2 py-1 rounded border border-gray-600 transition"
                                        >
                                            View Report
                                        </Link>
                                    )}
                                </div>
                            </div>
                        )) : (
                            <div className="text-center text-gray-500 py-4">No recent sessions found. Start one!</div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
