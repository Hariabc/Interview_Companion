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
                const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001'}/interviews/${id}/report`, {
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

    if (loading) return <div className="app-shell flex items-center justify-center text-white">Loading Report...</div>;
    if (!reportData) return <div className="app-shell flex items-center justify-center text-white">Report not found</div>;

    const { session, questions, coding_round } = reportData;
    const qaHistory = Array.isArray(reportData?.qa_history) ? reportData.qa_history : [];
    const getLatestAnswer = (q: any) => {
        const answers = Array.isArray(q?.answers) ? [...q.answers] : [];
        answers.sort((a: any, b: any) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime());
        return answers[0] || null;
    };

    return (
        <div className="app-shell p-8">
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
                    {coding_round && (
                        <div className="glass-card p-6">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide mb-1 block">Coding Round</span>
                                    <h3 className="text-lg font-medium">{coding_round.title || 'Coding Challenge'}</h3>
                                </div>
                                <span className="rounded bg-white/10 px-2 py-1 text-xs text-gray-200 border border-white/10">
                                    {coding_round.passed}/{coding_round.total} passed
                                </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                                    <p className="text-sm text-gray-400 mb-1">Language</p>
                                    <p className="text-gray-200">{coding_round.language || '-'}</p>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                                    <p className="text-sm text-gray-400 mb-1">AI Feedback</p>
                                    <p className="text-gray-200">{coding_round.feedback?.summary || 'No coding feedback available.'}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {qaHistory.length > 0 && (
                        <div className="glass-card p-6">
                            <h3 className="text-lg font-medium mb-3">Question Tracking</h3>
                            <div className="space-y-2 text-sm">
                                {qaHistory.map((item: any) => (
                                    <div key={item.question_id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                                        <p className="text-gray-100">{item.order}. {item.question_text}</p>
                                        <p className="text-gray-400 mt-1">
                                            Attempts: {item.attempts} | {item.skipped ? 'Skipped' : (item.latest_answer_text ? 'Answered' : 'No answer')}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {questions.map((q: any, index: number) => {
                        const answer = getLatestAnswer(q);
                        const score = answer?.ai_scores?.[0];

                        return (
                            <div key={q.id} className="glass-card p-6">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <span className="text-xs font-bold text-blue-400 uppercase tracking-wide mb-1 block">Question {index + 1} • {q.topic}</span>
                                        <h3 className="text-lg font-medium">{q.question_text}</h3>
                                    </div>
                                    <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-300">Diff: {q.difficulty_level}/5</span>
                                </div>

                                <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-4">
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

                <div className="glass-card mt-8 p-6 text-center">
                    <h3 className="text-xl font-bold mb-4">Ready to improve?</h3>
                    <div className="flex justify-center gap-4">
                        <Link href="/dashboard" className="ghost-btn">Back to Dashboard</Link>
                        <Link href="/interview/setup" className="brand-btn">Start New Session</Link>
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
