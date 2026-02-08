'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Play, FileText, BarChart2 } from 'lucide-react';
import { ProgressChart, MasteryChart } from '@/components/DashboardCharts';
import ResumeUpload from '@/components/ResumeUpload';

export default function Dashboard() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<any>(null);

    // Mock Data for visualization (replace with API calls to /dashboard/stats later)
    const progressData = [
        { date: 'Mon', score: 45 },
        { date: 'Tue', score: 55 },
        { date: 'Wed', score: 60 },
        { date: 'Thu', score: 75 },
        { date: 'Fri', score: 82 },
    ];

    const masteryData = [
        { topic: 'React', score: 80, fullMark: 100 },
        { topic: 'Node', score: 65, fullMark: 100 },
        { topic: 'SQL', score: 70, fullMark: 100 },
        { topic: 'System Design', score: 40, fullMark: 100 },
        { topic: 'Behavioral', score: 90, fullMark: 100 },
    ];

    useEffect(() => {
        const checkUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                router.push('/login');
            } else {
                setUser(session.user);
                setLoading(false);
            }
        };
        checkUser();
    }, [router]);

    if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Loading...</div>;

    return (
        <div className="min-h-screen bg-gray-950 text-white p-8">
            <header className="flex justify-between items-center mb-12 max-w-7xl mx-auto">
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                    Welcome back, {user?.email?.split('@')[0]}
                </h1>
                <button
                    onClick={async () => { await supabase.auth.signOut(); router.push('/') }}
                    className="text-gray-400 hover:text-white"
                >
                    Sign Out
                </button>
            </header>

            <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Actions Card */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800 hover:border-blue-700 transition">
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <Play size={20} className="text-blue-500" /> Start New Session
                        </h2>
                        <p className="text-gray-400 mb-6 text-sm">
                            Ready to practice? We'll generate questions based on your resume.
                        </p>
                        <Link href="/interview/setup" className="block w-full text-center bg-blue-600 hover:bg-blue-500 py-3 rounded-lg font-medium transition">
                            Start Interview
                        </Link>
                    </div>

                    <ResumeUpload />
                </div>

                {/* Analytics Section */}
                <div className="lg:col-span-2 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800">
                            <h3 className="text-lg font-medium mb-4 text-gray-300 flex items-center gap-2">
                                <BarChart2 size={18} /> Progress History
                            </h3>
                            <ProgressChart data={progressData} />
                        </div>
                        <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800">
                            <h3 className="text-lg font-medium mb-4 text-gray-300">Topic Mastery</h3>
                            <MasteryChart data={masteryData} />
                        </div>
                    </div>

                    {/* Recent Sessions List */}
                    <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800">
                        <h3 className="text-lg font-medium mb-4 text-gray-300">Recent Sessions</h3>
                        <div className="space-y-3">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="flex justify-between items-center p-3 bg-gray-800/50 rounded-lg">
                                    <div>
                                        <p className="font-medium">React & Node.js Mock</p>
                                        <p className="text-xs text-gray-500">Oct {20 + i}, 2023 • 15 mins</p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-emerald-400 font-bold">{75 + i * 5}%</span>
                                        <Link href={`/interview/session-${i}`} className="text-sm text-blue-400 hover:text-blue-300">
                                            View
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
