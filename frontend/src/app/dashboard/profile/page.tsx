'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Briefcase,
    FileBadge2,
    Mail,
    MapPin,
    PencilLine,
    Phone,
    Save,
    ShieldCheck,
    Sparkles,
    Target,
    UserCircle2
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { AppLoadingScreen } from '@/components/AppLoadingScreen';

type ProfileFormState = {
    fullName: string;
    headline: string;
    phone: string;
    location: string;
    bio: string;
    linkedin: string;
    github: string;
};

const EMPTY_FORM: ProfileFormState = {
    fullName: '',
    headline: '',
    phone: '',
    location: '',
    bio: '',
    linkedin: '',
    github: ''
};

export default function DashboardProfilePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);
    const [account, setAccount] = useState<any>(null);
    const [profile, setProfile] = useState<any>(null);
    const [stats, setStats] = useState<any>(null);
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [modePerformance, setModePerformance] = useState<any[]>([]);
    const [weaknessTracking, setWeaknessTracking] = useState<any>(null);
    const [topicMastery, setTopicMastery] = useState<any[]>([]);
    const [resumes, setResumes] = useState<any[]>([]);
    const [formState, setFormState] = useState<ProfileFormState>(EMPTY_FORM);

    useEffect(() => {
        const fetchProfile = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                router.push('/login');
                return;
            }

            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/dashboard/profile`, {
                    headers: { Authorization: `Bearer ${session.access_token}` }
                });

                if (!response.ok) {
                    const payload = await response.json();
                    throw new Error(payload.error || 'Failed to load profile');
                }

                const data = await response.json();
                const loadedAccount = data.account || null;
                setAccount(loadedAccount);
                setProfile(data.profile || null);
                setStats(data.stats || null);
                setRecommendations(data.recommendations || []);
                setModePerformance(data.modePerformance || []);
                setWeaknessTracking(data.weaknessTracking || null);
                setTopicMastery(data.topicMastery || []);
                setResumes(data.resumes || []);
                setFormState({
                    fullName: loadedAccount?.fullName || '',
                    headline: loadedAccount?.metadata?.headline || '',
                    phone: loadedAccount?.metadata?.phone || '',
                    location: loadedAccount?.metadata?.location || '',
                    bio: loadedAccount?.metadata?.bio || '',
                    linkedin: loadedAccount?.metadata?.linkedin || '',
                    github: loadedAccount?.metadata?.github || ''
                });
            } catch (fetchError: any) {
                console.error(fetchError);
                setError(fetchError.message || 'Failed to load profile');
            } finally {
                setLoading(false);
            }
        };

        fetchProfile();
    }, [router]);

    const handleFieldChange = (field: keyof ProfileFormState, value: string) => {
        setFormState((prev) => ({ ...prev, [field]: value }));
        setSaveMessage(null);
    };

    const handleSaveProfile = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setSaveMessage(null);
        setError(null);

        try {
            const { data, error: updateError } = await supabase.auth.updateUser({
                data: {
                    full_name: formState.fullName.trim(),
                    headline: formState.headline.trim(),
                    phone: formState.phone.trim(),
                    location: formState.location.trim(),
                    bio: formState.bio.trim(),
                    linkedin: formState.linkedin.trim(),
                    github: formState.github.trim()
                }
            });

            if (updateError) throw updateError;

            setAccount((prev: any) => ({
                ...(prev || {}),
                fullName: formState.fullName.trim(),
                metadata: {
                    ...(prev?.metadata || {}),
                    headline: formState.headline.trim(),
                    phone: formState.phone.trim(),
                    location: formState.location.trim(),
                    bio: formState.bio.trim(),
                    linkedin: formState.linkedin.trim(),
                    github: formState.github.trim()
                }
            }));

            const refreshedUser = data?.user;
            if (refreshedUser?.email) {
                setAccount((prev: any) => ({
                    ...(prev || {}),
                    email: refreshedUser.email
                }));
            }

            setSaveMessage('Profile details updated successfully.');
        } catch (saveError: any) {
            console.error(saveError);
            setError(saveError.message || 'Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <AppLoadingScreen
                badge="Loading Profile"
                title="Preparing your account and resume profile"
                description="We are bringing together your personal details, resume library, readiness metrics, and interview preferences into one profile view."
                stageLabel="Syncing profile data"
                steps={['Loading account details', 'Fetching resume versions', 'Preparing interview profile insights']}
            />
        );
    }

    if (error && !account && !profile) {
        return (
            <div className="app-shell flex min-h-screen items-center justify-center p-4">
                <div className="glass-card max-w-md p-6 text-center">
                    <h2 className="mb-2 text-xl font-semibold text-rose-300">Profile Unavailable</h2>
                    <p className="subtle-text mb-4 text-sm">{error}</p>
                    <button onClick={() => window.location.reload()} className="brand-btn">
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="app-shell px-6 py-8 md:px-10">
            <div className="mx-auto max-w-7xl space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <Link href="/dashboard" className="mb-4 inline-flex items-center gap-2 text-sm text-cyan-100 transition hover:text-white">
                            <ArrowLeft size={16} />
                            Back to dashboard
                        </Link>
                        <p className="pill mb-3">Candidate Profile</p>
                        <h1 className="section-title" style={{ fontFamily: 'var(--font-space-grotesk), sans-serif' }}>
                            Profile and account settings
                        </h1>
                        <p className="subtle-text mt-2 text-sm">
                            View your identity, resumes, personal details, and interview readiness from one place.
                        </p>
                    </div>
                    <Link href="/interview/setup" className="brand-btn text-sm">
                        Start New Interview
                    </Link>
                </div>

                <section className="glass-card relative overflow-hidden p-6 md:p-8">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(56,189,248,0.16),transparent_25%),radial-gradient(circle_at_82%_18%,rgba(168,85,247,0.12),transparent_22%),linear-gradient(135deg,rgba(15,23,42,0.35),rgba(15,23,42,0.05))]" />
                    <div className="relative grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
                        <div>
                            <div className="flex items-center gap-4">
                                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
                                    <UserCircle2 size={34} className="text-cyan-100" />
                                </div>
                                <div>
                                    <p className="text-xs uppercase tracking-[0.24em] text-cyan-200/80">Account Identity</p>
                                    <h2 className="mt-1 text-2xl font-semibold text-slate-50 md:text-3xl">
                                        {account?.fullName || account?.email?.split('@')[0] || 'Interview Companion User'}
                                    </h2>
                                    <p className="mt-1 text-sm text-slate-300">
                                        {formState.headline || profile?.targetRole || 'Add a headline to describe the role you are preparing for.'}
                                    </p>
                                </div>
                            </div>
                            <div className="mt-5 grid gap-3 sm:grid-cols-2">
                                <IdentityPill icon={<Mail size={14} />} text={account?.email || 'No email found'} />
                                <IdentityPill icon={<Phone size={14} />} text={formState.phone || 'Add phone number'} />
                                <IdentityPill icon={<MapPin size={14} />} text={formState.location || 'Add location'} />
                                <IdentityPill icon={<Briefcase size={14} />} text={profile?.targetRole || 'Target role not set yet'} />
                            </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <ProfileHighlight eyebrow="Readiness" title={`${stats?.readiness?.score || 0}/100`} detail={stats?.readiness?.band || 'Developing'} tone="cyan" />
                            <ProfileHighlight eyebrow="Sessions" title={`${stats?.totalSessions || 0}`} detail="Interview sessions completed" tone="emerald" />
                            <ProfileHighlight eyebrow="Resumes" title={`${resumes.length}`} detail="Resume versions linked to your account" tone="amber" />
                            <ProfileHighlight eyebrow="Streak" title={`${profile?.sessionStreak || 0} days`} detail="Consecutive practice-day momentum" tone="violet" />
                        </div>
                    </div>
                </section>

                <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <ProfileStat label="Readiness Band" value={stats?.readiness?.band || 'Developing'} />
                    <ProfileStat label="Questions Answered" value={stats?.questionCount || 0} />
                    <ProfileStat label="Preferred Modes" value={(profile?.preferredModes || []).length || 0} />
                    <ProfileStat label="Resume Skills" value={(profile?.parsedSkills || []).length || 0} />
                </section>

                <section className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
                    <div className="glass-card p-6">
                        <div className="mb-4 flex items-center gap-2 text-slate-200">
                            <PencilLine size={18} className="text-cyan-300" />
                            <h3 className="text-lg font-medium">Edit Personal Information</h3>
                        </div>
                        <form onSubmit={handleSaveProfile} className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <Field label="Full Name">
                                    <input
                                        value={formState.fullName}
                                        onChange={(e) => handleFieldChange('fullName', e.target.value)}
                                        className="profile-input"
                                        placeholder="Your full name"
                                    />
                                </Field>
                                <Field label="Professional Headline">
                                    <input
                                        value={formState.headline}
                                        onChange={(e) => handleFieldChange('headline', e.target.value)}
                                        className="profile-input"
                                        placeholder="Frontend Engineer preparing for product interviews"
                                    />
                                </Field>
                                <Field label="Phone">
                                    <input
                                        value={formState.phone}
                                        onChange={(e) => handleFieldChange('phone', e.target.value)}
                                        className="profile-input"
                                        placeholder="+91 98765 43210"
                                    />
                                </Field>
                                <Field label="Location">
                                    <input
                                        value={formState.location}
                                        onChange={(e) => handleFieldChange('location', e.target.value)}
                                        className="profile-input"
                                        placeholder="Hyderabad, India"
                                    />
                                </Field>
                                <Field label="LinkedIn">
                                    <input
                                        value={formState.linkedin}
                                        onChange={(e) => handleFieldChange('linkedin', e.target.value)}
                                        className="profile-input"
                                        placeholder="https://linkedin.com/in/yourname"
                                    />
                                </Field>
                                <Field label="GitHub">
                                    <input
                                        value={formState.github}
                                        onChange={(e) => handleFieldChange('github', e.target.value)}
                                        className="profile-input"
                                        placeholder="https://github.com/yourname"
                                    />
                                </Field>
                            </div>
                            <Field label="Bio">
                                <textarea
                                    value={formState.bio}
                                    onChange={(e) => handleFieldChange('bio', e.target.value)}
                                    className="profile-input min-h-[120px] resize-none"
                                    placeholder="Add a short professional summary, your goals, and what roles you are preparing for."
                                />
                            </Field>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    {saveMessage ? <p className="text-sm text-emerald-200">{saveMessage}</p> : null}
                                    {error ? <p className="text-sm text-rose-200">{error}</p> : null}
                                </div>
                                <button type="submit" disabled={saving} className="brand-btn gap-2 text-sm disabled:opacity-60">
                                    <Save size={15} />
                                    {saving ? 'Saving...' : 'Save Profile'}
                                </button>
                            </div>
                        </form>
                    </div>

                    <div className="space-y-6">
                        <div className="glass-card p-6">
                            <div className="mb-4 flex items-center gap-2 text-slate-200">
                                <ShieldCheck size={18} className="text-amber-300" />
                                <h3 className="text-lg font-medium">Professional Snapshot</h3>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <ProfilePanel label="Target Role" value={profile?.targetRole || 'Not set yet'} />
                                <ProfilePanel
                                    label="Experience"
                                    value={profile?.yearsExperience !== null && profile?.yearsExperience !== undefined
                                        ? `${profile.yearsExperience}+ years`
                                        : 'Still inferred from context'}
                                />
                                <ProfilePanel label="Preferred Modes" value={(profile?.preferredModes || []).join(', ') || 'Not enough session history yet'} />
                                <ProfilePanel label="Current Focus" value={(profile?.focusAreas || []).join(', ') || 'No repeating weak pattern yet'} />
                            </div>
                            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
                                <p className="text-xs uppercase tracking-wide subtle-text">Interview Summary</p>
                                <p className="mt-2 text-sm text-slate-200">
                                    {formState.bio || profile?.summary || 'Add a short profile summary so this page reflects your background more clearly.'}
                                </p>
                            </div>
                        </div>

                        <div className="glass-card p-6">
                            <div className="mb-4 flex items-center gap-2 text-slate-200">
                                <Target size={18} className="text-violet-300" />
                                <h3 className="text-lg font-medium">Role-Aware Performance</h3>
                            </div>
                            <div className="space-y-3">
                                {modePerformance.length > 0 ? modePerformance.map((item: any) => (
                                    <div key={item.mode} className="rounded-xl border border-white/10 bg-white/5 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="font-medium text-slate-100">{item.label}</p>
                                                <p className="mt-1 text-xs subtle-text">{item.sessions} sessions practiced</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-semibold text-slate-100">{item.score}%</p>
                                                <p className="text-xs subtle-text">Delta {item.delta > 0 ? '+' : ''}{item.delta}</p>
                                            </div>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm subtle-text">
                                        Mode-specific performance appears after more scored practice.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="grid gap-6 lg:grid-cols-[1fr,1fr]">
                    <div className="glass-card p-6">
                        <div className="mb-4 flex items-center gap-2 text-slate-200">
                            <FileBadge2 size={18} className="text-emerald-300" />
                            <h3 className="text-lg font-medium">Resume Library</h3>
                        </div>
                        <div className="space-y-3">
                            {resumes.length > 0 ? resumes.map((resume: any, index: number) => (
                                <div key={resume.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <p className="font-medium text-slate-100">Resume #{resumes.length - index}</p>
                                            <p className="mt-1 text-xs subtle-text">
                                                Uploaded {resume.createdAt ? new Date(resume.createdAt).toLocaleDateString() : 'recently'}
                                            </p>
                                        </div>
                                        {resume.fileUrl ? (
                                            <a
                                                href={resume.fileUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="ghost-btn px-3 py-1.5 text-xs"
                                            >
                                                Open Resume
                                            </a>
                                        ) : null}
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {(resume.parsedSkills || []).slice(0, 6).map((skill: string) => (
                                            <span key={skill} className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
                                                {skill}
                                            </span>
                                        ))}
                                    </div>
                                    {resume.resumePreview ? (
                                        <p className="mt-3 text-sm subtle-text">{resume.resumePreview}...</p>
                                    ) : null}
                                </div>
                            )) : (
                                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm subtle-text">
                                    No resume versions are linked yet. Upload a resume during interview setup to build your resume library.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="glass-card p-6">
                            <div className="mb-4 flex items-center gap-2 text-slate-200">
                                <Sparkles size={18} className="text-cyan-300" />
                                <h3 className="text-lg font-medium">Recommended Next Practice</h3>
                            </div>
                            <div className="grid gap-4">
                                {recommendations.length > 0 ? recommendations.map((item: any) => (
                                    <div key={item.title} className="rounded-xl border border-white/10 bg-white/5 p-4">
                                        <p className="font-medium text-slate-100">{item.title}</p>
                                        <p className="mt-1 text-sm subtle-text">{item.detail}</p>
                                        <Link href={item.href} className="mt-3 inline-flex rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-100 transition hover:border-cyan-300/50">
                                            {item.actionLabel}
                                        </Link>
                                    </div>
                                )) : (
                                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm subtle-text">
                                        Recommendations will appear once the system has enough session evidence.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="glass-card p-6">
                            <div className="mb-4 flex items-center gap-2 text-slate-200">
                                <Sparkles size={18} className="text-emerald-300" />
                                <h3 className="text-lg font-medium">Skill Heatmap Summary</h3>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                                {topicMastery.slice(0, 8).map((item: any) => (
                                    <div key={item.topic} className="rounded-xl border border-white/10 bg-white/5 p-4">
                                        <p className="text-sm font-medium text-slate-100">{item.topic}</p>
                                        <div className="mt-3 h-2 rounded-full bg-slate-800">
                                            <div
                                                className="h-2 rounded-full bg-gradient-to-r from-cyan-400 via-emerald-300 to-emerald-500"
                                                style={{ width: `${Math.max(8, Math.min(100, item.score || 0))}%` }}
                                            />
                                        </div>
                                        <p className="mt-2 text-xs subtle-text">{item.score}% mastery signal</p>
                                    </div>
                                ))}
                                {topicMastery.length === 0 ? (
                                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm subtle-text">
                                        Complete more scored interviews to see your strongest skill clusters.
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}

function ProfileStat({ label, value }: { label: string; value: string | number }) {
    return (
        <article className="glass-card p-5">
            <p className="subtle-text text-xs uppercase tracking-wide">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-100">{value}</p>
        </article>
    );
}

function ProfilePanel({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide subtle-text">{label}</p>
            <p className="mt-2 text-sm text-slate-100">{value}</p>
        </div>
    );
}

function ProfileHighlight({
    eyebrow,
    title,
    detail,
    tone
}: {
    eyebrow: string;
    title: string;
    detail: string;
    tone: 'cyan' | 'emerald' | 'amber' | 'violet';
}) {
    const toneClass = {
        cyan: 'border-cyan-400/20 bg-cyan-500/10',
        emerald: 'border-emerald-400/20 bg-emerald-500/10',
        amber: 'border-amber-300/20 bg-amber-400/10',
        violet: 'border-violet-400/20 bg-violet-500/10'
    }[tone];

    return (
        <article className={`rounded-2xl border p-4 backdrop-blur-sm ${toneClass}`}>
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-200/70">{eyebrow}</p>
            <p className="mt-2 text-xl font-semibold text-white">{title}</p>
            <p className="mt-1 text-sm text-slate-200/80">{detail}</p>
        </article>
    );
}

function IdentityPill({ icon, text }: { icon: ReactNode; text: string }) {
    return (
        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-2 text-xs text-slate-100">
            {icon}
            <span>{text}</span>
        </div>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-xs text-slate-300">{label}</span>
            {children}
        </label>
    );
}
