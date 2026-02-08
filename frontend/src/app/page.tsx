import Link from 'next/link';
import { ArrowRight, CheckCircle, Mic, Terminal } from 'lucide-react';

export default function Home() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-between p-24 bg-gradient-to-b from-slate-900 to-slate-950 text-white">
            <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
                <p className="fixed left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto  lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
                    AI Mock Interview Platform
                </p>
                <div className="fixed bottom-0 left-0 flex h-48 w-full items-end justify-center bg-gradient-to-t from-white via-white dark:from-black dark:via-black lg:static lg:h-auto lg:w-auto lg:bg-none">
                    <Link href="/login" className="flex items-center gap-2 pointer-events-auto p-8 lg:p-0 font-bold hover:text-blue-400 transition">
                        Get Started <ArrowRight size={16} />
                    </Link>
                </div>
            </div>

            <div className="relative flex place-items-center before:absolute before:h-[300px] before:w-[480px] before:-translate-x-1/2 before:rounded-full before:bg-gradient-to-br before:from-transparent before:to-blue-700 before:opacity-10 after:absolute after:-z-20 after:h-[180px] after:w-[240px] after:translate-x-1/3 after:bg-gradient-to-t after:from-sky-900 after:via-sky-500 after:opacity-40 after:blur-2xl before:dark:bg-gradient-to-br before:dark:from-transparent before:dark:to-blue-700 before:dark:opacity-10 after:dark:from-sky-900 after:dark:via-[#0141ff] after:dark:opacity-40 before:lg:h-[360px] z-[-1]">
                <h1 className="text-5xl md:text-7xl font-bold text-center bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
                    Master Your <br /> Technical Interview
                </h1>
            </div>

            <div className="mb-32 grid text-center lg:max-w-5xl lg:w-full lg:mb-0 lg:grid-cols-4 lg:text-left gap-8 mt-16">
                <FeatureCard
                    icon={<Terminal className="mb-4 text-blue-400" size={32} />}
                    title="Resume Parsing"
                    desc="Upload your PDF resume. We extract skills and tailor questions to your profile."
                />
                <FeatureCard
                    icon={<Mic className="mb-4 text-emerald-400" size={32} />}
                    title="Audio Analysis"
                    desc="Speak your answers. We analyze filler words, pauses, and confidence."
                />
                <FeatureCard
                    icon={<CheckCircle className="mb-4 text-purple-400" size={32} />}
                    title="AI Scoring"
                    desc="Get instant feedback on grammar, keyword coverage, and semantic relevance."
                />
                <FeatureCard
                    icon={<ArrowRight className="mb-4 text-orange-400" size={32} />}
                    title="Adaptive Difficulty"
                    desc="Questions get harder as you perform better. Real-time difficulty adjustment."
                />
            </div>
        </main>
    );
}

function FeatureCard({ icon, title, desc }: { icon: any, title: string, desc: string }) {
    return (
        <div className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30">
            {icon}
            <h2 className="mb-3 text-2xl font-semibold">
                {title}{' '}
                <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
                    -&gt;
                </span>
            </h2>
            <p className="m-0 max-w-[30ch] text-sm opacity-50">
                {desc}
            </p>
        </div>
    )
}
