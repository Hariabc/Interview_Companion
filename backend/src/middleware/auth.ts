import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { createClient } from '@supabase/supabase-js';

export interface AuthRequest extends Request {
    user?: any;
    userSupabase?: any; // User-authenticated Supabase client
}

function parseBearerToken(authHeader: string | undefined): string | null {
    if (!authHeader) return null;
    const [scheme, token] = authHeader.split(' ');
    if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null;
    return token;
}

function decodeJwtPayload(token: string): any | null {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const payload = parts[1]
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        const normalized = payload + '='.repeat((4 - (payload.length % 4)) % 4);
        const json = Buffer.from(normalized, 'base64').toString('utf8');
        return JSON.parse(json);
    } catch {
        return null;
    }
}

function getLocalFallbackUser(token: string): any | null {
    const allowFallback = String(process.env.SUPABASE_AUTH_LOCAL_JWT_FALLBACK || '').toLowerCase() === 'true';
    if (!allowFallback) return null;

    const payload = decodeJwtPayload(token);
    if (!payload || !payload.sub) return null;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && Number(payload.exp) <= now) return null;

    return {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        app_metadata: payload.app_metadata,
        user_metadata: payload.user_metadata
    };
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = parseBearerToken(req.headers.authorization);

    if (!token) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    try {
        let user: any = null;

        const { data, error } = await supabase.auth.getUser(token);
        if (!error && data?.user) {
            user = data.user;
        } else {
            user = getLocalFallbackUser(token);
        }

        if (!user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        req.user = user;

        // Create a user-authenticated Supabase client for RLS-compliant operations
        // This client will have the user's JWT token, allowing it to pass RLS policies
        req.userSupabase = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_ANON_KEY!,
            {
                global: {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            }
        );

        next();
    } catch {
        res.status(500).json({ error: 'Authentication failed' });
    }
};
