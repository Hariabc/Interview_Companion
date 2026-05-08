import express from 'express';
import axios from 'axios';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { authenticate, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';

const router = express.Router();
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const CODING_ENABLED_MODES = new Set(['dsa_round', 'system_design', 'rapid_fire']);

type CodingLanguage = 'Python' | 'Javascript' | 'Cpp' | 'Java' | 'Sql';

interface CodeTestCase {
    input: string;
    expected: string;
    hidden?: boolean;
}

interface GeneratedChallenge {
    id: string;
    title: string;
    prompt: string;
    languages: string[];
    starter_code: Record<string, string>;
    visible_tests: CodeTestCase[];
    hidden_tests: CodeTestCase[];
}

const SUPPORTED_LANGUAGES: CodingLanguage[] = ['Python', 'Javascript', 'Cpp', 'Java', 'Sql'];
const challengeCache = new Map<string, GeneratedChallenge>();

function codingEnabledForMode(mode: any) {
    return CODING_ENABLED_MODES.has(String(mode || 'balanced').trim().toLowerCase());
}

function voiceForInterviewerGender(gender: any): 'female_friendly' | 'male_professional' {
    return String(gender || '').trim().toLowerCase() === 'male'
        ? 'male_professional'
        : 'female_friendly';
}

function normalizeOutput(s: string) {
    return (s || '').trim().replace(/\r\n/g, '\n');
}

function commandExists(command: string) {
    const check = spawnSync(command, ['--version'], { encoding: 'utf-8', timeout: 3000 });
    return !check.error;
}

function executeLocal(language: CodingLanguage, code: string, stdin: string) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ic-code-'));
    const run = (cmd: string, args: string[], cwd: string) => {
        const result = spawnSync(cmd, args, {
            cwd,
            input: stdin,
            encoding: 'utf-8',
            timeout: 10000
        });
        if (result.error) {
            if ((result.error as any).code === 'ENOENT') {
                throw new Error(`Runtime '${cmd}' is not installed on server`);
            }
            throw result.error;
        }
        return result;
    };

    try {
        if (language === 'Sql') {
            if (!commandExists('python')) throw new Error("Python runtime not available on server for SQL evaluation");
            const sqlRunner = `
import sqlite3, json, sys
setup_sql = sys.argv[1]
query = sys.argv[2]
conn = sqlite3.connect(':memory:')
cur = conn.cursor()
cur.executescript(setup_sql)
rows = cur.execute(query).fetchall()
print(json.dumps(rows, separators=(',',':')))
`;
            const r = spawnSync('python', ['-c', sqlRunner, stdin, code], {
                encoding: 'utf-8',
                timeout: 10000
            });
            if (r.error) {
                if ((r.error as any).code === 'ENOENT') throw new Error("Python runtime not available on server");
                throw r.error;
            }
            return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status ?? 1, signal: r.signal };
        }

        if (language === 'Python') {
            if (!commandExists('python')) throw new Error("Python runtime not available on server");
            fs.writeFileSync(path.join(tmpDir, 'main.py'), code, 'utf-8');
            const r = run('python', ['main.py'], tmpDir);
            return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status ?? 1, signal: r.signal };
        }

        if (language === 'Javascript') {
            if (!commandExists('node')) throw new Error("Node.js runtime not available on server");
            fs.writeFileSync(path.join(tmpDir, 'main.js'), code, 'utf-8');
            const r = run('node', ['main.js'], tmpDir);
            return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status ?? 1, signal: r.signal };
        }

        if (language === 'Cpp') {
            if (!commandExists('g++')) throw new Error("C++ compiler (g++) not available on server");
            fs.writeFileSync(path.join(tmpDir, 'main.cpp'), code, 'utf-8');
            const exeName = process.platform === 'win32' ? 'main.exe' : 'main';
            const compile = spawnSync('g++', ['main.cpp', '-O2', '-std=c++17', '-o', exeName], {
                cwd: tmpDir,
                encoding: 'utf-8',
                timeout: 15000
            });
            if (compile.error) throw compile.error;
            if ((compile.status ?? 1) !== 0) {
                return { stdout: '', stderr: compile.stderr || 'Compilation failed', status: compile.status ?? 1, signal: compile.signal };
            }
            const cmd = process.platform === 'win32' ? path.join(tmpDir, exeName) : `./${exeName}`;
            const r = run(cmd, [], tmpDir);
            return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status ?? 1, signal: r.signal };
        }

        if (!commandExists('javac') || !commandExists('java')) throw new Error("Java runtime/compiler not available on server");
        // Support both `public class X` and package-private `class X`.
        const classMatch =
            code.match(/public\s+class\s+([A-Za-z_][A-Za-z0-9_]*)/) ||
            code.match(/\bclass\s+([A-Za-z_][A-Za-z0-9_]*)/);
        const className = classMatch?.[1] || 'Main';
        const packageMatch = code.match(/^\s*package\s+([A-Za-z_][A-Za-z0-9_.]*)\s*;/m);
        const runClassName = packageMatch?.[1] ? `${packageMatch[1]}.${className}` : className;
        const sourceFile = `${className}.java`;
        fs.writeFileSync(path.join(tmpDir, sourceFile), code, 'utf-8');
        const compile = spawnSync('javac', ['-d', '.', sourceFile], {
            cwd: tmpDir,
            encoding: 'utf-8',
            timeout: 15000
        });
        if (compile.error) throw compile.error;
        if ((compile.status ?? 1) !== 0) {
            return { stdout: '', stderr: compile.stderr || 'Compilation failed', status: compile.status ?? 1, signal: compile.signal };
        }
        const attemptRun = (mainClass: string) => run('java', ['-cp', '.', mainClass], tmpDir);
        let r = attemptRun(runClassName);

        // If class resolution failed, fallback by scanning compiled classes and retry.
        if ((r.stderr || '').includes('Could not find or load main class')) {
            const listClassCandidates = (root: string) => {
                const stack = ['.'];
                const classes: string[] = [];
                while (stack.length) {
                    const relDir = stack.pop() as string;
                    const absDir = path.join(root, relDir);
                    const entries = fs.readdirSync(absDir, { withFileTypes: true });
                    for (const entry of entries) {
                        const childRel = path.join(relDir, entry.name);
                        if (entry.isDirectory()) {
                            stack.push(childRel);
                            continue;
                        }
                        if (!entry.isFile() || !entry.name.endsWith('.class') || entry.name.includes('$')) {
                            continue;
                        }
                        const noExt = childRel.replace(/\.class$/, '');
                        const normalized = noExt.replace(/[\\/]+/g, '.').replace(/^\.+/, '');
                        classes.push(normalized);
                    }
                }
                return classes;
            };

            const fallbackCandidates = Array.from(new Set([className, runClassName, ...listClassCandidates(tmpDir)]));
            for (const candidate of fallbackCandidates) {
                const maybe = attemptRun(candidate);
                if (!(maybe.stderr || '').includes('Could not find or load main class')) {
                    r = maybe;
                    break;
                }
            }
        }

        return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status ?? 1, signal: r.signal };
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

