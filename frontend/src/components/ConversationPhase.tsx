'use client';
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Mic, MicOff, Volume2, Loader2 } from 'lucide-react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

interface ConversationPhaseProps {
    sessionId: string;
    sessionToken: string;
    userName?: string;
    selectedTopics?: string[];
    onConversationComplete: (questions: any[]) => void;
}

export default function ConversationPhase({
    sessionId,
    sessionToken,
    userName,
    selectedTopics,
    onConversationComplete
}: ConversationPhaseProps) {
    const [stage, setStage] = useState<'ai_intro' | 'user_intro' | 'processing'>('ai_intro');
    const [aiIntroText, setAiIntroText] = useState('');
    const [isPlayingAudio, setIsPlayingAudio] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [userIntroText, setUserIntroText] = useState('');
    const [error, setError] = useState<string | null>(null);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Start conversation - get AI introduction
    useEffect(() => {
        if (sessionToken) {
            startConversation();
        }
    }, [sessionToken, sessionId]);

    const startConversation = async () => {
        try {
            const response = await axios.post(
                `${BACKEND_URL}/conversation/start`,
                { sessionId, userName },
                { headers: { Authorization: `Bearer ${sessionToken}` } }
            );

            const { intro_text, audio_base64 } = response.data;
            setAiIntroText(intro_text);

            // Play AI introduction audio
            if (audio_base64) {
                playAudioFromBase64(audio_base64);
            } else {
                // If no audio (synthesis failed or fallback), proceed to user intro after a short delay
                setTimeout(() => setStage('user_intro'), 2000);
            }
        } catch (err: any) {
            console.error('Failed to start conversation:', err);
            setError('Failed to start conversation. Please try again.');
        }
    };

    const playAudioFromBase64 = (base64Audio: string) => {
        try {
            const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);
            audioRef.current = audio;

            audio.onplay = () => setIsPlayingAudio(true);
            audio.onended = () => {
                setIsPlayingAudio(false);
                // After AI intro finishes, prompt user to speak
                setStage('user_intro');
            };
            audio.onerror = () => {
                setIsPlayingAudio(false);
                setError('Failed to play audio. Moving to next step.');
                setStage('user_intro');
            };

            audio.play();
        } catch (err) {
            console.error('Audio playback error:', err);
            setStage('user_intro');
        }
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                await submitUserIntroduction(audioBlob);

                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingTime(0);

            // Start timer
            recordingIntervalRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

        } catch (err) {
            console.error('Failed to start recording:', err);
            setError('Failed to access microphone. Please check permissions.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);

            if (recordingIntervalRef.current) {
                clearInterval(recordingIntervalRef.current);
            }
        }
    };

    const submitUserIntroduction = async (audioBlob: Blob) => {
        setStage('processing');

        try {
            const formData = new FormData();
            formData.append('audio', audioBlob, 'user_intro.webm');
            formData.append('sessionId', sessionId);
            if (selectedTopics && selectedTopics.length > 0) {
                formData.append('selectedTopics', JSON.stringify(selectedTopics));
            }

            const response = await axios.post(
                `${BACKEND_URL}/conversation/user-response`,
                formData,
                {
                    headers: {
                        Authorization: `Bearer ${sessionToken}`,
                        'Content-Type': 'multipart/form-data'
                    }
                }
            );

            const { user_intro_text, questions, analysis } = response.data;
            setUserIntroText(user_intro_text);

            // Conversation complete - pass questions to parent
            setTimeout(() => {
                onConversationComplete(questions);
            }, 1500);

        } catch (err: any) {
            console.error('Failed to submit introduction:', err);
            setError('Failed to process your introduction. Please try again.');
            setStage('user_intro');
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
            <div className="max-w-3xl w-full">
                {/* AI Introduction Stage */}
                {stage === 'ai_intro' && (
                    <div className="text-center space-y-8 animate-fade-in">
                        <div className="flex justify-center">
                            <div className={`w-32 h-32 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center ${isPlayingAudio ? 'animate-pulse' : ''}`}>
                                <Volume2 size={64} className={isPlayingAudio ? 'animate-bounce' : ''} />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                                AI Interviewer
                            </h2>
                            <p className="text-xl text-gray-300 leading-relaxed max-w-2xl mx-auto">
                                {aiIntroText || 'Preparing introduction...'}
                            </p>
                        </div>

                        {isPlayingAudio && (
                            <div className="flex items-center justify-center gap-2 text-blue-400">
                                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                                <span className="text-sm">Playing audio...</span>
                            </div>
                        )}
                    </div>
                )}

                {/* User Introduction Stage */}
                {stage === 'user_intro' && (
                    <div className="text-center space-y-8 animate-fade-in">
                        <div className="space-y-4">
                            <h2 className="text-3xl font-bold">Your Turn!</h2>
                            <p className="text-xl text-gray-300">
                                Please introduce yourself and tell me about your background
                            </p>
                        </div>

                        <div className="flex justify-center">
                            <button
                                onClick={isRecording ? stopRecording : startRecording}
                                className={`w-32 h-32 rounded-full flex items-center justify-center transition-all ${isRecording
                                    ? 'bg-red-600 hover:bg-red-500 animate-pulse'
                                    : 'bg-gradient-to-br from-blue-500 to-purple-600 hover:scale-110'
                                    }`}
                            >
                                {isRecording ? <MicOff size={64} /> : <Mic size={64} />}
                            </button>
                        </div>

                        {isRecording && (
                            <div className="space-y-2">
                                <div className="text-2xl font-mono text-red-400">
                                    {formatTime(recordingTime)}
                                </div>
                                <p className="text-sm text-gray-400">
                                    Click the microphone again to stop recording
                                </p>
                            </div>
                        )}

                        {!isRecording && (
                            <p className="text-sm text-gray-500">
                                Click the microphone to start recording
                            </p>
                        )}
                    </div>
                )}

                {/* Processing Stage */}
                {stage === 'processing' && (
                    <div className="text-center space-y-8 animate-fade-in">
                        <div className="flex justify-center">
                            <Loader2 size={64} className="animate-spin text-blue-500" />
                        </div>

                        <div className="space-y-4">
                            <h2 className="text-3xl font-bold">Analyzing Your Introduction</h2>
                            <p className="text-lg text-gray-400">
                                Generating personalized questions based on your background...
                            </p>
                        </div>

                        {userIntroText && (
                            <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800 max-w-2xl mx-auto">
                                <p className="text-sm text-gray-500 mb-2">Your introduction:</p>
                                <p className="text-gray-300 italic">"{userIntroText}"</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Error Display */}
                {error && (
                    <div className="mt-8 bg-red-900/20 border border-red-500 rounded-lg p-4 text-center">
                        <p className="text-red-400">{error}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
