import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';

const router = express.Router();

const BENCHMARKS: Record<string, { label: string; target: number }> = {
    balanced: { label: 'Balanced', target: 75 },
    hr_round: { label: 'HR', target: 74 },
    dsa_round: { label: 'DSA', target: 78 },
    salary_negotiation: { label: 'Negotiation', target: 76 },
    system_design: { label: 'System Design', target: 80 },
    behavioral_storytelling: { label: 'Behavioral', target: 77 },
    managerial_leadership: { label: 'Leadership', target: 79 },
    rapid_fire: { label: 'Rapid Fire', target: 73 }
};

function average(values: number[]) {
    if (!values.length) return 0;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function titleForMode(mode: string) {
    return BENCHMARKS[mode]?.label || 'Balanced';
}

function computeSessionStreak(sessions: any[]) {
    const uniqueDays = Array.from(new Set(
        sessions.map((session) => new Date(session.start_time).toISOString().slice(0, 10))
    )).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    if (!uniqueDays.length) return 0;

    let streak = 0;
    let expectedDate = new Date(uniqueDays[0]);
    for (const day of uniqueDays) {
        const current = new Date(day);
        if (current.toISOString().slice(0, 10) !== expectedDate.toISOString().slice(0, 10)) {
            break;
        }
        streak += 1;
        expectedDate.setDate(expectedDate.getDate() - 1);
    }

    return streak;
}

function buildRecommendations(params: {
    weaknessTracking: any;
    readiness: any;
    benchmarkComparison: any;
    modePerformance: any[];
    totalSessions: number;
    recentSessions: any[];
}) {
    const recommendations: Array<{ title: string; detail: string; actionLabel: string; href: string }> = [];

    const topWeakTopic = params.weaknessTracking?.recurringWeakTopics?.[0];
    if (topWeakTopic) {
        recommendations.push({
            title: `Practice ${topWeakTopic.topic} again`,
            detail: `This topic is your most repeated weak area across sessions at ${topWeakTopic.averageScore}%.`,
            actionLabel: 'Start targeted round',
            href: '/interview/setup'
        });
    }

    const weakestDimension = params.weaknessTracking?.weakestDimensions?.[0];
    if (weakestDimension) {
        recommendations.push({
            title: `Improve ${weakestDimension.label}`,
            detail: `This is currently the weakest scoring dimension across your answered questions.`,
            actionLabel: 'Review reports',
            href: '/dashboard'
        });
    }

    if (params.benchmarkComparison?.delta < 0) {
        recommendations.push({
            title: `Close your ${params.benchmarkComparison.label} benchmark gap`,
            detail: `You are ${Math.abs(params.benchmarkComparison.delta)} points below your most-practiced benchmark.`,
            actionLabel: 'Practice this mode',
            href: `/interview/setup?mode=${params.benchmarkComparison.mostPracticedMode || 'balanced'}`
        });
    }

    const underperformingMode = (params.modePerformance || [])
        .filter((item) => item.sessions >= 2)
        .sort((a, b) => a.score - b.score)[0];
    if (underperformingMode) {
        recommendations.push({
            title: `${underperformingMode.label} needs reinforcement`,
            detail: `This mode is currently your lowest repeat-performance area at ${underperformingMode.score}%.`,
            actionLabel: 'Retry this mode',
            href: `/interview/setup?mode=${underperformingMode.mode}`
        });
    }

    if ((params.totalSessions || 0) < 3) {
        recommendations.push({
            title: 'Build your baseline',
            detail: 'Complete a few more sessions so the dashboard can detect reliable patterns and trends.',
            actionLabel: 'Start new interview',
            href: '/interview/setup'
        });
    }

    if ((params.readiness?.score || 0) >= 80) {
        recommendations.push({
            title: 'Try a pressure simulation round',
            detail: 'Your readiness is already strong enough to test how you perform under stricter pacing.',
            actionLabel: 'Open setup',
            href: '/interview/setup'
        });
    }

    const latestCompleted = (params.recentSessions || []).find((session) => session.status === 'completed');
    if (latestCompleted) {
        recommendations.push({
            title: 'Review your latest completed session',
            detail: 'Use the detailed report to reinforce strengths and correct weak answers while they are still fresh.',
            actionLabel: 'View latest report',
            href: `/interview/report/${latestCompleted.id}`
        });
    }

    return recommendations.slice(0, 4);
}

async function buildDashboardData(userId: string) {
    const { data: sessions, error: sessionError } = await supabase
        .from('interview_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('start_time', { ascending: false });

    if (sessionError) throw sessionError;

    const safeSessions = sessions || [];
    const totalSessions = safeSessions.length;
    const sessionIds = safeSessions.map((session) => session.id);
    const modeMap: Record<string, number> = {};

    safeSessions.forEach((session: any) => {
        const mode = String(session?.conversation_context?.interview_mode || 'balanced');
        modeMap[mode] = (modeMap[mode] || 0) + 1;
    });

    const recentSessionsRaw = safeSessions.slice(0, 8);
    const recentSessionIds = recentSessionsRaw.map((session) => session.id);
    let recentSessions = recentSessionsRaw.map((session) => ({ ...session, topics: [] as string[] }));

    if (recentSessionIds.length > 0) {
        const { data: questionTopics } = await supabase
            .from('questions')
            .select('session_id, topic')
            .in('session_id', recentSessionIds);

        const topicMap: Record<string, Set<string>> = {};
        (questionTopics || []).forEach((question: any) => {
            if (!topicMap[question.session_id]) topicMap[question.session_id] = new Set();
            if (question.topic) topicMap[question.session_id].add(question.topic);
        });

        recentSessions = recentSessions.map((session) => ({
            ...session,
            topics: Array.from(topicMap[session.id] || [])
        }));
    }

    let avgScores = {
        semantic: 0,
        grammar: 0,
        keyword: 0,
        overall: 0
    };
    let progressHistory: any[] = [];
    let topicMastery: any[] = [];
    let questionCount = 0;
    let weaknessTracking: any = {
        recurringWeakTopics: [],
        weakestDimensions: [],
        momentum: 'Not enough data',
        trendDelta: 0
    };
    let readiness = {
        score: 0,
        band: 'Developing'
    };
    let benchmarkComparison = {
        target: 75,
        current: 0,
        delta: 0,
        mostPracticedMode: 'balanced',
        label: 'Balanced'
    };
    let modePerformance: any[] = [];

    if (sessionIds.length > 0) {
        const { data: answers, error: ansError } = await supabase
            .from('answers')
            .select('id, session_id, created_at, ai_scores(semantic_score, grammar_score, keyword_score, final_score), questions(topic)')
            .in('session_id', sessionIds);

        if (ansError) throw ansError;

        if (answers && answers.length > 0) {
            questionCount = answers.length;
            let totalSemantic = 0;
            let totalGrammar = 0;
            let totalKeyword = 0;
            let totalFinal = 0;
            let count = 0;

            const dateMap: Record<string, { total: number; count: number }> = {};
            const topicMap: Record<string, { total: number; count: number }> = {};
            const topicWeaknessMap: Record<string, { scores: number[] }> = {};
            const sessionScoreMap: Record<string, number[]> = {};
            const dimensionBuckets = {
                semantic: [] as number[],
                grammar: [] as number[],
                keyword: [] as number[]
            };

            answers.forEach((answer: any) => {
                const scores = answer.ai_scores?.[0];
                const topic = answer.questions?.topic || 'General';
                if (!scores) return;

                const semantic = Number(scores.semantic_score) || 0;
                const grammar = Number(scores.grammar_score) || 0;
                const keyword = Number(scores.keyword_score) || 0;
                const final = Number(scores.final_score) || 0;

                totalSemantic += semantic;
                totalGrammar += grammar;
                totalKeyword += keyword;
                totalFinal += final;
                count += 1;

                dimensionBuckets.semantic.push(semantic);
                dimensionBuckets.grammar.push(grammar);
                dimensionBuckets.keyword.push(keyword);

                const date = new Date(answer.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                if (!dateMap[date]) dateMap[date] = { total: 0, count: 0 };
                dateMap[date].total += final;
                dateMap[date].count += 1;

                if (!topicMap[topic]) topicMap[topic] = { total: 0, count: 0 };
                topicMap[topic].total += final;
                topicMap[topic].count += 1;

                if (!topicWeaknessMap[topic]) topicWeaknessMap[topic] = { scores: [] };
                topicWeaknessMap[topic].scores.push(final);

                if (!sessionScoreMap[answer.session_id]) sessionScoreMap[answer.session_id] = [];
                sessionScoreMap[answer.session_id].push(final);
            });

            if (count > 0) {
                avgScores = {
                    semantic: Math.round(totalSemantic / count),
                    grammar: Math.round(totalGrammar / count),
                    keyword: Math.round(totalKeyword / count),
                    overall: Math.round(totalFinal / count)
                };
            }

            progressHistory = Object.keys(dateMap).map((date) => ({
                date,
                score: Math.round(dateMap[date].total / dateMap[date].count)
            }));

            topicMastery = Object.keys(topicMap)
                .map((topic) => ({
                    topic,
                    score: Math.round(topicMap[topic].total / topicMap[topic].count),
                    fullMark: 100
                }))
                .sort((a, b) => b.score - a.score);

            const recurringWeakTopics = Object.keys(topicWeaknessMap)
                .map((topic) => ({
                    topic,
                    averageScore: average(topicWeaknessMap[topic].scores),
                    occurrences: topicWeaknessMap[topic].scores.length
                }))
                .filter((item) => item.occurrences >= 2 && item.averageScore < 65)
                .sort((a, b) => a.averageScore - b.averageScore)
                .slice(0, 4);

            const weakestDimensions = [
                { label: 'Semantic Accuracy', score: average(dimensionBuckets.semantic) },
                { label: 'Grammar Quality', score: average(dimensionBuckets.grammar) },
                { label: 'Keyword Coverage', score: average(dimensionBuckets.keyword) }
            ]
                .sort((a, b) => a.score - b.score)
                .slice(0, 3);

            const orderedSessionAverages = safeSessions
                .slice()
                .reverse()
                .map((session: any) => ({
                    id: session.id,
                    avg: average(sessionScoreMap[session.id] || [])
                }))
                .filter((item) => item.avg > 0);

            let trendDelta = 0;
            let momentum = 'Not enough data';
            if (orderedSessionAverages.length >= 2) {
                const recent = orderedSessionAverages.slice(-2).map((item) => item.avg);
                trendDelta = recent[1] - recent[0];
                if (trendDelta >= 5) momentum = 'Improving';
                else if (trendDelta <= -5) momentum = 'Needs attention';
                else momentum = 'Stable';
            }

            weaknessTracking = {
                recurringWeakTopics,
                weakestDimensions,
                momentum,
                trendDelta
            };

            modePerformance = Object.keys(modeMap)
                .map((mode) => {
                    const matchingSessions = safeSessions.filter((session: any) => String(session?.conversation_context?.interview_mode || 'balanced') === mode);
                    const matchingScores = matchingSessions.flatMap((session: any) => sessionScoreMap[session.id] || []);
                    return {
                        mode,
                        label: titleForMode(mode),
                        score: average(matchingScores),
                        sessions: matchingSessions.length,
                        target: BENCHMARKS[mode]?.target || BENCHMARKS.balanced.target,
                        delta: average(matchingScores) - (BENCHMARKS[mode]?.target || BENCHMARKS.balanced.target)
                    };
                })
                .sort((a, b) => b.sessions - a.sessions || b.score - a.score);

            const mostPracticedMode = modePerformance[0]?.mode || 'balanced';
            const benchmark = BENCHMARKS[mostPracticedMode] || BENCHMARKS.balanced;
            benchmarkComparison = {
                target: benchmark.target,
                current: avgScores.overall,
                delta: avgScores.overall - benchmark.target,
                mostPracticedMode,
                label: benchmark.label
            };

            const readinessScore = Math.max(
                0,
                Math.min(
                    100,
                    Math.round(
                        avgScores.overall * 0.72 +
                        avgScores.semantic * 0.1 +
                        avgScores.grammar * 0.08 +
                        avgScores.keyword * 0.06 -
                        (recurringWeakTopics.length * 3)
                    )
                )
            );
            readiness = {
                score: readinessScore,
                band: readinessScore >= 85 ? 'Interview Ready' : readinessScore >= 70 ? 'Almost Ready' : readinessScore >= 55 ? 'Needs Focused Practice' : 'Developing'
            };
        }
    }

    const latestResumeProfileId = safeSessions.find((session: any) => session.resume_profile_id)?.resume_profile_id || null;
    let latestResume: any = null;
    if (latestResumeProfileId) {
        const { data: resumeProfile } = await supabase
            .from('resume_profiles')
            .select('id, parsed_skills, created_at, file_url, resume_text')
            .eq('id', latestResumeProfileId)
            .single();
        latestResume = resumeProfile || null;
    }

    const latestContext = safeSessions[0]?.conversation_context || {};
    const roleSignals = latestContext?.mode_runtime?.role_signals || {};
    const profile = {
        targetRole: roleSignals?.target_role || latestContext?.target_role || 'Target role not set yet',
        yearsExperience: roleSignals?.years_experience ?? null,
        preferredModes: modePerformance.slice(0, 3).map((item) => item.label),
        strongestTopics: topicMastery.slice(0, 4).map((item) => item.topic),
        focusAreas: [
            ...(weaknessTracking?.recurringWeakTopics || []).map((item: any) => item.topic),
            ...(weaknessTracking?.weakestDimensions || []).map((item: any) => item.label)
        ].slice(0, 5),
        sessionStreak: computeSessionStreak(safeSessions),
        totalSessions,
        hasResume: !!latestResume,
        resumeUploadedAt: latestResume?.created_at || null,
        parsedSkills: Array.isArray(latestResume?.parsed_skills) ? latestResume.parsed_skills.slice(0, 10) : [],
        summary: latestContext?.user_summary || safeSessions[0]?.user_intro_summary || null
    };

    const recommendations = buildRecommendations({
        weaknessTracking,
        readiness,
        benchmarkComparison,
        modePerformance,
        totalSessions,
        recentSessions
    });

    return {
        stats: {
            totalSessions,
            avgScores,
            questionCount,
            modeBreakdown: Object.keys(modeMap).map((mode) => ({ mode, count: modeMap[mode] })),
            readiness,
            benchmarkComparison
        },
        recentSessions,
        progressHistory,
        topicMastery,
        weaknessTracking,
        profile,
        recommendations,
        modePerformance
    };
}

router.get('/stats', authenticate, async (req: AuthRequest, res) => {
    try {
        const payload = await buildDashboardData(req.user.id);
        res.json(payload);
    } catch (error: any) {
        console.log(error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/profile', authenticate, async (req: AuthRequest, res) => {
    try {
        const payload = await buildDashboardData(req.user.id);
        const [{ data: userRow }, { data: resumes }] = await Promise.all([
            supabase
                .from('users')
                .select('id, email, full_name, created_at')
                .eq('id', req.user.id)
                .maybeSingle(),
            supabase
                .from('resume_profiles')
                .select('id, created_at, file_url, parsed_skills, resume_text')
                .eq('user_id', req.user.id)
                .order('created_at', { ascending: false })
        ]);

        res.json({
            account: {
                email: userRow?.email || req.user.email || null,
                fullName: userRow?.full_name || req.user.user_metadata?.full_name || null,
                createdAt: userRow?.created_at || null,
                metadata: {
                    phone: req.user.user_metadata?.phone || null,
                    location: req.user.user_metadata?.location || null,
                    headline: req.user.user_metadata?.headline || null,
                    bio: req.user.user_metadata?.bio || null,
                    linkedin: req.user.user_metadata?.linkedin || null,
                    github: req.user.user_metadata?.github || null
                }
            },
            profile: payload.profile,
            stats: payload.stats,
            recommendations: payload.recommendations,
            modePerformance: payload.modePerformance,
            weaknessTracking: payload.weaknessTracking,
            topicMastery: payload.topicMastery,
            resumes: (resumes || []).map((resume: any) => ({
                id: resume.id,
                createdAt: resume.created_at,
                fileUrl: resume.file_url,
                parsedSkills: Array.isArray(resume.parsed_skills) ? resume.parsed_skills.slice(0, 12) : [],
                resumePreview: String(resume.resume_text || '').slice(0, 220)
            }))
        });
    } catch (error: any) {
        console.log(error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
