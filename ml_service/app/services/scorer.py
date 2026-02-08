import os
import json
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(
    api_key=os.environ.get("GROQ_API_KEY"),
)

def score_answer_text(answer_text: str, question_text: str, ideal_answer_text: str = None, ideal_keywords: list = None):
    print(f"Scoring answer for question: {question_text}") # DEBUG
    print(f"Ideal Answer: {ideal_answer_text[:50]}...") # DEBUG
    
    try:
        completion = client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": """You are an expert technical interviewer. Evaluate the candidate's answer based on the question and the ideal answer (if provided).
                    
                    Return ONLY valid JSON with the following fields:
                    - semantic_score (0-100): How relevant and accurate the answer is.
                    - keyword_score (0-100): How well it covers key concepts (even if specific keywords are different).
                    - grammar_score (0-100): Clarity and structure of the answer.
                    - final_score (0-100): Weighted metrics.
                    - feedback_text: Constructive feedback (2-3 sentences max).
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
