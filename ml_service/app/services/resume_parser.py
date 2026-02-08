from pdfminer.high_level import extract_text
import spacy
import re

nlp = spacy.load("en_core_web_sm")

def parse_resume_pdf(file_path: str):
    text = extract_text(file_path)
    doc = nlp(text)
    
    # Basic Skill Extraction (Heuristic/NER)
    # In a real system, you'd use a fine-tuned NER model or a large skills database.
    # Here we look for capitalized technical terms or known keywords.
    
    known_skills = {
        "python", "java", "javascript", "typescript", "react", "node.js", 
        "sql", "nosql", "docker", "kubernetes", "aws", "azure", "machine learning",
        "deep learning", "pytorch", "tensorflow", "git", "ci/cd"
    }
    
    found_skills = set()
    
    # check for exact matches
    tokens = [t.text.lower() for t in doc]
    for skill in known_skills:
        if skill in tokens:
            found_skills.add(skill)
            
    # Also check specific patterns if needed
    
    return list(found_skills), text
