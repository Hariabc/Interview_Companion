"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Upload, Loader2, RefreshCw } from 'lucide-react';
import axios from 'axios';

interface AudioRecorderProps {
    onAnalysisComplete: (analysis: any) => void;
    currentQuestionId: string;
    sessionToken: string | null;
    sessionId?: string | string[]; // Added sessionId
}

export default function AudioRecorder({ onAnalysisComplete, currentQuestionId, sessionToken, sessionId }: AudioRecorderProps) {
    const [isRecording, setIsRecording] = useState(false);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            chunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' }); // Chrome/Firefox common
                setAudioBlob(blob);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
            setError(null);
            setAudioBlob(null);
        } catch (err) {
            console.error("Error accessing microphone:", err);
            setError("Could not access microphone.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const uploadAudio = async () => {
        if (!audioBlob) return;
        if (!sessionToken) {
            setError("Not authenticated. Please refresh.");
            return;
        }

        setIsUploading(true);
        setError(null);

        const formData = new FormData();
        // Rename file based on question ID usually, or just timestamp
        formData.append('audio', audioBlob, `answer-${currentQuestionId}-${Date.now()}.webm`);

        if (sessionId) {
            // Handle array or string
            const sId = Array.isArray(sessionId) ? sessionId[0] : sessionId;
            formData.append('sessionId', sId);
        }

        try {
            // Replace with your actual backend URL or use proxy
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

            const response = await axios.post(`${backendUrl}/voice/upload`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'Authorization': `Bearer ${sessionToken}`
                }
            });

            if (response.data.analysis) {
                onAnalysisComplete(response.data.analysis);
            } else {
                setError("Analysis failed. No results returned.");
            }

        } catch (err: any) {
            console.error("Upload error:", err);
            setError(err.response?.data?.error || "Failed to upload audio.");
        } finally {
            setIsUploading(false);
        }
    };

    const reset = () => {
        setAudioBlob(null);
        setError(null);
    };

    return (
        <div className="flex flex-col items-center gap-4 p-4 border rounded-lg bg-slate-50 dark:bg-slate-900 shadow-sm">
            <div className="flex items-center gap-4">
                {!isRecording && !audioBlob && (
                    <button
                        onClick={startRecording}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition"
                    >
                        <Mic size={20} />
                        Start Recording
                    </button>
                )}

                {isRecording && (
                    <button
                        onClick={stopRecording}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition animate-pulse"
                    >
                        <Square size={20} />
                        Stop Recording
                    </button>
                )}

                {!isRecording && audioBlob && (
                    <div className="flex gap-2">
                        <button
                            onClick={reset}
                            className="p-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                            title="Record Again"
                        >
                            <RefreshCw size={20} />
                        </button>

                        <button
                            onClick={uploadAudio}
                            disabled={isUploading}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-full hover:bg-green-700 transition disabled:opacity-50"
                        >
                            {isUploading ? <Loader2 className="animate-spin" size={20} /> : <Upload size={20} />}
                            {isUploading ? "Analyzing..." : "Submit Answer"}
                        </button>
                    </div>
                )}
            </div>

            {audioBlob && !isUploading && (
                <audio controls src={URL.createObjectURL(audioBlob)} className="w-full max-w-xs h-8" />
            )}

            {error && (
                <p className="text-red-500 text-sm">{error}</p>
            )}
        </div>
    );
}