async function executeAgainstCase(language: CodingLanguage, code: string, testCase: CodeTestCase) {
    const run = executeLocal(language, code, testCase.input);
    const output = normalizeOutput(run.stdout || '');
    const expectedNormalized = normalizeOutput(testCase.expected);
    const passed = output === expectedNormalized && !run.stderr;

    return {
        passed,
        output,
        expectedNormalized,
        stderr: run.stderr || '',
        code: run.status ?? 0,
        signal: run.signal ?? null
    };
}

function cacheKey(sessionId: string, challengeId: string) {
    return `${sessionId}:${challengeId}`;
}

function buildCodeMetrics(code: string) {
    const lines = String(code || '').split(/\r?\n/);
    return {
        line_count: lines.length,
        non_empty_line_count: lines.filter((line) => line.trim().length > 0).length,
        character_count: String(code || '').length
    };
}

async function updateCodingSessionContext(sessionId: string, userId: string, updater: (context: any) => any) {
    const { data: sessionRow, error: sessionReadError } = await supabase
        .from('interview_sessions')
        .select('id, user_id, conversation_context')
        .eq('id', sessionId)
        .single();

    if (sessionReadError) {
        console.error('Failed to load session for coding context update:', sessionReadError);
        return null;
    }

    if (sessionRow?.user_id && sessionRow.user_id !== userId) {
        return null;
    }

    const existingContext =
        sessionRow?.conversation_context && typeof sessionRow.conversation_context === 'object'
            ? sessionRow.conversation_context
            : {};

    const updatedContext = updater(existingContext);

    const { error: sessionUpdateError } = await supabase
        .from('interview_sessions')
        .update({ conversation_context: updatedContext })
        .eq('id', sessionId);

    if (sessionUpdateError) {
        console.error('Failed to persist coding round into session context:', sessionUpdateError);
    }

    return updatedContext;
}

