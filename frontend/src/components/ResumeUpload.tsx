import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function ResumeUpload() {
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const router = useRouter();

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;

        const file = e.target.files[0];
        if (file.type !== 'application/pdf') {
            setMessage({ type: 'error', text: 'Please upload a PDF file.' });
            return;
        }

        setFileName(file.name);
        setMessage(null);
        await uploadResume(file);
    };

    const uploadResume = async (file: File) => {
        setUploading(true);
        setMessage(null);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                setMessage({ type: 'error', text: 'You must be logged in.' });
                setUploading(false);
                return;
            }

            const formData = new FormData();
            formData.append('resume', file);

            // Use the backend URL from env or default
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

            const response = await fetch(`${backendUrl}/resume/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                    // 'Content-Type': 'multipart/form-data' // Let browser set this with boundary
                },
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Upload failed');
            }

            setMessage({ type: 'success', text: 'Resume uploaded and analyzed successfully!' });
            router.refresh(); // Refresh dashboard data

        } catch (error: any) {
            console.error(error);
            setMessage({ type: 'error', text: error.message });
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Upload size={20} className="text-emerald-500" /> Resume Profile
            </h2>

            <div className="relative">
                <input
                    type="file"
                    accept=".pdf"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    disabled={uploading}
                />
                <div className={`flex flex-col items-center justify-center h-32 border-2 border-dashed rounded-lg transition-colors ${message?.type === 'error' ? 'border-red-500/50 bg-red-900/10' :
                    message?.type === 'success' ? 'border-emerald-500/50 bg-emerald-900/10' :
                        'border-gray-700 hover:border-emerald-500/50 hover:bg-gray-800/50'
                    }`}>
                    {uploading ? (
                        <>
                            <Loader2 className="animate-spin text-blue-400 mb-2" size={24} />
                            <span className="text-sm text-gray-400">Processing Resume...</span>
                        </>
                    ) : message?.type === 'success' ? (
                        <>
                            <CheckCircle className="text-emerald-400 mb-2" size={24} />
                            <span className="text-sm text-emerald-400 text-center px-4">{message.text}</span>
                            <span className="text-xs text-gray-500 mt-1">{fileName}</span>
                        </>
                    ) : message?.type === 'error' ? (
                        <>
                            <AlertCircle className="text-red-400 mb-2" size={24} />
                            <span className="text-sm text-red-400 text-center px-4">{message.text}</span>
                        </>
                    ) : (
                        <>
                            <Upload className="text-gray-500 mb-2" size={24} />
                            <span className="text-sm text-gray-400 font-medium">Click to Upload PDF</span>
                            <span className="text-xs text-gray-600 mt-1">Max 5MB</span>
                        </>
                    )}
                </div>
            </div>

            {/* Display parsed skills helper or status if needed */}
        </div>
    );
}
