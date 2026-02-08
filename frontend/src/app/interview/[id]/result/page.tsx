'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CheckCircle, AlertTriangle, BookOpen, Share2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

export default function InterviewResult() {
    const params = useParams();
    const router = useRouter();
    const [loading, setLoading] = useState(true);

    // Mock Data (replace with fetch from /interviews/:id/result)
    const results = {
        total_score: 78,
        breakdown: [
            { name: 'Semantic Relevance', value: 85, color: '#3B82F6' },
            { name: 'Keywords', value: 70, color: '#10B981' },
            { name: 'Grammar', value: 90, color: '#8B5CF6' },
        ],
        weak_topics: ['System Design', 'Asynchronous JS'],
        improvement_plan: [
            "Review the Event Loop mechanism in Node.js.",
            "Practice CAP theorem and consistency models.",
            "Use more industry-standard terms in architecture discussions."
        ]
    };

    useEffect(() => {
        // Simulate fetch
        setTimeout(() => setLoading(false), 1000);
    }, []);

    if (loading) return <div className="text-white bg-gray-950 h-screen flex justify-center items-center">Generating Report...</div>;

    return (
        <div className="min-h-screen bg-gray-950 text-white p-8 mb-20">
            <div className="max-w-4xl mx-auto space-y-8">
                <header className="text-center">
                    <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-blue-500 mb-2">
                        Interview Complete!
                    </h1>
                    <p className="text-gray-400">Here is your detailed performance report.</p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Score Card */}
                    <div className="bg-gray-900 p-8 rounded-3xl border border-gray-800 flex flex-col items-center justify-center">
                        <h2 className="text-xl font-medium text-gray-400 mb-6">Overall Score</h2>
                        <div className="text-8xl font-bold text-white mb-4">{results.total_score}</div>
                        <div className="h-48 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={results.breakdown}
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {results.breakdown.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: 'none' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex gap-4 text-sm text-gray-400 mt-4">
                            {results.breakdown.map((item) => (
                                <div key={item.name} className="flex items-center gap-1">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                                    {item.name}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Insights */}
                    <div className="space-y-6">
                        <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800">
                            <h3 className="text-lg font-bold text-orange-400 mb-4 flex items-center gap-2">
                                <AlertTriangle size={20} /> Weak Areas
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {results.weak_topics.map(t => (
                                    <span key={t} className="px-3 py-1 bg-orange-900/30 text-orange-300 rounded-full text-sm border border-orange-800">
                                        {t}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800">
                            <h3 className="text-lg font-bold text-blue-400 mb-4 flex items-center gap-2">
                                <BookOpen size={20} /> Improvement Plan
                            </h3>
                            <ul className="space-y-3">
                                {results.improvement_plan.map((plan, i) => (
                                    <li key={i} className="flex gap-3 text-sm text-gray-300">
                                        <CheckCircle size={16} className="text-blue-500 mt-0.5 shrink-0" />
                                        {plan}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>

                <div className="flex justify-center gap-4">
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="px-8 py-3 bg-gray-800 hover:bg-gray-700 rounded-xl font-medium transition"
                    >
                        Back to Dashboard
                    </button>
                    <button className="px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-medium transition flex items-center gap-2">
                        <Share2 size={18} /> Share Result
                    </button>
                </div>
            </div>
        </div>
    );
}
