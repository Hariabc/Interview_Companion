'use client';

import { LucideIcon, Sparkles } from 'lucide-react';

type AppLoadingScreenProps = {
    badge?: string;
    title: string;
    description: string;
    stageLabel?: string;
    steps?: string[];
    icon?: LucideIcon;
    compact?: boolean;
};

export function AppLoadingScreen({
    badge = 'Preparing',
    title,
    description,
    stageLabel = 'Please wait',
    steps = [],
    icon: Icon = Sparkles,
    compact = false
}: AppLoadingScreenProps) {
    return (
        <div className={`app-shell flex min-h-screen items-center justify-center px-4 ${compact ? 'py-8' : 'py-10'}`}>
            <div className={`glass-card relative w-full overflow-hidden ${compact ? 'max-w-xl p-6' : 'max-w-3xl p-6 md:p-8'}`}>
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
                <div className="flex flex-col gap-6">
                    <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10">
                            <Icon className="text-cyan-200" size={22} />
                        </div>
                        <div className="min-w-0">
                            <p className="pill mb-3">{badge}</p>
                            <h1 className="text-2xl font-semibold text-slate-50 md:text-3xl">{title}</h1>
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{description}</p>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-xs uppercase tracking-[0.22em] text-cyan-200/80">{stageLabel}</p>
                            <div className="inline-flex items-center gap-2">
                                <span className="loading-dot" />
                                <span className="loading-dot loading-dot-2" />
                                <span className="loading-dot loading-dot-3" />
                            </div>
                        </div>
                        <div className="loading-rail mt-4">
                            <div className="loading-rail-fill" />
                        </div>
                    </div>

                    {steps.length > 0 ? (
                        <div className={`grid gap-3 ${compact ? 'grid-cols-1' : 'md:grid-cols-3'}`}>
                            {steps.map((step, index) => (
                                <div key={step} className="rounded-xl border border-white/10 bg-white/5 p-4">
                                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Step {index + 1}</p>
                                    <p className="mt-2 text-sm text-slate-100">{step}</p>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

export function InlineLoadingBlock({
    title,
    description,
    icon: Icon = Sparkles
}: {
    title: string;
    description: string;
    icon?: LucideIcon;
}) {
    return (
        <div className="glass-card p-6">
            <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10">
                    <Icon className="text-cyan-200" size={20} />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-lg font-medium text-slate-50">{title}</p>
                    <p className="mt-1 text-sm subtle-text">{description}</p>
                    <div className="loading-rail mt-4">
                        <div className="loading-rail-fill" />
                    </div>
                </div>
            </div>
        </div>
    );
}
