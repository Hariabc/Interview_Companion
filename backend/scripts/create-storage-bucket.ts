import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function createBucket() {
    console.log('Creating voice-answers bucket...');

    // Create the bucket
    const { data, error } = await supabase.storage.createBucket('voice-answers', {
        public: true,
        fileSizeLimit: 10485760, // 10MB
        allowedMimeTypes: ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/webm', 'audio/ogg']
    });

    if (error) {
        if (error.message.includes('already exists')) {
            console.log('✅ Bucket already exists');
        } else {
            console.error('❌ Error creating bucket:', error);
            process.exit(1);
        }
    } else {
        console.log('✅ Bucket created successfully:', data);
    }

    // List buckets to verify
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
        console.error('Error listing buckets:', listError);
    } else {
        console.log('\nExisting buckets:');
        buckets.forEach(bucket => {
            console.log(`  - ${bucket.name} (public: ${bucket.public})`);
        });
    }
}

createBucket();
