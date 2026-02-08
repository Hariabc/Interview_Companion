import express, { Request, Response } from 'express';
import { supabase } from '../config/supabase';

const router = express.Router();

// POST /auth/signup
router.post('/signup', async (req: Request, res: Response) => {
    const { email, password, full_name } = req.body;

    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { full_name },
            },
        });

        if (error) throw error;

        // Sync specific user table if needed
        if (data.user) {
            const { error: dbError } = await supabase
                .from('users')
                .insert([{ id: data.user.id, email: data.user.email, full_name }]);
            if (dbError) console.error("Error syncing user to DB:", dbError);
        }

        res.status(201).json({ message: 'User created successfully', user: data.user });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// POST /auth/login
router.post('/login', async (req: Request, res: Response) => {
    const { email, password } = req.body;

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) throw error;

        res.json({ session: data.session, user: data.user });
    } catch (error: any) {
        res.status(401).json({ error: error.message });
    }
});

export default router;
