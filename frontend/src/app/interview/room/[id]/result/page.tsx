'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import axios from 'axios';
import { Play, FileText, CheckCircle, AlertTriangle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function InterviewResult() {
    const params = useParams();
    const sessionId = params.id;
    const [loading, setLoading] = useState(true);
    const [report, setReport] = useState<any>(null);

    useEffect(() => {
        const fetchReport = async () => {
            if (!sessionId) return;
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) return;

                // First, mark the session as completed
                try {
                    await axios.post(
                        `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000'}/interviews/end`,
                        { sessionId },
                        { headers: { Authorization: `Bearer ${session.access_token}` } }
                    );
                } catch (endError) {
                    console.error("Error ending session:", endError);
                    // Continue to fetch report even if ending fails
                }

                // Then fetch the report
                const response = await axios.get(
                    `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000'}/interviews/${sessionId}/report`,
                    { headers: { Authorization: `Bearer ${session.access_token}` } }
                );

                setReport(response.data);
            } catch (error) {
                console.error("Error fetching report:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchReport();
    }, [sessionId]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
                <div className="animate-spin h-10 w-10 border-4 border-blue-500 rounded-full border-t-transparent"></div>
            </div>
        );
    }

    if (!report) {
        return (
            <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-4">
                <p className="text-xl text-red-400">Failed to load report.</p>
                <Link href="/dashboard" className="text-blue-400 hover:underline">Return to Dashboard</Link>
            </div>
        );
    }

    // Calculate Stats
    const totalQuestions = report.questions.length;
    const answeredQuestions = report.questions.filter((q: any) => q.answers.length > 0).length;

    // Average scores
    let totalScore = 0;
    let totalSemantic = 0;
    let totalGrammar = 0;
    let count = 0;

    report.questions.forEach((q: any) => {
        if (q.answers.length > 0 && q.answers[0].ai_scores.length > 0) {
            const score = q.answers[0].ai_scores[0];
            totalScore += score.final_score || 0;
            totalSemantic += score.semantic_score || 0;
            totalGrammar += score.grammar_score || 0;
            count++;
        }
    });

    const avgScore = count > 0 ? Math.round(totalScore / count) : 0;
    const avgSemantic = count > 0 ? Math.round(totalSemantic / count) : 0;
    const avgGrammar = count > 0 ? Math.round(totalGrammar / count) : 0;

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-green-400';
        if (score >= 60) return 'text-yellow-400';
        return 'text-red-400';
    }

    return (
        <div className="min-h-screen bg-gray-950 text-white p-6 md:p-12">
            <div className="max-w-5xl mx-auto">
                <Link href="/dashboard" className="flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition">
                    <ArrowLeft size={20} /> Back to Dashboard
                </Link>

                {/* Header Stats */}
                <div className="bg-gray-900 rounded-3xl p-8 mb-8 border border-gray-800 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div>
                        <h1 className="text-3xl font-bold mb-2">Interview Report</h1>
                        <p className="text-gray-400 font-mono text-sm">Session ID: {sessionId}</p>
                        <div className="flex gap-4 mt-4">
                            <span className="bg-gray-800 px-3 py-1 rounded-full text-xs text-gray-300">
                                {new Date(report.session.created_at).toLocaleDateString()}
                            </span>
                            <span className="bg-gray-800 px-3 py-1 rounded-full text-xs text-gray-300">
                                {report.session.status.toUpperCase()}
                            </span>
                        </div>
                    </div>

                    <div className="flex gap-8 text-center">
                        <div>
                            <div className={`text-5xl font-bold mb-1 ${getScoreColor(avgScore)}`}>{avgScore}</div>
                            <div className="text-xs text-gray-500 uppercase tracking-wider">Overall Score</div>
                        </div>
                        <div className="w-px bg-gray-800 h-16 hidden md:block"></div>
                        <div>
                            <div className="text-3xl font-bold mb-1 text-blue-400">{avgSemantic}</div>
                            <div className="text-xs text-gray-500 uppercase tracking-wider">Semantic</div>
                        </div>
                        <div>
                            <div className="text-3xl font-bold mb-1 text-purple-400">{avgGrammar}</div>
                            <div className="text-xs text-gray-500 uppercase tracking-wider">Grammar</div>
                        </div>
                    </div>
                </div>

                {/* Detailed Breakdown */}
                <div className="space-y-6">
                    {report.questions.map((item: any, idx: number) => {
                        const answer = item.answers[0];
                        const score = answer?.ai_scores[0];

                        return (
                            <div key={item.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden hover:border-gray-700 transition">
                                {/* Question Header */}
                                <div className="bg-gray-800/50 p-6 flex justify-between items-start">
                                    <div className="flex gap-4">
                                        <span className="bg-blue-900/30 text-blue-400 h-8 w-8 rounded-full flex items-center justify-center font-bold flex-shrink-0">
                                            {idx + 1}
                                        </span>
                                        <div>
                                            <h3 className="text-lg font-semibold text-gray-200 mb-1">{item.question_text}</h3>
                                            <span className="text-xs text-gray-500 uppercase bg-gray-800 px-2 py-0.5 rounded border border-gray-700">
                                                {item.topic} • Difficulty: {item.difficulty_level}
                                            </span>
                                        </div>
                                    </div>
                                    {score && (
                                        <div className={`text-xl font-bold ${getScoreColor(score.final_score)}`}>
                                            {score.final_score}
                                        </div>
                                    )}
                                </div>

                                {/* Answer & Feedback */}
                                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Left: Answer */}
                                    <div>
                                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                                            <FileText size={14} /> Your Answer
                                        </h4>

                                        {answer ? (
                                            <div className="bg-gray-950 p-4 rounded-xl border border-gray-800">
                                                {answer.audio_url ? (
                                                    <div className="mb-4">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <span className="bg-blue-600 p-1.5 rounded-full"><Play size={12} fill="white" /></span>
                                                            <span className="text-sm text-gray-400">Audio Response</span>
                                                        </div>
                                                        <audio controls src={answer.audio_url} className="w-full h-8" />
                                                    </div>
                                                ) : null}
                                                <p className="text-gray-300 text-sm leading-relaxed">
                                                    {answer.answer_text || <span className="text-gray-600 italic">No text transcript available.</span>}
                                                </p>
                                            </div>
                                        ) : (
                                            <p className="text-gray-500 italic">No answer recorded.</p>
                                        )}
                                    </div>

                                    {/* Right: AI Feedback */}
                                    <div>
                                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                                            <CheckCircle size={14} /> AI Analysis
                                        </h4>
                                        {score ? (
                                            <div className="space-y-4">
                                                <div className="bg-emerald-900/10 border border-emerald-900/30 p-4 rounded-xl">
                                                    <p className="text-emerald-200 text-sm italic">
                                                        "{score.feedback_text}"
                                                    </p>
                                                </div>

                                                {/* Ideal Answer (Collapsible logic could be added here) */}
                                                <div className="mt-4">
                                                    <p className="text-xs text-gray-500 uppercase mb-2">Ideal Components</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {item.ideal_answer_keywords && item.ideal_answer_keywords.map((kw: string, k: number) => (
                                                            <span key={k} className="px-2 py-1 bg-gray-800 rounded text-xs text-blue-300 border border-gray-700">
                                                                {kw}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-gray-500">Pending evaluation...</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

            </div>
        </div>
    );
}
