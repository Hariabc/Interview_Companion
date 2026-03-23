import os
import json
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(
    api_key=os.environ.get("GROQ_API_KEY"),
)

def rewrite_answer_text(
    answer_text: str,
    question_text: str,
    ideal_answer_text: str = None,
    ideal_keywords: list = None,
    feedback_text: str = None
):
    try:
        completion = client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": """You are an expert interview coach.

                    Rewrite the candidate's answer so it becomes a stronger, interview-ready response.
                    Constraints:
                    - Preserve the candidate's core meaning and plausible experience.
                    - Do not invent unrealistic achievements, employers, metrics, or technologies.
                    - Improve structure, clarity, specificity, and professionalism.
                    - Prefer concise spoken-answer style, around 120-220 words.
                    - If the question is behavioral, use a STAR-style structure naturally.
                    - If the question is technical, make the reasoning clearer and mention trade-offs when appropriate.

                    Return ONLY valid JSON with:
                    - rewritten_answer: the polished answer
                    - rewrite_summary: one sentence on what improved
                    """
                },
                {
                    "role": "user",
                    "content": f"""
                    Question: {question_text}
                    Candidate Answer: {answer_text}
                    Ideal Answer: {ideal_answer_text or "Not provided"}
                    Ideal Keywords: {ideal_keywords or []}
                    Existing Feedback: {feedback_text or "None"}
                    """
                }
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.3,
            response_format={"type": "json_object"}
        )

        result = json.loads(completion.choices[0].message.content)
        return result
    except Exception as e:
        print(f"Error rewriting answer with Groq: {e}")
        base = (answer_text or "").strip()
        fallback = base if base else "No answer available to rewrite."
        return {
            "rewritten_answer": fallback,
            "rewrite_summary": "Automatic rewrite is unavailable right now."
        }

def score_answer_text(answer_text: str, question_text: str, ideal_answer_text: str = None, ideal_keywords: list = None):
    print(f"Scoring answer for question: {question_text}") # DEBUG
    ideal_preview = ideal_answer_text[:50] if ideal_answer_text else "None"
    print(f"Ideal Answer: {ideal_preview}...") # DEBUG
    
    try:
        completion = client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": """You are an expert technical interviewer. Evaluate the candidate's answer based on the question and the ideal answer (if provided).
                    
                    IMPORTANT: The candidate's answer is a TRANSCRIPTION of speech. 
                    - Ignore minor transcription errors, lack of punctuation, or run-on sentences typical of speech to text.
                    - Focus on the SEMANTIC content and technical accuracy.
                    
                    Return ONLY valid JSON with the following fields:
                    - semantic_score (0-100): How relevant and accurate the answer is.
                    - keyword_score (0-100): How well it covers key concepts (synonyms are okay).
                    - grammar_score (0-100): Clarity and structure (be lenient for spoken word).
                    - final_score (0-100): Weighted average (Semantic 50%, Keywords 30%, Grammar 20%).
                    - feedback_text: Constructive feedback (2-3 sentences max). Mention if it was a good spoken explanation.
                    """
                },
                {
                    "role": "user",
                    "content": f"""
                    Question: {question_text}
                    Ideal Answer: {ideal_answer_text or "Not provided, please infer from the question."}
                    Keywords: {ideal_keywords}
                    
                    Candidate Answer: {answer_text}
                    """
                }
            ],
            model="llama-3.3-70b-versatile",
            temperature=0,
            response_format={"type": "json_object"}
        )
        
        result = json.loads(completion.choices[0].message.content)
        return result

    except Exception as e:
        print(f"Error calling Groq: {e}")
        # Fallback to a basic structure on error
        return {
            "semantic_score": 0,
            "keyword_score": 0,
            "grammar_score": 0,
            "final_score": 0,
            "feedback_text": f"Error during evaluation: {str(e)}"
        }
