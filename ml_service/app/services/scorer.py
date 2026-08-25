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

def _quick_score_answer(answer_text: str, question_text: str, ideal_keywords: list = None) -> dict:
    """Quick heuristic-based scoring without LLM call."""
    answer_lower = answer_text.lower()
    keywords = [k.lower() for k in (ideal_keywords or [])]

    # Keyword matching
    keyword_matches = sum(1 for k in keywords if k in answer_lower)
    keyword_score = min(100, int((keyword_matches / max(len(keywords), 1)) * 100)) if keywords else 50

    # Length check (typical good answer is 50-300 words)
    word_count = len(answer_text.split())
    if 50 <= word_count <= 300:
        grammar_score = 75
    elif 30 <= word_count < 50 or 300 < word_count <= 500:
        grammar_score = 60
    else:
        grammar_score = 40

    # Semantic heuristic: check for key phrases
    good_phrases = ["because", "example", "approach", "learned", "improve", "trade-off", "consider"]
    has_good_phrases = sum(1 for phrase in good_phrases if phrase in answer_lower)
    semantic_score = min(100, int((has_good_phrases / len(good_phrases)) * 100))

    # Weighted average
    final_score = int(semantic_score * 0.5 + keyword_score * 0.3 + grammar_score * 0.2)

    return {
        "semantic_score": semantic_score,
        "keyword_score": keyword_score,
        "grammar_score": grammar_score,
        "final_score": final_score,
        "feedback_text": "Quick evaluation based on heuristics.",
        "used_llm": False
    }

def score_answer_text(answer_text: str, question_text: str, ideal_answer_text: str = None, ideal_keywords: list = None):
    print(f"Scoring answer for question: {question_text}") # DEBUG

    # Use quick scoring heuristics if keyword_score would be high
    quick_score = _quick_score_answer(answer_text, question_text, ideal_keywords)

    # Use LLM only if keyword score is borderline (40-80)
    if quick_score["keyword_score"] < 40 or quick_score["keyword_score"] > 80:
        print(f"Using quick scoring (keyword_score: {quick_score['keyword_score']})") # DEBUG
        return quick_score

    print(f"Using LLM scoring (keyword_score borderline: {quick_score['keyword_score']})") # DEBUG

    try:
        completion = client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": """Evaluate answer accuracy and relevance (0-100).
                    Return JSON: {semantic_score, keyword_score, grammar_score, final_score (50% semantic, 30% keyword, 20% grammar), feedback_text (1 sentence max)}"""
                },
                {
                    "role": "user",
                    "content": f"""Q: {question_text}
                    Ideal: {ideal_answer_text or "Infer from question"}
                    Keywords: {ideal_keywords}
                    Answer: {answer_text}"""
                }
            ],
            model="llama-3.3-70b-versatile",
            temperature=0,
            response_format={"type": "json_object"}
        )

        result = json.loads(completion.choices[0].message.content)
        result["used_llm"] = True
        return result

    except Exception as e:
        print(f"Error calling Groq: {e}")
        return quick_score  # Fallback to quick scoring
