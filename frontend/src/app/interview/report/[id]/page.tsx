'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { FileText, CheckCircle, Clock } from 'lucide-react';

export default function InterviewReport({ params }: { params: { id: string } }) {
    const router = useRouter();
    const { id } = params;
    const [loading, setLoading] = useState(true);
    const [reportData, setReportData] = useState<any>(null);

    useEffect(() => {
        const fetchReport = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                router.push('/login');
                return;
            }

            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'}/interviews/${id}/report`, {
                    headers: { 'Authorization': `Bearer ${session.access_token}` }
                });

                if (response.ok) {
                    const data = await response.json();
                    setReportData(data);
                } else {
                    alert("Failed to load report");
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchReport();
    }, [id, router]);

    if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Loading Report...</div>;
    if (!reportData) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Report not found</div>;

    const { session, questions } = reportData;

    return (
        <div className="min-h-screen bg-gray-950 text-white p-8">
            <div className="max-w-4xl mx-auto">
                <header className="mb-8 flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold mb-2">Interview Report</h1>
                        <div className="flex gap-4 text-gray-400 text-sm">
                            <span className="flex items-center gap-1"><Clock size={16} /> {new Date(session.start_time).toLocaleDateString()}</span>
                            <span className="flex items-center gap-1"><CheckCircle size={16} /> Status: {session.status}</span>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-4xl font-bold text-emerald-400">{session.total_score || 0}%</div>
                        <div className="text-gray-400 text-sm">Overall Score</div>
                    </div>
                </header>

                <div className="space-y-6">
                    {questions.map((q: any, index: number) => {
                        const answer = q.answers?.[0];
                        const score = answer?.ai_scores?.[0];

                        return (
                            <div key={q.id} className="bg-gray-900 rounded-xl border border-gray-800 p-6">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <span className="text-xs font-bold text-blue-400 uppercase tracking-wide mb-1 block">Question {index + 1} • {q.topic}</span>
                                        <h3 className="text-lg font-medium">{q.question_text}</h3>
                                    </div>
                                    <span className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded">Diff: {q.difficulty_level}/5</span>
                                </div>

                                <div className="bg-gray-800/50 rounded-lg p-4 mb-4">
                                    <p className="text-sm text-gray-400 mb-1">Your Answer:</p>
                                    <p className="text-gray-200">{answer ? (answer.answer_text || 'Audio response submitted') : 'No answer provided'}</p>
                                </div>

                                {score && (
                                    <div className="border-t border-gray-800 pt-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                            <div>
                                                <p className="text-sm text-gray-400 mb-2">Feedback</p>
                                                <p className="text-gray-300 text-sm">{score.feedback_text}</p>
                                            </div>
                                            <div className="space-y-2">
                                                <ScoreBar label="Semantic Match" value={score.semantic_score} />
                                                <ScoreBar label="Grammar Accuracy" value={score.grammar_score} />
                                                <ScoreBar label="Keyword Usage" value={score.keyword_score} />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="mt-8 text-center bg-gray-900 p-6 rounded-xl border border-gray-800">
                    <h3 className="text-xl font-bold mb-4">Ready to improve?</h3>
                    <div className="flex justify-center gap-4">
                        <Link href="/dashboard" className="px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition">Back to Dashboard</Link>
                        <Link href="/interview/setup" className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg transition font-medium">Start New Session</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ScoreBar({ label, value }: { label: string, value: number }) {
    return (
        <div className="flex items-center gap-2 text-xs">
            <span className="w-24 text-gray-400">{label}</span>
            <div className="flex-1 bg-gray-700 rounded-full h-2">
                <div
                    className="bg-emerald-500 h-2 rounded-full"
                    style={{ width: `${value}%` }}
                />
            </div>
            <span className="w-8 text-right text-gray-300">{value}%</span>
        </div>
    );
}
