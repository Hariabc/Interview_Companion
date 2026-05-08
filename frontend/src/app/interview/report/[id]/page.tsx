'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    Activity,
    BarChart3,
    CheckCircle2,
    Clock3,
    FileAudio,
    Gauge,
    MessageSquare,
    Mic,
    PauseCircle,
    PlayCircle,
    SkipForward,
    Sparkles,
    Target
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { AppLoadingScreen } from '@/components/AppLoadingScreen';

type ReportData = {
    session: any;
    report_questions?: any[];
    stats?: any;
    communication?: any;
    topic_breakdown?: any[];
    adaptive_summary?: any;
    story_bank?: any[];
    story_bank_summary?: any;
    resume_consistency_summary?: any;
    cross_session_weakness_tracking?: any;
    benchmark_comparison?: any;
    readiness?: any;
    summary?: any;
    coding_round?: any;
    coding_round_history?: any[];
};

export default function InterviewReport({ params }: { params: { id: string } }) {
    const router = useRouter();
    const { id } = params;
    const [loading, setLoading] = useState(true);
    const [reportData, setReportData] = useState<ReportData | null>(null);
    const [playingAnswerId, setPlayingAnswerId] = useState<string | null>(null);
    const [resolvedAudioUrls, setResolvedAudioUrls] = useState<Record<string, string>>({});
    const answerAudioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        const fetchReport = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                router.push('/login');
                return;
            }

            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001'}/interviews/${id}/report`, {
                    headers: { Authorization: `Bearer ${session.access_token}` }
                });

                if (!response.ok) {
                    throw new Error('Failed to load report');
                }

                setReportData(await response.json());
            } catch (error) {
                console.error(error);
                setReportData(null);
            } finally {
                setLoading(false);
            }
        };

        fetchReport();
    }, [id, router]);

    const reportQuestions = useMemo(() => {
        if (!Array.isArray(reportData?.report_questions)) return [];
        return reportData!.report_questions;
    }, [reportData]);

    useEffect(() => {
        const resolveAudioUrls = async () => {
            const entries = reportQuestions
                .map((item) => item?.answer)
                .filter((answer) => answer?.id && answer?.audio_url);

            if (!entries.length) {
                setResolvedAudioUrls({});
                return;
            }

            const resolvedPairs = await Promise.all(entries.map(async (answer) => {
                const playableUrl = await resolveSupabaseAudioUrl(answer.audio_url);
                return [answer.id, playableUrl] as const;
            }));

            setResolvedAudioUrls(Object.fromEntries(resolvedPairs));
        };

        void resolveAudioUrls();
    }, [reportQuestions]);

    const handlePlayAnswer = async (answerId: string, audioUrl: string) => {
        const player = answerAudioRef.current;
        const playableUrl = resolvedAudioUrls[answerId] || await resolveSupabaseAudioUrl(audioUrl);
        if (!player || !playableUrl) return;

        if (playingAnswerId === answerId && !player.paused) {
            player.pause();
            setPlayingAnswerId(null);
            return;
        }

        player.pause();
        player.src = playableUrl;
        player.load();
        try {
            await player.play();
            setPlayingAnswerId(answerId);
        } catch (error) {
            console.error('Could not play answer audio:', error);
            setPlayingAnswerId(null);
        }
    };

    if (loading) {
        return (
            <AppLoadingScreen
                badge="Preparing Report"
                title="Building your interview intelligence report"
                description="We are organizing your answered questions, communication signals, adaptive interview flow, and coaching insights into a structured report."
                stageLabel="Compiling report"
                steps={['Loading session answers', 'Summarizing interview performance', 'Formatting your final report']}
            />
        );
    }

    if (!reportData) {
        return (
            <div className="app-shell flex min-h-screen items-center justify-center px-4">
                <div className="glass-card max-w-xl p-6 text-center">
                    <p className="pill mb-4">Report Unavailable</p>
                    <h2 className="text-2xl font-semibold text-slate-50">We could not find that interview report</h2>
                    <p className="mt-2 text-sm subtle-text">
                        The session may still be processing, or the report might not exist for this interview yet.
                    </p>
                    <div className="mt-5 flex items-center justify-center gap-3">
                        <Link href="/dashboard" className="ghost-btn text-sm">Back to Dashboard</Link>
                        <Link href="/interview/setup" className="brand-btn text-sm">Start New Interview</Link>
                    </div>
                </div>
            </div>
        );
    }

    const { session, stats = {}, communication = {}, topic_breakdown = [], adaptive_summary = {}, story_bank = [], story_bank_summary = {}, resume_consistency_summary = {}, cross_session_weakness_tracking = {}, benchmark_comparison = {}, readiness = {}, summary = {}, coding_round, coding_round_history = [] } = reportData;
    const score = asNumber(session?.total_score) ?? asNumber(stats?.average_final_score) ?? 0;
    const interviewMode = prettifyMode(session?.conversation_context?.interview_mode);

    return (
        <div className="app-shell px-4 py-6 md:px-8 md:py-8">
            <audio
                ref={answerAudioRef}
                className="hidden"
                preload="none"
                onEnded={() => setPlayingAnswerId(null)}
                onPause={() => {
                    if (answerAudioRef.current?.ended) {
                        setPlayingAnswerId(null);
                    }
                }}
            />
            <div className="mx-auto max-w-7xl space-y-6">
                <section className="glass-card overflow-hidden">
                    <div className="grid gap-6 p-6 md:grid-cols-[1.5fr,0.9fr] md:p-8">
                        <div className="space-y-5">
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="pill">Interview Intelligence Report</span>
                                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                                    {interviewMode}
                                </span>
                                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
                                    {String(session?.status || 'completed').replace('_', ' ')}
                                </span>
                            </div>

                            <div>
                                <h1 className="section-title">Detailed Interview Performance Report</h1>
                                <p className="mt-2 max-w-3xl text-sm leading-6 subtle-text">
                                    Structured around the actual interview flow only. Each section below reflects the questions that were asked, the candidate responses that were submitted, and the measurable communication signals captured during the session.
                                </p>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                <SummaryChip icon={Clock3} label="Session Date" value={formatDate(session?.start_time)} />
                                <SummaryChip icon={MessageSquare} label="Questions Asked" value={formatCount(stats?.total_questions_asked)} />
                                <SummaryChip icon={CheckCircle2} label="Answered" value={formatCount(stats?.answered_questions)} />
                                <SummaryChip icon={FileAudio} label="Audio Responses" value={formatCount(stats?.audio_answers)} />
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
                                    <Sparkles size={16} className="text-cyan-300" />
                                    Executive Summary
                                </div>
                                <p className="mt-3 text-sm leading-6 text-slate-200">
                                    {summary?.headline || 'Interview summary unavailable.'}
                                </p>
                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                    <InsightCard
                                        title="Strongest Area"
                                        value={summary?.strongest_topic || 'Not enough data'}
                                        note="Best-performing topic based on scored answered questions."
                                    />
                                    <InsightCard
                                        title="Priority To Improve"
                                        value={summary?.improvement_topic || 'No clear gap yet'}
                                        note="Lowest-performing topic among answered questions."
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.22),transparent_35%),linear-gradient(180deg,rgba(18,28,53,0.95),rgba(9,14,28,0.92))] p-6">
                            <div className="absolute inset-x-10 top-0 h-24 rounded-full bg-cyan-400/10 blur-3xl" />
                            <div className="relative space-y-6">
                                <div>
                                    <p className="text-xs uppercase tracking-[0.24em] text-cyan-200/80">Overall Interview Score</p>
                                    <div className="mt-3 flex items-end gap-2">
                                        <span className="text-5xl font-semibold tracking-tight text-white">{Math.round(score)}</span>
                                        <span className="pb-1 text-lg text-cyan-200">/100</span>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <MetricRow label="Completion Rate" value={stats?.completion_rate} suffix="%" />
                                    <MetricRow label="Semantic Accuracy" value={stats?.average_semantic_score} suffix="%" />
                                    <MetricRow label="Grammar Quality" value={stats?.average_grammar_score} suffix="%" />
                                    <MetricRow label="Keyword Coverage" value={stats?.average_keyword_score} suffix="%" />
                                </div>

                                <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-200">
                                    <div className="flex items-center justify-between gap-3">
                                        <span>Session Duration</span>
                                        <span className="font-medium text-white">{formatDuration(stats?.duration_minutes)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
                    <div className="glass-card p-6">
                        <div className="mb-5 flex items-center gap-2">
                            <Gauge size={18} className="text-cyan-300" />
                            <h2 className="text-lg font-semibold">Hiring Readiness</h2>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Readiness Score</p>
                            <div className="mt-3 flex items-end gap-2">
                                <span className="text-5xl font-semibold text-white">{formatCount(readiness?.score)}</span>
                                <span className="pb-1 text-lg text-cyan-200">/100</span>
                            </div>
                            <p className="mt-2 text-sm text-slate-300">{readiness?.band || 'Developing'}</p>
                        </div>
                    </div>

                    <div className="glass-card p-6">
                        <div className="mb-5 flex items-center gap-2">
                            <Target size={18} className="text-cyan-300" />
                            <h2 className="text-lg font-semibold">Role-Specific Benchmark</h2>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold text-white">{benchmark_comparison?.profile?.label || 'Benchmark'}</p>
                                    <p className="mt-1 text-xs text-slate-400">{benchmark_comparison?.profile?.focus || 'Mode-aware performance target'}</p>
                                </div>
                                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-slate-200">
                                    Target {formatPercent(benchmark_comparison?.profile?.overall_target)}
                                </span>
                            </div>
                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <MiniMetric label="Overall Delta" value={formatSigned(benchmark_comparison?.deltas?.overall, '%')} />
                                <MiniMetric label="Confidence Delta" value={formatSigned(benchmark_comparison?.deltas?.confidence, '')} />
                                <MiniMetric label="Semantic Delta" value={formatSigned(benchmark_comparison?.deltas?.semantic, '%')} />
                                <MiniMetric label="Keyword Delta" value={formatSigned(benchmark_comparison?.deltas?.keyword, '%')} />
                            </div>
                        </div>
                    </div>
                </section>

                <section className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
                    <div className="glass-card p-6">
                        <div className="mb-5 flex items-center gap-2">
                            <BarChart3 size={18} className="text-cyan-300" />
                            <h2 className="text-lg font-semibold">Interview Snapshot</h2>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <StatTile icon={Target} label="Questions Asked" value={formatCount(stats?.total_questions_asked)} />
                            <StatTile icon={CheckCircle2} label="Questions Answered" value={formatCount(stats?.answered_questions)} />
                            <StatTile icon={SkipForward} label="Skipped" value={formatCount(stats?.skipped_questions)} />
                            <StatTile icon={Mic} label="Voice Answers" value={formatCount(stats?.audio_answers)} />
                            <StatTile icon={MessageSquare} label="Text Answers" value={formatCount(stats?.text_answers)} />
                            <StatTile icon={Gauge} label="Average Score" value={formatPercent(stats?.average_final_score)} />
                        </div>

                        {coding_round && (
                            <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/80">Coding Round</p>
                                        <h3 className="mt-1 text-base font-semibold text-white">{coding_round.title || 'Coding Challenge'}</h3>
                                        <p className="mt-1 text-xs text-slate-400">{coding_round.language || 'Language not recorded'} | {coding_round.code_metrics?.non_empty_line_count || 0} non-empty lines</p>
                                    </div>
                                    <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
                                        {coding_round.passed}/{coding_round.total} passed
                                    </div>
                                </div>
                                <p className="mt-3 text-sm leading-6 text-slate-300">
                                    {coding_round.feedback?.summary || 'Coding round feedback was captured separately from the spoken interview analysis.'}
                                </p>
                                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                    <SignalTile label="Runs Before Submit" value={formatCount(coding_round.run_count)} />
                                    <SignalTile label="Submissions" value={formatCount(coding_round.submit_count)} />
                                    <SignalTile label="Visible Tests" value={`${formatCount(coding_round.visible_passed)}/${formatCount(coding_round.visible_total)}`} />
                                    <SignalTile label="Hidden Tests" value={`${formatCount(coding_round.hidden_passed)}/${formatCount(coding_round.hidden_total)}`} />
                                </div>
                                {(coding_round.feedback?.optimizations?.length || coding_round.feedback?.positives?.length || coding_round.feedback?.negatives?.length) ? (
                                    <div className="mt-4 grid gap-3 lg:grid-cols-3">
                                        <CodingFeedbackBlock
                                            title="Optimizations"
                                            items={coding_round.feedback?.optimizations || []}
                                            emptyLabel="No optimization suggestions were captured."
                                        />
                                        <CodingFeedbackBlock
                                            title="Strengths"
                                            items={coding_round.feedback?.positives || []}
                                            emptyLabel="No strengths were recorded."
                                        />
                                        <CodingFeedbackBlock
                                            title="Needs Work"
                                            items={coding_round.feedback?.negatives || []}
                                            emptyLabel="No weaknesses were recorded."
                                        />
                                    </div>
                                ) : null}
                                {Array.isArray(coding_round_history) && coding_round_history.length > 0 ? (
                                    <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Coding Attempts</p>
                                        <div className="mt-3 space-y-2">
                                            {coding_round_history.slice(-3).reverse().map((attempt: any, index: number) => (
                                                <div key={`${attempt.challenge_id}-${attempt.submitted_at}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                                                    <span>{formatDate(attempt.submitted_at)}</span>
                                                    <span>{attempt.language}</span>
                                                    <span>{attempt.passed}/{attempt.total} passed</span>
                                                    <span>{attempt.run_count || 0} runs</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </div>

                    <div className="glass-card p-6">
                        <div className="mb-5 flex items-center gap-2">
                            <Activity size={18} className="text-cyan-300" />
                            <h2 className="text-lg font-semibold">Communication Signals</h2>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <SignalTile label="Average Pace" value={formatValue(communication?.avg_wpm, ' WPM')} />
                            <SignalTile label="Fluency" value={formatOutOfTen(communication?.avg_fluency_score)} />
                            <SignalTile label="Confidence" value={formatOutOfTen(communication?.avg_confidence_score)} />
                            <SignalTile label="Pause Time" value={formatValue(communication?.avg_pause_duration, ' sec')} />
                            <SignalTile label="Filler Usage" value={formatValue(communication?.avg_filler_word_count, '')} />
                        </div>
                        <p className="mt-4 text-xs leading-5 text-slate-400">
                            Communication metrics are calculated only from responses that included uploaded answer audio.
                        </p>
                    </div>
                </section>

                <section className="glass-card p-6">
                    <div className="mb-5 flex items-center gap-2">
                        <Sparkles size={18} className="text-cyan-300" />
                        <h2 className="text-lg font-semibold">Adaptive Interview Flow</h2>
                    </div>
                    <div className="grid gap-4 xl:grid-cols-[0.9fr,1.1fr]">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <StatTile icon={Sparkles} label="Adaptive Follow-Ups" value={formatCount(adaptive_summary?.total_adaptive_followups)} />
                            <SignalTile label="Most Used Strategy" value={findTopStrategy(adaptive_summary?.strategies)} />
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Recent Adaptive Decisions</p>
                            {Array.isArray(adaptive_summary?.recent_decisions) && adaptive_summary.recent_decisions.length > 0 ? (
                                <div className="mt-3 space-y-3">
                                    {adaptive_summary.recent_decisions.map((item: any, index: number) => (
                                        <div key={`${item?.created_at || index}-${index}`} className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1 text-xs text-cyan-100">
                                                    {prettifyMode(item?.strategy || 'clarify')}
                                                </span>
                                                <span className="text-xs text-slate-500">{formatDateTime(item?.created_at)}</span>
                                            </div>
                                            <p className="mt-2 text-sm leading-6 text-slate-200">{item?.rationale || 'No rationale saved.'}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="mt-3 text-sm subtle-text">This session did not record adaptive follow-up decisions yet.</p>
                            )}
                        </div>
                    </div>
                </section>

                <section className="glass-card p-6">
                    <div className="mb-5 flex items-center gap-2">
                        <CheckCircle2 size={18} className="text-cyan-300" />
                        <h2 className="text-lg font-semibold">Resume Consistency Check</h2>
                    </div>
                    {resume_consistency_summary?.available ? (
                        <div className="grid gap-4 xl:grid-cols-[0.95fr,1.05fr]">
                            <div className="grid gap-3 sm:grid-cols-3">
                                <StatTile icon={CheckCircle2} label="Aligned Answers" value={formatCount(resume_consistency_summary?.aligned_answers)} />
                                <StatTile icon={Activity} label="Needs Review" value={formatCount(resume_consistency_summary?.review_answers)} />
                                <StatTile icon={MessageSquare} label="Neutral" value={formatCount(resume_consistency_summary?.neutral_answers)} />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <EvidenceBlock
                                    title="Resume-Backed Signals"
                                    items={resume_consistency_summary?.top_verified_signals}
                                    tone="positive"
                                    emptyLabel="No strong resume-backed answer signals were detected."
                                />
                                <EvidenceBlock
                                    title="Claims To Review"
                                    items={resume_consistency_summary?.top_unverified_claims}
                                    tone="warning"
                                    emptyLabel="No unverified technology claims were flagged."
                                />
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm subtle-text">No resume was attached to this session, so consistency validation is unavailable.</p>
                    )}
                </section>

                <section className="glass-card p-6">
                    <div className="mb-5 flex items-center gap-2">
                        <MessageSquare size={18} className="text-cyan-300" />
                        <h2 className="text-lg font-semibold">Behavioral Story Bank</h2>
                    </div>
                    {Array.isArray(story_bank) && story_bank.length > 0 ? (
                        <div className="space-y-4">
                            <div className="grid gap-3 sm:grid-cols-3">
                                <StatTile icon={MessageSquare} label="Stories Extracted" value={formatCount(story_bank_summary?.total_stories)} />
                                <SignalTile label="Strongest Story" value={story_bank_summary?.strongest_story_title || 'N/A'} />
                                <StatTile icon={Activity} label="Needs STAR Work" value={formatCount(story_bank_summary?.stories_needing_structure_work)} />
                            </div>
                            <div className="grid gap-4 xl:grid-cols-2">
                                {story_bank.map((story: any) => (
                                    <article key={story.question_id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-semibold text-white">{story.title}</p>
                                                <p className="mt-1 text-xs text-slate-400">{story.topic}</p>
                                            </div>
                                            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-slate-200">
                                                {formatPercent(story.score)}
                                            </span>
                                        </div>
                                        <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/35 p-3">
                                            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Reusable Excerpt</p>
                                            <p className="mt-2 text-sm leading-6 text-slate-200">{story.supporting_excerpt}</p>
                                        </div>
                                        <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/35 p-3">
                                            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Outcome Highlight</p>
                                            <p className="mt-2 text-sm leading-6 text-slate-200">{story.outcome_highlight || 'No explicit result statement detected yet.'}</p>
                                        </div>
                                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                            <MiniMetric label="STAR Coverage" value={`${story.star_coverage || 0}/4`} />
                                            <MiniMetric label="Coaching Note" value={story.coaching_note || 'No coaching note'} />
                                        </div>
                                        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                                            <StarSignal label="Situation" active={Boolean(story?.star_breakdown?.situation)} />
                                            <StarSignal label="Task" active={Boolean(story?.star_breakdown?.task)} />
                                            <StarSignal label="Action" active={Boolean(story?.star_breakdown?.action)} />
                                            <StarSignal label="Result" active={Boolean(story?.star_breakdown?.result)} />
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm subtle-text">No reusable behavioral stories were extracted from this session yet.</p>
                    )}
                </section>

                <section className="glass-card p-6">
                    <div className="mb-5 flex items-center gap-2">
                        <Activity size={18} className="text-cyan-300" />
                        <h2 className="text-lg font-semibold">Cross-Session Weakness Patterns</h2>
                    </div>
                    {Array.isArray(cross_session_weakness_tracking?.recurring_weak_topics) && cross_session_weakness_tracking.recurring_weak_topics.length > 0 ? (
                        <div className="grid gap-3 md:grid-cols-3">
                            {cross_session_weakness_tracking.recurring_weak_topics.map((item: any) => (
                                <div key={item.topic} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                    <p className="text-sm font-medium text-white">{item.topic}</p>
                                    <p className="mt-2 text-2xl font-semibold text-rose-200">{item.averageScore}%</p>
                                    <p className="mt-1 text-xs text-slate-400">Repeated across {item.occurrences} scored answers in recent sessions</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm subtle-text">No recurring cross-session weak topics were detected from recent interviews.</p>
                    )}
                </section>

                <section className="glass-card p-6">
                    <div className="mb-5 flex items-center gap-2">
                        <BarChart3 size={18} className="text-cyan-300" />
                        <h2 className="text-lg font-semibold">Topic Performance</h2>
                    </div>
                    {topic_breakdown.length > 0 ? (
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {topic_breakdown.map((topic) => (
                                <div key={topic.topic} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-medium text-white">{topic.topic}</p>
                                            <p className="mt-1 text-xs text-slate-400">{topic.questions_answered} answered</p>
                                        </div>
                                        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-slate-200">
                                            {formatPercent(topic.average_score)}
                                        </span>
                                    </div>
                                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
                                        <div
                                            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
                                            style={{ width: `${Math.max(8, Math.min(100, asNumber(topic.average_score) || 0))}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm subtle-text">No scored topic breakdown is available yet.</p>
                    )}
                </section>

                <section className="glass-card p-6">
                    <div className="mb-5 flex items-center gap-2">
                        <MessageSquare size={18} className="text-cyan-300" />
                        <h2 className="text-lg font-semibold">Question-by-Question Review</h2>
                    </div>
                    {reportQuestions.length > 0 ? (
                        <div className="space-y-4">
                            {reportQuestions.map((item) => {
                                const answer = item.answer;
                                const scoreData = answer?.score;
                                const metrics = answer?.voice_metrics;
                                const evidence = answer?.evidence;
                                const consistency = answer?.resume_consistency;
                                const rewrite = item.answer_rewrite;
                                const displayAnswer = sanitizeAnswer(answer?.answer_text);
                                const playableAudioUrl = answer?.id ? resolvedAudioUrls[answer.id] || answer?.audio_url : answer?.audio_url;

                                return (
                                    <article key={item.id} className="rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-5">
                                        <div className="flex flex-wrap items-start justify-between gap-4">
                                            <div className="space-y-2">
                                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                                    <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-cyan-100">
                                                        Question {item.order}
                                                    </span>
                                                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-200">
                                                        {item.topic || 'General'}
                                                    </span>
                                                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">
                                                        Difficulty {item.difficulty_level || '-'} / 5
                                                    </span>
                                                    {answer?.skipped && (
                                                        <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-amber-100">
                                                            Skipped
                                                        </span>
                                                    )}
                                                </div>
                                                <h3 className="text-lg font-semibold leading-7 text-white">{item.question_text}</h3>
                                                <p className="text-xs text-slate-400">
                                                    Asked {formatDateTime(item.asked_at)} · Attempts {item.attempts || 0}
                                                </p>
                                            </div>

                                            <div className="min-w-[128px] rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center">
                                                <div className="text-2xl font-semibold text-white">{formatPercent(scoreData?.final_score)}</div>
                                                <div className="mt-1 text-xs text-slate-400">Answer Score</div>
                                            </div>
                                        </div>

                                        <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
                                            <div className="space-y-4">
                                                <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                                                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Candidate Answer</p>
                                                    <p className="mt-3 text-sm leading-7 text-slate-100">
                                                        {displayAnswer || (answer?.skipped ? 'The question was explicitly skipped by the candidate.' : 'No answer text was captured for this response.')}
                                                    </p>
                                                </div>

                                                <div className="grid gap-3 sm:grid-cols-2">
                                                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Answer Audio</p>
                                                        {answer?.audio_url ? (
                                                            <div className="mt-3 space-y-3">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handlePlayAnswer(answer.id, answer.audio_url)}
                                                                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-400/10 px-4 py-3 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20"
                                                                >
                                                                    {playingAnswerId === answer.id ? <PauseCircle size={18} /> : <PlayCircle size={18} />}
                                                                    {playingAnswerId === answer.id ? 'Pause Answer' : 'Play Answer'}
                                                                </button>
                                                                <a
                                                                    href={playableAudioUrl}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="inline-flex text-xs text-cyan-300 transition hover:text-cyan-200"
                                                                >
                                                                    Open saved audio in a new tab
                                                                </a>
                                                            </div>
                                                        ) : (
                                                            <p className="mt-3 text-sm text-slate-400">Audio not available for this response.</p>
                                                        )}
                                                    </div>

                                                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">AI Feedback</p>
                                                    <p className="mt-3 text-sm leading-6 text-slate-200">
                                                        {scoreData?.feedback_text || 'No AI feedback was saved for this answer.'}
                                                    </p>
                                                </div>

                                                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Interview-Ready Rewrite</p>
                                                    <p className="mt-3 text-sm leading-6 text-slate-300">
                                                        {rewrite?.rewrite_summary || 'No rewrite summary is available for this answer.'}
                                                    </p>
                                                    <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/35 p-3">
                                                        <p className="text-sm leading-7 text-slate-100">
                                                            {rewrite?.rewritten_answer || 'No rewritten answer is available.'}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Evidence-Based Review</p>
                                                    <p className="mt-3 text-sm leading-6 text-slate-200">
                                                        {evidence?.evidence_summary || 'Evidence extraction is not available for this answer.'}
                                                    </p>
                                                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                                        <EvidenceBlock
                                                            title="Covered Concepts"
                                                            items={evidence?.matched_keywords}
                                                            tone="positive"
                                                            emptyLabel="No clearly matched concepts detected."
                                                        />
                                                        <EvidenceBlock
                                                            title="Missing Concepts"
                                                            items={evidence?.missing_keywords}
                                                            tone="warning"
                                                            emptyLabel="No obvious missing concept flags."
                                                        />
                                                    </div>
                                                    <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/35 p-3">
                                                        <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
                                                            <span>Keyword Evidence Coverage</span>
                                                            <span>{formatPercent(evidence?.keyword_coverage_percent)}</span>
                                                        </div>
                                                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                                                            <div
                                                                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400"
                                                                style={{ width: `${Math.max(0, Math.min(100, asNumber(evidence?.keyword_coverage_percent) || 0))}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/35 p-3">
                                                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Supporting Excerpt</p>
                                                        <p className="mt-2 text-sm leading-6 text-slate-200">
                                                            {evidence?.supporting_excerpt || 'No supporting excerpt was identified.'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Scoring Breakdown</p>
                                                    <div className="mt-4 space-y-3">
                                                        <ScoreBar label="Final" value={scoreData?.final_score} />
                                                        <ScoreBar label="Semantic" value={scoreData?.semantic_score} />
                                                        <ScoreBar label="Grammar" value={scoreData?.grammar_score} />
                                                        <ScoreBar label="Keywords" value={scoreData?.keyword_score} />
                                                    </div>
                                                </div>

                                                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Voice Metrics</p>
                                                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                                        <MiniMetric label="WPM" value={formatValue(metrics?.wpm, '')} />
                                                        <MiniMetric label="Fluency" value={formatOutOfTen(metrics?.fluency_score)} />
                                                        <MiniMetric label="Confidence" value={formatOutOfTen(metrics?.confidence_score)} />
                                                        <MiniMetric label="Fillers" value={formatValue(metrics?.filler_word_count, '')} />
                                                    </div>
                                                </div>

                                                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Resume Alignment</p>
                                                    <p className="mt-3 text-sm leading-6 text-slate-200">
                                                        {consistency?.summary || 'Resume consistency data is unavailable for this answer.'}
                                                    </p>
                                                    <div className="mt-4 grid gap-3">
                                                        <EvidenceBlock
                                                            title="Aligned Signals"
                                                            items={consistency?.aligned_resume_signals}
                                                            tone="positive"
                                                            emptyLabel="No resume-backed signals were matched in this answer."
                                                        />
                                                        <EvidenceBlock
                                                            title="Unverified Claims"
                                                            items={consistency?.unverified_claims}
                                                            tone="warning"
                                                            emptyLabel="No unverified claims were flagged for this answer."
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-sm subtle-text">No interview responses were found for this session.</p>
                    )}
                </section>

                <section className="glass-card flex flex-col gap-4 p-6 text-center md:flex-row md:items-center md:justify-between md:text-left">
                    <div>
                        <h2 className="text-xl font-semibold text-white">Run another interview with the improved report flow</h2>
                        <p className="mt-1 text-sm subtle-text">Future voice responses will now carry their answer audio into the final report as well.</p>
                    </div>
                    <div className="flex justify-center gap-3">
                        <Link href="/dashboard" className="ghost-btn">Back to Dashboard</Link>
                        <Link href="/interview/setup" className="brand-btn">Start New Session</Link>
                    </div>
                </section>
            </div>
        </div>
    );
}

function SummaryChip({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                <Icon size={14} />
                {label}
            </div>
            <div className="mt-2 text-base font-semibold text-white">{value}</div>
        </div>
    );
}

function InsightCard({ title, value, note }: { title: string; value: string; note: string }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{title}</p>
            <p className="mt-2 text-base font-semibold text-white">{value}</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">{note}</p>
        </div>
    );
}

function StatTile({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                <Icon size={14} />
                {label}
            </div>
            <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
        </div>
    );
}

function SignalTile({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</p>
            <p className="mt-2 text-xl font-semibold text-white">{value}</p>
        </div>
    );
}

function CodingFeedbackBlock({ title, items, emptyLabel }: { title: string; items: string[]; emptyLabel: string }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{title}</p>
            {items.length > 0 ? (
                <div className="mt-3 space-y-2">
                    {items.map((item) => (
                        <div key={item} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
                            {item}
                        </div>
                    ))}
                </div>
            ) : (
                <p className="mt-3 text-sm subtle-text">{emptyLabel}</p>
            )}
        </div>
    );
}

function MetricRow({ label, value, suffix = '' }: { label: string; value: any; suffix?: string }) {
    return (
        <div>
            <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
                <span>{label}</span>
                <span>{value != null ? `${Math.round(asNumber(value) || 0)}${suffix}` : 'N/A'}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
                    style={{ width: `${Math.max(0, Math.min(100, asNumber(value) || 0))}%` }}
                />
            </div>
        </div>
    );
}

function ScoreBar({ label, value }: { label: string; value: any }) {
    const numericValue = asNumber(value);
    return (
        <div>
            <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
                <span>{label}</span>
                <span>{numericValue != null ? `${Math.round(numericValue)}%` : 'N/A'}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500"
                    style={{ width: `${Math.max(0, Math.min(100, numericValue || 0))}%` }}
                />
            </div>
        </div>
    );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-medium text-white">{value}</p>
        </div>
    );
}

function EvidenceBlock({
    title,
    items,
    tone,
    emptyLabel
}: {
    title: string;
    items: string[] | undefined;
    tone: 'positive' | 'warning';
    emptyLabel: string;
}) {
    const palette = tone === 'positive'
        ? 'border-emerald-400/15 bg-emerald-400/5 text-emerald-100'
        : 'border-amber-400/15 bg-amber-400/5 text-amber-100';

    return (
        <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{title}</p>
            {Array.isArray(items) && items.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                    {items.map((item) => (
                        <span key={item} className={`rounded-full border px-2.5 py-1 text-xs ${palette}`}>
                            {item}
                        </span>
                    ))}
                </div>
            ) : (
                <p className="mt-2 text-sm text-slate-400">{emptyLabel}</p>
            )}
        </div>
    );
}

function StarSignal({ label, active }: { label: string; active: boolean }) {
    return (
        <div className={`rounded-xl border px-3 py-2 text-center text-xs ${active ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100' : 'border-white/10 bg-slate-950/30 text-slate-400'}`}>
            {label}
        </div>
    );
}

function sanitizeAnswer(value: any) {
    const text = String(value || '').trim();
    return text.replace(/^\[SKIPPED_BY_USER\]\s*/i, '').trim();
}

function asNumber(value: any): number | null {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function formatPercent(value: any) {
    const numeric = asNumber(value);
    return numeric == null ? 'N/A' : `${Math.round(numeric)}%`;
}

function formatOutOfTen(value: any) {
    const numeric = asNumber(value);
    return numeric == null ? 'N/A' : `${numeric.toFixed(1)}/10`;
}

function formatValue(value: any, suffix: string) {
    const numeric = asNumber(value);
    return numeric == null ? 'N/A' : `${numeric.toFixed(1)}${suffix}`;
}

function formatCount(value: any) {
    const numeric = asNumber(value);
    return numeric == null ? '0' : `${Math.round(numeric)}`;
}

function formatDate(value: any) {
    if (!value) return 'N/A';
    return new Date(value).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatDateTime(value: any) {
    if (!value) return 'N/A';
    return new Date(value).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function formatDuration(value: any) {
    const minutes = asNumber(value);
    if (minutes == null) return 'N/A';
    if (minutes < 1) return '< 1 min';
    if (minutes < 60) return `${minutes.toFixed(1)} min`;
    return `${(minutes / 60).toFixed(1)} hr`;
}

function prettifyMode(mode: any) {
    const text = String(mode || 'balanced').replace(/_/g, ' ').trim();
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function guessAudioMime(url: string) {
    const normalized = String(url || '').toLowerCase();
    if (normalized.includes('.mp3')) return 'audio/mpeg';
    if (normalized.includes('.wav')) return 'audio/wav';
    if (normalized.includes('.ogg')) return 'audio/ogg';
    return 'audio/webm';
}

function extractVoiceAnswerPath(audioUrl: string) {
    const value = String(audioUrl || '').trim();
    if (!value) return null;
    if (!/^https?:\/\//i.test(value)) {
        return value.replace(/^\/+/, '');
    }

    try {
        const url = new URL(value);
        const marker = '/storage/v1/object/public/voice-answers/';
        const signedMarker = '/storage/v1/object/sign/voice-answers/';
        const publicIndex = url.pathname.indexOf(marker);
        if (publicIndex >= 0) {
            return decodeURIComponent(url.pathname.slice(publicIndex + marker.length));
        }
        const signedIndex = url.pathname.indexOf(signedMarker);
        if (signedIndex >= 0) {
            return decodeURIComponent(url.pathname.slice(signedIndex + signedMarker.length));
        }
    } catch {
        return null;
    }

    return null;
}

async function resolveSupabaseAudioUrl(audioUrl: string) {
    const storagePath = extractVoiceAnswerPath(audioUrl);
    if (!storagePath) return audioUrl;

    const { data: signedData } = await supabase.storage
        .from('voice-answers')
        .createSignedUrl(storagePath, 60 * 60);

    if (signedData?.signedUrl) {
        return signedData.signedUrl;
    }

    const { data: publicData } = supabase.storage
        .from('voice-answers')
        .getPublicUrl(storagePath);

    return publicData?.publicUrl || audioUrl;
}

function findTopStrategy(strategies: Record<string, number> | undefined) {
    const entries = Object.entries(strategies || {});
    if (!entries.length) return 'N/A';
    entries.sort((a, b) => b[1] - a[1]);
    return prettifyMode(entries[0][0]);
}

function formatSigned(value: any, suffix: string) {
    const numeric = asNumber(value);
    if (numeric == null) return 'N/A';
    return `${numeric > 0 ? '+' : ''}${numeric.toFixed(1)}${suffix}`;
}
