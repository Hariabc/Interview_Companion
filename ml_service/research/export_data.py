import os
import psycopg2
import pandas as pd
from datetime import datetime

# DB Connection (Use ENV variables in production)
DB_URL = os.getenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/postgres")

def export_research_data():
    try:
        conn = psycopg2.connect(DB_URL)
        
        # Query: Fetch metrics for user who gave consent
        query = """
        SELECT 
            s.id as session_id,
            s.user_id,
            s.total_score,
            s.difficulty_level,
            a.id as answer_id,
            sc.semantic_score,
            sc.grammar_score,
            sc.keyword_score,
            cm.wpm,
            cm.filler_word_count,
            c.consent_given,
            s.created_at
        FROM interview_sessions s
        JOIN answers a ON s.id = a.session_id
        LEFT JOIN ai_scores sc ON a.id = sc.answer_id
        LEFT JOIN confidence_metrics cm ON a.id = cm.answer_id
        JOIN consents c ON s.user_id = c.user_id
        WHERE c.consent_given = TRUE
        """
        
        df = pd.read_sql_query(query, conn)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"research_data_{timestamp}.csv"
        df.to_csv(filename, index=False)
        print(f"Exported {len(df)} rows to {filename}")
        
    except Exception as e:
        print(f"Error exporting data: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    export_research_data()
