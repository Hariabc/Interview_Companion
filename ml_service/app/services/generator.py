import os
import json
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(
    api_key=os.environ.get("GROQ_API_KEY"),
)

# Debug: Check if API key is loaded
if not os.environ.get("GROQ_API_KEY"):
    print("WARNING: GROQ_API_KEY is not set in environment variables.")
else:
    print(f"GROQ_API_KEY loaded: {os.environ.get('GROQ_API_KEY')[:5]}...")

def generate_interview_questions(resume_text: str, topics: list[str], count: int = 3):
    print(f"Generating questions for topics: {topics}") # DEBUG
    try:
        completion = client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": """You are an expert technical interviewer. 
                    Generate technical interview questions based on the candidate's resume and selected topics.
                    
                    Return ONLY valid JSON in the following format:
                    {
                        "questions": [
                            {
                                "question_text": "...",
                                "topic": "...",
                                "difficulty_level": 1-5,
                                "ideal_answer_keywords": ["..."],
                                "ideal_answer_text": "..."
                            }
                        ]
                    }
                    """
                },
                {
                    "role": "user",
                    "content": f"""
                    Resume Content: {resume_text[:2000]} (truncated)
                    
                    Selected Topics: {', '.join(topics)}
                    
                    Generate {count} distinct technical questions. 
                    Make sure they are relevant to the resume skills but focused on the selected topics.
                    """
                }
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.7,
            response_format={"type": "json_object"}
        )
        
        result = json.loads(completion.choices[0].message.content)
        questions = result.get("questions", [])
        print(f"Generated {len(questions)} questions.") # DEBUG
        return questions

    except Exception as e:
        print(f"Error generating questions: {e}")
        return [{"error": str(e)}]
