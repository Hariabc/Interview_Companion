export type InterviewMode =
    | 'balanced'
    | 'hr_round'
    | 'dsa_round'
    | 'salary_negotiation'
    | 'system_design'
    | 'behavioral_storytelling'
    | 'managerial_leadership'
    | 'rapid_fire';

const MODE_SET = new Set<InterviewMode>([
    'balanced',
    'hr_round',
    'dsa_round',
    'salary_negotiation',
    'system_design',
    'behavioral_storytelling',
    'managerial_leadership',
    'rapid_fire'
]);

const INTERVIEWER_PROFILES = [
    { name: 'Aarika', gender: 'female' },
    { name: 'Ananya', gender: 'female' },
    { name: 'Diya', gender: 'female' },
    { name: 'Isha', gender: 'female' },
    { name: 'Kavya', gender: 'female' },
    { name: 'Meera', gender: 'female' },
    { name: 'Naina', gender: 'female' },
    { name: 'Priya', gender: 'female' },
    { name: 'Riya', gender: 'female' },
    { name: 'Sara', gender: 'female' },
    { name: 'Aditya', gender: 'male' },
    { name: 'Arjun', gender: 'male' },
    { name: 'Karan', gender: 'male' },
    { name: 'Rohan', gender: 'male' },
    { name: 'Vikram', gender: 'male' }
];

export function normalizeMode(rawMode: any): InterviewMode {
    const mode = String(rawMode || '').trim().toLowerCase() as InterviewMode;
    return MODE_SET.has(mode) ? mode : 'balanced';
}

export function pickInterviewerProfile(seed?: string | null): { name: string; gender: string } {
    const value = String(seed || '').trim();
    if (!value) {
        return INTERVIEWER_PROFILES[Math.floor(Math.random() * INTERVIEWER_PROFILES.length)];
    }
    const hash = value.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return INTERVIEWER_PROFILES[hash % INTERVIEWER_PROFILES.length];
}

export function pickInterviewerName(seed?: string | null): string {
    return pickInterviewerProfile(seed).name;
}

export function buildModeIntroScript(mode: InterviewMode, userName?: string | null, interviewerName?: string | null): string {
    const hello = userName?.trim() ? `Hi ${userName.trim()},` : 'Hi,';
    const name = interviewerName?.trim() || pickInterviewerName();
    const intro = `${hello} I am ${name}, your AI interviewer for this session.`;
    switch (mode) {
        case 'salary_negotiation':
            return `${intro} We will begin with Salary Negotiation mode. First, introduce yourself. Then share the role and level you are targeting, your current or last compensation range, your expected range, and top priorities so we can run a realistic negotiation simulation.`;
        case 'hr_round':
            return `${intro} We will begin with HR Round mode. Please introduce yourself and share the kind of role and team environment you are aiming for. Then we will move into communication, collaboration, and conflict scenarios.`;
        case 'dsa_round':
            return `${intro} We will begin with DSA Round mode. Please introduce yourself and mention your preferred programming language. Then we will proceed with algorithmic problem-solving and complexity-focused questions.`;
        case 'system_design':
            return `${intro} We will begin with System Design mode. Please introduce yourself and mention a type of system you like building. Then we will discuss architecture, scaling, and reliability trade-offs.`;
        case 'behavioral_storytelling':
            return `${intro} We will begin with Behavioral Storytelling mode. Please introduce yourself and share one project you are proud of. Then we will go through impact-oriented STAR questions.`;
        case 'managerial_leadership':
            return `${intro} We will begin with Managerial Leadership mode. Please introduce yourself and your leadership scope. Then we will discuss people management, prioritization, and stakeholder alignment.`;
        case 'rapid_fire':
            return `${intro} We will begin with Rapid Fire mode. Please introduce yourself briefly. Then we will run fast, short questions across mixed topics.`;
        default:
            return `${intro} We will begin with Balanced Interview mode. Please introduce yourself and your background, then we will continue with a blend of technical and behavioral questions.`;
    }
}

export function buildModeRuntimeForStart(mode: InterviewMode) {
    return {
        active_mode: mode,
        stage: 'awaiting_intro',
        role_clarification_done: false,
        transitions: [{ at: new Date().toISOString(), to: 'awaiting_intro' }]
    };
}

