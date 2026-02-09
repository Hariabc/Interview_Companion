import express from 'express';
import multer from 'multer';
import { authenticate, AuthRequest } from '../middleware/auth';
import axios from 'axios';
import FormData from 'form-data';
import { supabase } from '../config/supabase';

const router = express.Router();
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

// Configure Multer for Memory Storage (no local files)
const storage = multer.memoryStorage();

// File Filter for Audio
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedMimeTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/webm', 'audio/ogg'];
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only audio files are allowed.'));
    }
};

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: fileFilter
});

// POST /api/voice/upload
router.post('/upload', authenticate, upload.single('audio'), async (req: AuthRequest, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No audio file uploaded' });
        }

        const fileBuffer = req.file.buffer;
        const fileName = `${Date.now()}-${req.file.originalname}`;
        const filePath = `answers/${fileName}`;

        console.log('[VOICE UPLOAD] Starting upload process');
        console.log('[VOICE UPLOAD] File buffer size:', fileBuffer?.length || 'undefined');
        console.log('[VOICE UPLOAD] File name:', fileName);
        console.log('[VOICE UPLOAD] File path:', filePath);
        console.log('[VOICE UPLOAD] MIME type:', req.file.mimetype);
        console.log('[VOICE UPLOAD] User ID:', req.user?.id);

        // Use user-authenticated Supabase client for RLS-compliant storage operations
        const userSupabase = req.userSupabase;
        if (!userSupabase) {
            throw new Error('User Supabase client not available');
        }

        // 1. Upload to Supabase Storage (Directly from Buffer)
        console.log('[VOICE UPLOAD] Attempting Supabase upload...');
        const { data: uploadData, error: uploadError } = await userSupabase.storage
            .from('voice-answers')
            .upload(filePath, fileBuffer, {
                contentType: req.file.mimetype,
                upsert: true
            });

        if (uploadError) {
            console.error('[VOICE UPLOAD] Supabase Upload Error:', JSON.stringify(uploadError, null, 2));
            throw new Error(`Failed to upload to storage: ${uploadError.message}`);
        }
        console.log('[VOICE UPLOAD] Supabase upload successful');

        // 2. Get Public URL
        const { data: { publicUrl } } = userSupabase.storage
            .from('voice-answers')
            .getPublicUrl(filePath);

        // 3. Log to voice_uploads table
        // We assume session_id might be passed in body, or we leave it null until linked later
        // But usually file upload happens before answer submission.
        // Let's check if we can get session_id. The frontend might not send sameformData.
        // It does send 'audio' as key 'file'.
        // If we want to link it, we should ensure frontend sends session_id.
        // For now, we'll insert without session_id if missing, or try to read it.
        const sessionId = req.body.sessionId || null;

        const { data: voiceRecord, error: dbError } = await supabase
            .from('voice_uploads')
            .insert([{
                session_id: sessionId,
                filename: fileName,
                storage_path: filePath,
                public_url: publicUrl,
                file_size_bytes: req.file.size,
                mime_type: req.file.mimetype
            }])
            .select()
            .single();

        if (dbError) console.error("Database Insert Error (voice_uploads):", dbError);

        // 4. Forward to ML Service (Stream from Buffer)
        // We need to convert buffer to a stream or just pass buffer if axios supports it (it usually needs FormData with known length)
        const form = new FormData();
        form.append('file', fileBuffer, { filename: fileName, contentType: req.file.mimetype });

        let analysis = null;
        try {
            const mlResponse = await axios.post(`${ML_SERVICE_URL}/analyze_audio`, form, {
                headers: {
                    ...form.getHeaders()
                }
            });
            analysis = mlResponse.data;
        } catch (mlError: any) {
            console.error('ML Service Error:', mlError.message);
        }

        res.json({
            message: 'Audio processed and uploaded successfully',
            filename: fileName,
            publicUrl: publicUrl,
            uploadId: voiceRecord?.id, // Return ID for linking
            analysis: analysis
        });

    } catch (error: any) {
        console.error('Upload Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/voice/status (Health check for voice service components)
router.get('/status', (req, res) => {
    res.json({ status: 'Voice service operational', storage: 'memory' });
});

export default router;
