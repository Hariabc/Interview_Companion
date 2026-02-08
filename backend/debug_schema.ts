import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

async function run() {
    console.log("DEBUG: Inserting...");
    const { error } = await supabase.from('questions').insert([{
        question_text: "DEBUG_CONSTRAINT_" + Date.now(),
        topic: "Debug",
        difficulty_level: 6,
        ideal_answer_text: "CHECK CONSTRAINT",
        ideal_answer_keywords: ["test", "debug"]
    }]);

    if (error) {
        console.log("ERROR Code:", error.code);
        console.log("ERROR Msg:", error.message);
        console.log("ERROR Details:", error.details);
        console.log("ERROR Hint:", error.hint);
    } else {
        console.log("SUCCESS: Inserted.");
    }
}
run();
