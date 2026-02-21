import json
import os
from typing import Dict, Any
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))


def analyze_code_submission(payload: Dict[str, Any]) -> Dict[str, Any]:
    challenge_title = payload.get("challenge_title", "Coding Challenge")
    challenge_prompt = payload.get("challenge_prompt", "")
    language = payload.get("language", "unknown")
    code = payload.get("code", "")
    passed_count = payload.get("passed_count", 0)
    total_count = payload.get("total_count", 0)
    run_results = payload.get("run_results", [])
    user_transcript = payload.get("user_transcript")

    transcript_context = f"\nCandidate note: {user_transcript}" if user_transcript else ""

    try:
        completion = client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": """You are a senior interviewer giving concise but useful code-review feedback.
Return ONLY valid JSON with this schema:
{
  "summary": "...",
  "time_complexity": "...",
  "space_complexity": "...",
  "optimizations": ["..."],
  "positives": ["..."],
  "negatives": ["..."]
}
Rules:
- Mention pass status naturally in summary.
- Estimate time/space complexity with best effort.
- Be supportive if candidate seems nervous in transcript.
- Give practical optimization suggestions only when needed.
"""
                },
                {
                    "role": "user",
                    "content": f"""Challenge: {challenge_title}
Prompt: {challenge_prompt}
Language: {language}
Passed: {passed_count}/{total_count}
Execution Results: {json.dumps(run_results)}
Code:
{code}
{transcript_context}
"""
                }
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.3,
            response_format={"type": "json_object"}
        )

        parsed = json.loads(completion.choices[0].message.content)
        return {
            "summary": parsed.get("summary", f"Passed {passed_count}/{total_count} tests."),
            "time_complexity": parsed.get("time_complexity", "Not determined"),
            "space_complexity": parsed.get("space_complexity", "Not determined"),
            "optimizations": parsed.get("optimizations", []),
            "positives": parsed.get("positives", []),
            "negatives": parsed.get("negatives", [])
        }
    except Exception as e:
        print(f"Error analyzing code submission: {e}")
        return {
            "summary": f"Code submitted. You passed {passed_count}/{total_count} tests.",
            "time_complexity": "Could not determine automatically",
            "space_complexity": "Could not determine automatically",
            "optimizations": ["Review edge cases and reduce unnecessary loops."],
            "positives": ["Submission completed successfully."],
            "negatives": [] if passed_count == total_count else ["Some test cases failed."]
        }

