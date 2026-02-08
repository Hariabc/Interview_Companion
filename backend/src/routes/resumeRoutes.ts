import express from 'express';
import multer from 'multer';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import { authenticate, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';

const router = express.Router();
console.log("Loading resumeRoutes...");
const upload = multer({ dest: 'uploads/' }); // Temp storage

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

// POST /resume/upload
router.post('/upload', authenticate, upload.single('resume'), async (req: AuthRequest, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const userId = req.user.id;

    try {
        // 1. Send to ML Service
        const formData = new FormData();
        formData.append('file', fs.createReadStream(filePath));

        const mlResponse = await axios.post(`${ML_SERVICE_URL}/parse_resume`, formData, {
            headers: {
                ...formData.getHeaders(),
            },
        });

        const { skills, extracted_text } = mlResponse.data;

        // 2. Setup Supabase storage path
        // We might want to upload the file to Supabase Storage as well for persistence
        // For now, we'll skip the actual file upload to Storage bucket to keep it simple as per plan,
        // or we can implement it if the bucket exists. 
        // Let's assume we just store the text/skills in DB. 
        // If we want to store the file, we'd use supabase.storage.from('resumes').upload(...)

        // 3. Save to Database
        const { data: profile, error } = await supabase
            .from('resume_profiles')
            .insert([{
                user_id: userId,
                resume_text: extracted_text,
                parsed_skills: skills,
                file_url: 'placeholder_url' // We'll verify storage later
            }])
            .select()
            .single();

        if (error) throw error;

        res.json({ message: 'Resume uploaded and processed successfully', profile });

    } catch (error: any) {
        console.error("Resume upload error:", error.message);
        res.status(500).json({ error: error.message || 'Failed to process resume' });
    } finally {
        // Cleanup temp file
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
});

export default router;