router.get('/challenge', authenticate, async (req: AuthRequest, res) => {
    const sessionId = String(req.query.session_id || '');
    const round = Number(req.query.round || 1);

    if (!sessionId) {
        return res.status(400).json({ error: 'session_id is required' });
    }

    try {
        const { data: session, error: sessionError } = await supabase
            .from('interview_sessions')
            .select('id, user_id, resume_profile_id, conversation_context')
            .eq('id', sessionId)
            .single();
        if (sessionError) {
            if (sessionError.code && sessionError.code !== 'PGRST116') {
                console.error('GET /coding/challenge session lookup error:', sessionError);
                return res.status(500).json({ error: sessionError.message || 'Failed to load interview session' });
            }
            return res.status(404).json({ error: 'Interview session not found' });
        }
        if (session?.user_id && req.user?.id && session.user_id !== req.user.id) {
            return res.status(403).json({ error: 'You are not allowed to access this interview session' });
        }

        const interviewMode = String(session?.conversation_context?.interview_mode || 'balanced');
        if (!codingEnabledForMode(interviewMode)) {
            return res.status(400).json({
                error: `Coding round is disabled for ${interviewMode.replace(/_/g, ' ')} mode`
            });
        }

        let resumeText = '';
        if (session?.resume_profile_id) {
            const { data: profile } = await supabase
                .from('resume_profiles')
                .select('resume_text')
                .eq('id', session.resume_profile_id)
                .single();
            resumeText = profile?.resume_text || '';
        }

        const context = session?.conversation_context || {};
        const interviewerVoice = voiceForInterviewerGender(context?.interviewer_gender);
        const topics = Array.isArray(context?.key_topics) && context.key_topics.length
            ? context.key_topics
            : (Array.isArray(context?.areas_of_interest) && context.areas_of_interest.length
                ? context.areas_of_interest
                : ['General Programming']);
        const mentionedSkills = Array.isArray(context?.mentioned_skills) ? context.mentioned_skills : [];
        const userSummary = context?.summary || '';

        const generated = await axios.post(`${ML_SERVICE_URL}/coding/generate_challenge`, {
            resume_text: resumeText,
            topics,
            mentioned_skills: mentionedSkills,
            user_summary: userSummary,
            round
        });

        const challenge: GeneratedChallenge = {
            id: generated.data?.id || `dynamic-${Date.now()}`,
            title: generated.data?.title || 'Coding Challenge',
            prompt: generated.data?.prompt || 'Solve the coding problem using the required input/output format.',
            languages: (generated.data?.languages || SUPPORTED_LANGUAGES).filter((x: string) => SUPPORTED_LANGUAGES.includes(x as CodingLanguage)),
            starter_code: generated.data?.starter_code || {},
            visible_tests: generated.data?.visible_tests || [],
            hidden_tests: generated.data?.hidden_tests || []
        };

        if (!challenge.languages.length) challenge.languages = SUPPORTED_LANGUAGES;
        if (!challenge.visible_tests.length) {
            challenge.visible_tests = [
                { input: '5\n1 4 6 2 9\n8\n', expected: 'YES' },
                { input: '4\n1 2 3 9\n8\n', expected: 'NO' }
            ];
        }
        if (!challenge.hidden_tests.length) {
            challenge.hidden_tests = [
                { input: '6\n10 -2 3 7 5 1\n8\n', expected: 'YES', hidden: true },
                { input: '3\n5 5 5\n11\n', expected: 'NO', hidden: true }
            ];
        }

        challengeCache.set(cacheKey(sessionId, challenge.id), challenge);

        let audio_base64: string | null = null;
        try {
            const tts = await axios.post(`${ML_SERVICE_URL}/synthesize_speech`, null, {
                params: {
                    text: `Now let's switch to coding. ${challenge.title}.`,
                    voice: interviewerVoice
                }
            });
            audio_base64 = tts.data?.audio_base64 || null;
        } catch {
            audio_base64 = null;
        }

        return res.json({
            id: challenge.id,
            title: challenge.title,
            prompt: challenge.prompt,
            languages: challenge.languages,
            starter_code: challenge.starter_code,
            visible_tests: challenge.visible_tests,
            intro_audio_base64: audio_base64,
            interviewer_gender: context?.interviewer_gender || 'female'
        });
    } catch (error: any) {
        return res.status(500).json({ error: error?.response?.data?.detail || error?.message || 'Failed to generate coding challenge' });
    }
});

