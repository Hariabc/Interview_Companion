'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import { supabase } from '@/lib/supabaseClient';
import { AppLoadingScreen } from '@/components/AppLoadingScreen';

export default function InterviewRoomResultRedirect() {
    const params = useParams();
    const router = useRouter();
    const sessionId = String(params.id || '');

    useEffect(() => {
        const finalizeAndRedirect = async () => {
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                router.replace('/login');
                return;
            }

            try {
                await axios.post(
                    `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000'}/interviews/end`,
                    { sessionId },
                    { headers: { Authorization: `Bearer ${session.access_token}` } }
                );
            } catch (error) {
                console.error('Error ending session before redirecting to report:', error);
            } finally {
                router.replace(`/interview/report/${sessionId}`);
            }
        };

        if (sessionId) {
            finalizeAndRedirect();
        }
    }, [router, sessionId]);

    return (
        <AppLoadingScreen
            badge="Finishing Session"
            title="Preparing your detailed interview report"
            description="We are closing the session, saving the final score, and redirecting you to the full report with your questions, answers, and analytics."
            stageLabel="Finalizing interview"
            steps={['Ending the interview session', 'Saving completion status', 'Redirecting to your report']}
            compact
        />
    );
}
