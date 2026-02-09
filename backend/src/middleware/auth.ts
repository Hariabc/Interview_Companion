import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { createClient } from '@supabase/supabase-js';

export interface AuthRequest extends Request {
    user?: any;
    userSupabase?: any; // User-authenticated Supabase client
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: 'Missing Authorization header' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
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
    } catch (err) {
        res.status(500).json({ error: 'Authentication failed' });
    }
};