router.post('/run', authenticate, async (req: AuthRequest, res) => {
    const { language, code, session_id, challenge_id } = req.body || {};
    if (!language || !code || !session_id || !challenge_id) {
        return res.status(400).json({ error: 'language, code, session_id, challenge_id are required' });
    }
    if (!SUPPORTED_LANGUAGES.includes(language as CodingLanguage)) {
        return res.status(400).json({ error: 'Unsupported language' });
    }

        const challenge = challengeCache.get(cacheKey(String(session_id), String(challenge_id)));
    if (!challenge) {
        return res.status(400).json({ error: 'Challenge not found. Please refresh coding round.' });
    }

    try {
        const results: Array<{
            input: string;
            expected: string;
            passed: boolean;
            output: string;
            expectedNormalized: string;
            stderr: string;
            code: number;
            signal: any;
        }> = [];
        for (const testCase of challenge.visible_tests) {
            const result = await executeAgainstCase(language, code, testCase);
            results.push({ input: testCase.input, expected: testCase.expected, ...result });
            if (result.stderr) break;
        }

        const passedCount = results.filter((r: any) => r.passed).length;

        const updatedContext = await updateCodingSessionContext(String(session_id), req.user.id, (existingContext: any) => {
            const previousDraft = existingContext?.coding_round_draft || {};
            return {
                ...existingContext,
                coding_round_draft: {
                    ...previousDraft,
                    challenge_id: challenge.id,
                    title: challenge.title,
                    prompt: challenge.prompt,
                    language,
                    run_count: Number(previousDraft?.run_count || 0) + 1,
                    last_run_at: new Date().toISOString(),
                    last_run: {
                        passed: passedCount,
                        total: challenge.visible_tests.length,
                        results
                    },
                    code_metrics: buildCodeMetrics(code)
                }
            };
        });

        return res.json({
            mode: 'run',
            passed: passedCount,
            total: challenge.visible_tests.length,
            results,
            run_count: Number(updatedContext?.coding_round_draft?.run_count || 0)
        });
    } catch (error: any) {
        console.error('POST /coding/run failed:', error?.message || error);
        return res.status(500).json({ error: error?.message || 'Failed to run code' });
    }
});

