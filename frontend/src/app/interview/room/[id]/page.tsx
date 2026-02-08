'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import axios from 'axios';
import AudioRecorder from '@/components/AudioRecorder';
import { Mic, Send, MessageSquare } from 'lucide-react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

export default function InterviewRoom() {
    const params = useParams();
    const router = useRouter();
    const sessionId = params.id;

    const [loading, setLoading] = useState(false);
    const [questions, setQuestions] = useState<any[]>([]);
    const [currentQIndex, setCurrentQIndex] = useState(0);
    const [mode, setMode] = useState<'text' | 'audio'>('audio');
    const [textAnswer, setTextAnswer] = useState('');
    const [feedback, setFeedback] = useState<any>(null);

    useEffect(() => {
        const fetchSession = async () => {
            if (!sessionId) return;
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) return;

                const response = await axios.get(`${BACKEND_URL}/interviews/${sessionId}`, {
                    headers: { Authorization: `Bearer ${session.access_token}` }
                });

                if (response.data.questions) {
                    setQuestions(response.data.questions);
                }
            } catch (error) {
                console.error("Error fetching session:", error);
            }
        };

        fetchSession();
    }, [sessionId]);

    const handleAudioSubmit = async (audioBlob: Blob) => {
        setLoading(true);
        // 1. Upload Blob to Supabase Storage (omitted for brevity, assume we get a URL or send Blob to backend)
        // 2. Submit to Backend
        await submitAnswer(null, 'mock-audio-url');
    };

    const handleTextSubmit = async () => {
        if (!textAnswer.trim()) return;
        setLoading(true);
        await submitAnswer(textAnswer, null);
    };

    const submitAnswer = async (text: string | null, audioUrl: string | null) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Not authenticated");

            // Real Backend Call
            const response = await axios.post(`${BACKEND_URL}/interviews/answer`, {
                sessionId,
                questionId: currentQuestion?.id,
                answerText: text,
                audioUrl: audioUrl || 'mock-audio-url' // TODO: implement real audio upload
            }, {
                headers: { Authorization: `Bearer ${session.access_token}` }
            });

            const mlResponse = response.data.evaluation;
            const nextQ = response.data.next_question;

            setFeedback(mlResponse);

            if (nextQ) {
                setQuestions(prev => [...prev, nextQ]);
            }

            setLoading(false);

        } catch (e: any) {
            console.error(e);
            alert("Failed to submit answer: " + (e.response?.data?.error || e.message));
            setLoading(false);
        }
    };

    const nextQuestion = () => {
        setFeedback(null);
        setTextAnswer('');
        if (currentQIndex < questions.length - 1) {
            setCurrentQIndex(currentQIndex + 1);
        } else {
            router.push(`/interview/${sessionId}/result`);
        }
    };

    const currentQuestion = questions[currentQIndex];

    return (
        <div className="min-h-screen bg-gray-950 text-white p-4 flex flex-col items-center">
            {/* Progress */}
            <div className="w-full max-w-4xl mb-8 flex items-center justify-between">
                <span className="text-gray-500 font-mono">Session ID: {sessionId?.toString().slice(0, 8)}</span>
                <span className="text-blue-400 font-bold">Question {currentQIndex + 1} / {questions.length}</span>
            </div>

            <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8 flex-1">
                {/* Question Panel */}
                <div className="bg-gray-900 p-8 rounded-3xl border border-gray-800 flex flex-col justify-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <MessageSquare size={120} />
                    </div>
                    <h2 className="text-2xl md:text-3xl font-bold leading-relaxed z-10">
                        {currentQuestion?.question_text || "Loading question..."}
                    </h2>
                </div>

                {/* Answer Panel */}
                <div className="flex flex-col gap-6">
                    {/* Controls */}
                    <div className="bg-gray-900 p-1 rounded-lg self-center flex relative">
                        <button
                            onClick={() => setMode('audio')}
                            className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${mode === 'audio' ? 'bg-gray-800 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                        >
                            Audio
                        </button>
                        <button
                            onClick={() => setMode('text')}
                            className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${mode === 'text' ? 'bg-gray-800 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                        >
                            Text
                        </button>
                    </div>

                    {/* Input Area */}
                    <div className="flex-1 bg-gray-900 rounded-3xl border border-gray-800 p-8 flex flex-col items-center justify-center relative">
                        {loading ? (
                            <div className="flex flex-col items-center animate-pulse">
                                <div className="h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                                <p className="text-blue-400 font-mono">AI is analyzing your answer...</p>
                            </div>
                        ) : feedback ? (
                            <div className="w-full h-full flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-xl font-bold text-emerald-400">Analysis Complete</h3>
                                        <span className="text-3xl font-bold">{feedback.final_score}</span>
                                    </div>
                                    <p className="text-gray-300 leading-relaxed mb-6">
                                        {feedback.feedback_text}
                                    </p>
                                    <div className="grid grid-cols-3 gap-2 text-center text-xs text-gray-500 mb-6">
                                        <div className="bg-gray-800 p-2 rounded">Semantic: {feedback.semantic_score}</div>
                                        <div className="bg-gray-800 p-2 rounded">Grammar: {feedback.grammar_score}</div>
                                        <div className="bg-gray-800 p-2 rounded">Keywords: 8/10</div>
                                    </div>
                                </div>
                                <button
                                    onClick={nextQuestion}
                                    className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-xl font-bold transition"
                                >
                                    Next Question
                                </button>
                            </div>
                        ) : (
                            <>
                                {mode === 'audio' ? (
                                    <AudioRecorder onRecordingComplete={handleAudioSubmit} />
                                ) : (
                                    <div className="w-full h-full flex flex-col">
                                        <textarea
                                            className="flex-1 bg-transparent resize-none outline-none text-lg placeholder:text-gray-600 mb-4"
                                            placeholder="Type your answer here..."
                                            value={textAnswer}
                                            onChange={(e) => setTextAnswer(e.target.value)}
                                        />
                                        <button
                                            onClick={handleTextSubmit}
                                            disabled={!textAnswer}
                                            className="self-end bg-blue-600 p-3 rounded-full hover:bg-blue-500 disabled:opacity-50"
                                        >
                                            <Send size={24} />
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
