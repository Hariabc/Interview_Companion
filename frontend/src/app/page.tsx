import Link from 'next/link';
import { ArrowRight, CheckCircle2, Mic, Sparkles, TerminalSquare } from 'lucide-react';

export default function Home() {
    return (
        <main className="app-shell px-6 py-8 md:px-12">
            <div className="mx-auto max-w-6xl">
                <header className="mb-14 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400" />
                        <p className="text-sm font-medium tracking-wide text-slate-200">Interview Companion</p>
                    </div>
                    <Link href="/login" className="ghost-btn text-sm">
                        Sign In
                    </Link>
                </header>

                <section className="glass-card relative overflow-hidden p-8 md:p-12">
                    <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
                    <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
                    <span className="pill mb-5">
                        <Sparkles size={14} className="mr-1.5" />
                        Real-time AI Interview Simulator
                    </span>
                    <h1
                        className="mb-5 text-4xl font-semibold leading-tight md:text-6xl"
                        style={{ fontFamily: 'var(--font-space-grotesk), sans-serif' }}
                    >
                        Practice interviews with voice, coding, and adaptive AI feedback
                    </h1>
                    <p className="subtle-text mb-8 max-w-3xl text-base md:text-lg">
                        Run realistic interview sessions with natural conversation flow, coding rounds, and a complete performance report.
                    </p>
                    <div className="flex flex-wrap gap-3">
                        <Link href="/login" className="brand-btn gap-2">
                            Start Interview <ArrowRight size={16} />
                        </Link>
                        <Link href="/dashboard" className="ghost-btn">
                            Open Dashboard
                        </Link>
                    </div>
                </section>

                <section className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <FeatureCard
                        icon={<TerminalSquare size={22} className="text-cyan-300" />}
                        title="Resume-aware Questions"
                        desc="Interview questions adapt to your profile, skills, and selected topics."
                    />
                    <FeatureCard
                        icon={<Mic size={22} className="text-blue-300" />}
                        title="Voice Intelligence"
                        desc="Track fluency, confidence, filler words, pace, and answer quality."
                    />
                    <FeatureCard
                        icon={<CheckCircle2 size={22} className="text-emerald-300" />}
                        title="Coding Round + Feedback"
                        desc="Solve coding challenges and get test-case plus optimization feedback."
                    />
                    <FeatureCard
                        icon={<Sparkles size={22} className="text-indigo-300" />}
                        title="Actionable Reports"
                        desc="See question-wise analysis, trends, and clear improvement directions."
                    />
                </section>
            </div>
        </main>
    );
}

function FeatureCard({ icon, title, desc }: { icon: JSX.Element; title: string; desc: string }) {
    return (
        <article className="glass-card p-5">
            <div className="mb-3">{icon}</div>
            <h3 className="mb-2 text-lg font-semibold">{title}</h3>
            <p className="subtle-text text-sm leading-relaxed">{desc}</p>
        </article>
    );
}