export function extractRoleSignals(text: string) {
    const value = String(text || '').trim();
    const normalized = value.toLowerCase();

    const rolePatterns = [
        /(software engineer|sde ?[1-3]?|frontend engineer|backend engineer|full ?stack engineer|data engineer|machine learning engineer|product manager|engineering manager|devops engineer|qa engineer)/i,
        /role(?:\s+is|\s*:)?\s+([a-zA-Z ]{3,50})/i,
        /target(?:ing)?\s+(?:the\s+)?role(?:\s+of)?\s+([a-zA-Z ]{3,50})/i
    ];
    let targetRole: string | null = null;
    for (const pattern of rolePatterns) {
        const match = value.match(pattern);
        if (match?.[1]) {
            targetRole = String(match[1]).trim();
            break;
        }
    }

    const yearsMatch = normalized.match(/(\d{1,2})\+?\s*(?:years|yrs)/);
    const expectedMatch = value.match(/(?:expected|expecting|target)\s*(?:ctc|compensation|salary)?\s*(?:is|of|around|:)?\s*([$\u20b9€£]?\s*[\d,.]+(?:\s*(?:lpa|lakhs?|k|m|million))?)/i);
    const currentMatch = value.match(/(?:current|last|present)\s*(?:ctc|compensation|salary)?\s*(?:is|of|around|:)?\s*([$\u20b9€£]?\s*[\d,.]+(?:\s*(?:lpa|lakhs?|k|m|million))?)/i);

    return {
        target_role: targetRole,
        years_experience: yearsMatch?.[1] ? Number(yearsMatch[1]) : null,
        current_compensation: currentMatch?.[1] || null,
        expected_compensation: expectedMatch?.[1] || null
    };
}

export function shouldRequestRoleClarification(mode: InterviewMode, roleSignals: any): boolean {
    if (mode !== 'salary_negotiation') return false;
    return !roleSignals?.target_role;
}

export function buildRoleClarificationPrompt(mode: InterviewMode): string {
    if (mode === 'salary_negotiation') {
        return 'Before we proceed, please share the exact role and level you are negotiating for, plus your expected compensation range.';
    }
    return 'Before we proceed, please share your target role so I can tailor the interview better.';
}

export function buildModeGreeting(mode: InterviewMode, candidateName: string | null, roleSignals: any): string {
    const namePrefix = candidateName ? `${candidateName}, ` : '';
    if (mode === 'salary_negotiation') {
        const roleText = roleSignals?.target_role ? `for ${roleSignals.target_role}` : 'for your target role';
        return `Great, ${namePrefix}we will now run a salary negotiation simulation ${roleText}. I will challenge your positioning and you can justify your ask with impact, market data, and trade-offs.`;
    }
    if (mode === 'hr_round') {
        return `Great, ${namePrefix}we will now continue with HR-style situational and communication questions.`;
    }
    if (mode === 'dsa_round') {
        return `Great, ${namePrefix}we will now move into algorithm and complexity-focused questions.`;
    }
    if (mode === 'system_design') {
        return `Great, ${namePrefix}we will now proceed with system design discussions focused on trade-offs.`;
    }
    if (mode === 'behavioral_storytelling') {
        return `Great, ${namePrefix}we will now focus on behavioral storytelling with concrete outcomes.`;
    }
    if (mode === 'managerial_leadership') {
        return `Great, ${namePrefix}we will now discuss leadership decisions and stakeholder management scenarios.`;
    }
    if (mode === 'rapid_fire') {
        return `Great, ${namePrefix}we will now begin a rapid-fire mixed round. Keep your answers concise and structured.`;
    }
    return `Great, ${namePrefix}we will now begin your balanced interview round.`;
}

export function buildModeDirective(mode: InterviewMode, roleSignals: any): string {
    if (mode === 'salary_negotiation') {
        const role = roleSignals?.target_role ? `Role: ${roleSignals.target_role}.` : '';
        return `You are running a salary negotiation simulation. ${role} Ask compensation strategy, trade-off, and objection-handling questions. Do not ask DSA questions in this mode.`;
    }
    if (mode === 'hr_round') {
        return 'You are running an HR round. Focus on communication, ownership, conflict handling, and role fit. Do not ask DSA questions unless explicitly requested.';
    }
    if (mode === 'behavioral_storytelling' || mode === 'managerial_leadership') {
        return 'You are running a behavioral/leadership round. Focus on STAR narratives, decision-making, and measurable impact.';
    }
    if (mode === 'dsa_round') {
        return 'You are running a DSA round. Focus on algorithm design, edge cases, and time-space complexity.';
    }
    if (mode === 'system_design') {
        return 'You are running a system design round. Focus on architecture, reliability, scalability, and trade-offs.';
    }
    if (mode === 'rapid_fire') {
        return 'You are running a rapid-fire mixed round. Keep questions short and progressively challenging.';
    }
    return 'You are running a balanced interview round across technical and behavioral areas.';
}
