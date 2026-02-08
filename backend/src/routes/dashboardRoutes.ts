import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';

const router = express.Router();

// GET /dashboard/stats
router.get('/stats', authenticate, async (req: AuthRequest, res) => {
    const userId = req.user.id;

    try {
        // 1. Fetch Total Sessions & Recent Activity
        const { data: sessions, error: sessionError } = await supabase
            .from('interview_sessions')
            .select('*')
            .eq('user_id', userId)
            .order('start_time', { ascending: false });

        if (sessionError) throw sessionError;

        const totalSessions = sessions.length;
        // 1b. Fetch Topics for Recent Sessions
        const recentSessionsRaw = sessions.slice(0, 5);
        const recentSessionIds = recentSessionsRaw.map(s => s.id);

        let recentSessions = recentSessionsRaw.map(s => ({ ...s, topics: [] as string[] }));

        if (recentSessionIds.length > 0) {
            const { data: questionTopics, error: topicError } = await supabase
                .from('questions')
                .select('session_id, topic')
                .in('session_id', recentSessionIds);

            if (!topicError && questionTopics) {
                const topicMap: Record<string, Set<string>> = {};
                questionTopics.forEach((q: any) => {
                    if (!topicMap[q.session_id]) topicMap[q.session_id] = new Set();
                    topicMap[q.session_id].add(q.topic);
                });

                recentSessions = recentSessions.map(s => ({
                    ...s,
                    topics: Array.from(topicMap[s.id] || [])
                }));
            }
        }

        // 2. Fetch Average Scores (Semantic, Grammar, etc.)
        // We need to join answers -> sessions to filter by user
        // Supabase join syntax is tricky, easier to fetch sessions IDs then fetch scores for those sessions
        const sessionIds = sessions.map(s => s.id);

        let avgScores = {
            semantic: 0,
            grammar: 0,
            keyword: 0,
            overall: 0
        };

        let progressHistory: any[] = [];
        let topicMastery: any[] = [];

        if (sessionIds.length > 0) {
            // Fetch answers for these sessions
            const { data: answers, error: ansError } = await supabase
                .from('answers')
                .select('id, session_id, created_at, ai_scores(semantic_score, grammar_score, keyword_score, final_score), questions(topic)')
                .in('session_id', sessionIds);

            if (ansError) throw ansError;

            if (answers && answers.length > 0) {
                let totalSemantic = 0;
                let totalGrammar = 0;
                let totalKeyword = 0;
                let totalFinal = 0;
                let count = 0;

                // For Aggregation
                const dateMap: Record<string, { total: number, count: number }> = {};
                const topicMap: Record<string, { total: number, count: number }> = {};

                answers.forEach((ans: any) => {
                    const scores = ans.ai_scores?.[0]; // Assuming 1-to-1 or taking first
                    const topic = ans.questions?.topic || 'General';

                    if (scores) {
                        const final = Number(scores.final_score) || 0;

                        totalSemantic += Number(scores.semantic_score) || 0;
                        totalGrammar += Number(scores.grammar_score) || 0;
                        totalKeyword += Number(scores.keyword_score) || 0;
                        totalFinal += final;
                        count++;

                        // Progress History (Grouping by Date)
                        const date = new Date(ans.created_at).toLocaleDateString('en-US', { weekday: 'short' });
                        if (!dateMap[date]) dateMap[date] = { total: 0, count: 0 };
                        dateMap[date].total += final;
                        dateMap[date].count += 1;

                        // Topic Mastery
                        if (!topicMap[topic]) topicMap[topic] = { total: 0, count: 0 };
                        topicMap[topic].total += final;
                        topicMap[topic].count += 1;
                    }
                });

                if (count > 0) {
                    avgScores = {
                        semantic: Math.round(totalSemantic / count),
                        grammar: Math.round(totalGrammar / count),
                        keyword: Math.round(totalKeyword / count),
                        overall: Math.round(totalFinal / count)
                    };
                }

                // Format Progress Data
                progressHistory = Object.keys(dateMap).map(date => ({
                    date,
                    score: Math.round(dateMap[date].total / dateMap[date].count)
                }));

                // Format Mastery Data
                topicMastery = Object.keys(topicMap).map(topic => ({
                    topic,
                    score: Math.round(topicMap[topic].total / topicMap[topic].count),
                    fullMark: 100
                }));
            }
        }

        res.json({
            stats: {
                totalSessions,
                avgScores
            },
            recentSessions,
            progressHistory,
            topicMastery
        });

    } catch (error: any) {
        console.log(error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