router.post('/submit', authenticate, async (req: AuthRequest, res) => {
    const { language, code, userTranscript, session_id, challenge_id } = req.body || {};
    if (!language || !code || !session_id || !challenge_id) {
        return res.status(400).json({ error: 'language, code, session_id, challenge_id are required' });
    }
    if (!SUPPORTED_LANGUAGES.includes(language as CodingLanguage)) {
        return res.status(400).json({ error: 'Unsupported language' });
    }

    const challenge = challengeCache.get(cacheKey(String(session_id), String(challenge_id)));
    if (!challenge) {
        return res.status(400).json({ error: 'Challenge not found. Please refresh coding round.' });
    }

    try {
        const allTests = [...challenge.visible_tests, ...challenge.hidden_tests];
        const detailedResults = [];
        for (const testCase of allTests) {
            const result = await executeAgainstCase(language, code, testCase);
            detailedResults.push({
                hidden: Boolean(testCase.hidden),
                input: testCase.hidden ? '[hidden]' : testCase.input,
                expected: testCase.hidden ? '[hidden]' : testCase.expected,
                ...result
            });
            if (result.stderr) break;
        }

        const passedCount = detailedResults.filter((r: any) => r.passed).length;
        const total = allTests.length;
        const allPassed = passedCount === total;
        const visibleResults = detailedResults.filter((result: any) => !result.hidden);
        const hiddenResults = detailedResults.filter((result: any) => result.hidden);
        const codeMetrics = buildCodeMetrics(code);

        let aiFeedback: any = {
            summary: allPassed ? 'Great job. All tests passed.' : `You passed ${passedCount}/${total} tests.`,
            time_complexity: 'Could not estimate',
            space_complexity: 'Could not estimate',
            optimizations: ['Review edge cases and simplify logic where possible.'],
            positives: [],
            negatives: []
        };

        try {
            const feedbackResponse = await axios.post(`${ML_SERVICE_URL}/coding/analyze_submission`, {
                challenge_title: challenge.title,
                challenge_prompt: challenge.prompt,
                language,
                code,
                passed_count: passedCount,
                total_count: total,
                run_results: detailedResults,
                user_transcript: userTranscript || null
            });
            aiFeedback = feedbackResponse.data || aiFeedback;
        } catch (e) {
            console.error('AI code feedback failed:', e);
        }

        const { data: voiceSessionRow } = await supabase
            .from('interview_sessions')
            .select('conversation_context')
            .eq('id', String(session_id))
            .single();
        const interviewerVoice = voiceForInterviewerGender(voiceSessionRow?.conversation_context?.interviewer_gender);

        let audio_base64: string | null = null;
        try {
            const tts = await axios.post(`${ML_SERVICE_URL}/synthesize_speech`, null, {
                params: {
                    text: aiFeedback?.summary || (allPassed ? 'Nice work on the coding round.' : 'Let us improve this solution together.'),
                    voice: interviewerVoice
                }
            });
            audio_base64 = tts.data?.audio_base64 || null;
        } catch {
            audio_base64 = null;
        }

        const { data: sessionRow } = await supabase
            .from('interview_sessions')
            .select('conversation_context')
            .eq('id', String(session_id))
            .single();

        const existingContext =
            sessionRow?.conversation_context && typeof sessionRow.conversation_context === 'object'
                ? sessionRow.conversation_context
                : {};
        const previousDraft = existingContext?.coding_round_draft || {};
        const existingHistory = Array.isArray(existingContext?.coding_round_history)
            ? existingContext.coding_round_history
            : [];
        const priorSubmissionsForChallenge = existingHistory.filter((item: any) => item?.challenge_id === challenge.id).length;

        const codingRoundReport = {
            challenge_id: challenge.id,
            title: challenge.title,
            prompt: challenge.prompt,
            language,
            passed: passedCount,
            total,
            all_passed: allPassed,
            run_count: Number(previousDraft?.run_count || 0),
            submit_count: priorSubmissionsForChallenge + 1,
            visible_passed: visibleResults.filter((result: any) => result.passed).length,
            visible_total: visibleResults.length,
            hidden_passed: hiddenResults.filter((result: any) => result.passed).length,
            hidden_total: hiddenResults.length,
            completed_test_cases: detailedResults.length,
            code_metrics: codeMetrics,
            results: detailedResults,
            feedback: aiFeedback,
            submitted_at: new Date().toISOString()
        };

        try {
            await updateCodingSessionContext(String(session_id), req.user.id, (currentContext: any) => {
                const history = Array.isArray(currentContext?.coding_round_history)
                    ? currentContext.coding_round_history
                    : [];
                return {
                    ...currentContext,
                    coding_round: codingRoundReport,
                    coding_round_history: [...history, codingRoundReport].slice(-5),
                    coding_round_draft: null
                };
            });
        } catch (persistErr) {
            console.error('Unexpected coding report persistence error:', persistErr);
        }

        return res.json({
            mode: 'submit',
            passed: passedCount,
            total,
            all_passed: allPassed,
            results: detailedResults,
            feedback: aiFeedback,
            feedback_audio_base64: audio_base64,
            coding_round_report: codingRoundReport
        });
    } catch (error: any) {
        console.error('POST /coding/submit failed:', error?.message || error);
        return res.status(500).json({ error: error?.message || 'Failed to submit code' });
    }
});

export default router;
