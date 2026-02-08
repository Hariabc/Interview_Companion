import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUtc = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUtc || !supabaseKey) {
    console.error("Missing Supabase env vars");
    process.exit(1);
}

const supabase = createClient(supabaseUtc, supabaseKey);

async function checkQuestions() {
    console.log("Attempting to insert dummy question with ideal_answer_text...");
    const { data: insertData, error: insertError } = await supabase
        .from('questions')
        .insert([{
            question_text: "Schema Check " + new Date().toISOString(),
            topic: "Debug",
            difficulty_level: 1,
            ideal_answer_keywords: ["debug"],
            ideal_answer_text: "If this saves, the column exists."
        }])
        .select();

    if (insertError) {
        console.error("INSERT FAILED:", insertError.message);
    } else {
        console.log("INSERT SUCCESS:", insertData);
    }

    console.log("Checking last 5 questions...");
    const { data, error } = await supabase
        .from('questions')
        .select('created_at, question_text, topic, ideal_answer_text')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error("Fetch failed:", error);
    } else {
        console.log("Last 5 questions:");
        data.forEach(q => {
            console.log(`[${q.created_at}] [${q.topic}] ${q.question_text.substring(0, 50)}... | Ideal: ${q.ideal_answer_text ? 'YES' : 'NO'}`);
        });
    }
}

checkQuestions();
