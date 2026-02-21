'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, LockKeyhole, Mail } from 'lucide-react';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [isSignUp, setIsSignUp] = useState(false);
    const router = useRouter();

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (isSignUp) {
                const { error } = await supabase.auth.signUp({ email, password });
                if (error) throw error;
                alert('Check your email for the confirmation link.');
            } else {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
                router.push('/dashboard');
            }
        } catch (error: any) {
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="app-shell flex min-h-screen items-center justify-center px-4 py-12">
            <div className="absolute left-5 top-5">
                <Link href="/" className="ghost-btn gap-2 text-sm">
                    <ArrowLeft size={15} />
                    Back
                </Link>
            </div>

            <div className="glass-card w-full max-w-md p-8">
                <p className="pill mb-4">Secure Access</p>
                <h1 className="mb-2 text-3xl font-semibold" style={{ fontFamily: 'var(--font-space-grotesk), sans-serif' }}>
                    {isSignUp ? 'Create your account' : 'Welcome back'}
                </h1>
                <p className="subtle-text mb-7 text-sm">
                    {isSignUp ? 'Create your profile and start practicing interviews.' : 'Sign in to continue your interview preparation.'}
                </p>

                <form onSubmit={handleAuth} className="space-y-4">
                    <label className="block">
                        <span className="mb-1.5 block text-xs text-slate-300">Email</span>
                        <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-slate-900/65 px-3">
                            <Mail size={16} className="text-slate-400" />
                            <input
                                type="email"
                                required
                                placeholder="name@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-transparent py-3 text-sm text-white outline-none placeholder:text-slate-500"
                            />
                        </div>
                    </label>

                    <label className="block">
                        <span className="mb-1.5 block text-xs text-slate-300">Password</span>
                        <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-slate-900/65 px-3">
                            <LockKeyhole size={16} className="text-slate-400" />
                            <input
                                type="password"
                                required
                                placeholder="Enter password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-transparent py-3 text-sm text-white outline-none placeholder:text-slate-500"
                            />
                        </div>
                    </label>

                    <button type="submit" disabled={loading} className="brand-btn w-full">
                        {loading ? 'Processing...' : isSignUp ? 'Create Account' : 'Sign In'}
                    </button>
                </form>

                <button
                    type="button"
                    onClick={() => setIsSignUp((prev) => !prev)}
                    className="mt-5 w-full text-sm text-cyan-200 transition hover:text-cyan-100"
                >
                    {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                </button>
            </div>
        </div>
    );
}
