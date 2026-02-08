'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Upload, CheckSquare, Square } from 'lucide-react';
import axios from 'axios';
import ResumeUpload from '@/components/ResumeUpload';

// NOTE: In production, point to backend URL
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

export default function InterviewSetup() {
    const router = useRouter();
    const [file, setFile] = useState<File | null>(null);
    const [skipResume, setSkipResume] = useState(false);
    const [topics, setTopics] = useState<string[]>([]);
    const [consent, setConsent] = useState(false);
    const [loading, setLoading] = useState(false);

    const availableTopics = ['React', 'Node.js', 'System Design', 'Behavioral', 'SQL', 'Python'];

    const toggleTopic = (t: string) => {
        if (topics.includes(t)) setTopics(topics.filter(i => i !== t));
        else setTopics([...topics, t]);
    };

    const handleStart = async () => {
        if (!consent) return alert("Please adhere to the research consent.");
        if (topics.length === 0) return alert("Select at least one topic.");
        // File upload logic would go here (upload to Supabase Storage -> parse via ML)
        // For MVP, we'll skip actual file parsing flow and just start session with topics.

        setLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Not authenticated");

            const response = await axios.post(`${BACKEND_URL}/interviews/start`, {
                topics,
                resumeId: null, // or expected ID after upload
                skipResume
            }, {
                headers: { Authorization: `Bearer ${session.access_token}` }
            });

            const sessionId = response.data.session.id; // Assuming backend returns created session
            router.push(`/interview/room/${sessionId}`);

        } catch (e: any) {
            console.error(e);
            alert("Failed to start session: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-4">
            <div className="max-w-2xl w-full bg-gray-900 p-8 rounded-2xl border border-gray-800 shadow-2xl">
                <h1 className="text-3xl font-bold mb-8 text-center">Setup Your Interview</h1>

                {/* Resume Upload */}
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-4">
                        <label className="flex items-center gap-2 cursor-pointer text-gray-300 hover:text-white">
                            <input
                                type="checkbox"
                                checked={skipResume}
                                onChange={(e) => setSkipResume(e.target.checked)}
                                className="w-5 h-5 rounded border-gray-700 bg-gray-800 text-blue-600 focus:ring-blue-500 bg-opacity-50"
                            />
                            <span>I don't have a resume / Practice topics only</span>
                        </label>
                    </div>

                    {!skipResume && (
                        <div className={`transition-all duration-300 ${skipResume ? 'opacity-50 pointer-events-none' : ''}`}>
                            <ResumeUpload />
                        </div>
                    )}
                </div>

                {/* Topics */}
                <div className="mb-8">
                    <label className="block text-sm font-medium text-gray-400 mb-2">Select Topics</label>
                    <div className="flex flex-wrap gap-3">
                        {availableTopics.map(t => (
                            <button
                                key={t}
                                onClick={() => toggleTopic(t)}
                                className={`px-4 py-2 rounded-full border transition ${topics.includes(t)
                                    ? 'bg-blue-600 border-blue-600 text-white'
                                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                                    }`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Consent */}
                <div className="mb-8 flex items-start gap-3 p-4 bg-blue-900/20 rounded-lg border border-blue-900/50">
                    <button onClick={() => setConsent(!consent)} className="mt-1 text-blue-400">
                        {consent ? <CheckSquare size={20} /> : <Square size={20} />}
                    </button>
                    <p className="text-sm text-gray-300">
                        I agree to participate in this research experiment. My interview data (audio, scores) will be logged anonymously for improving AI evaluation models.
                    </p>
                </div>

                <button
                    onClick={handleStart}
                    disabled={loading || !consent}
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 py-4 rounded-xl font-bold text-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? 'Initializing AI...' : 'Start Mock Interview'}
                </button>
            </div>
        </div>
    );
}
