import json
import os
import re
from typing import Dict, Any, List
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))


def _fallback_challenge(topics: List[str], mentioned_skills: List[str]) -> Dict[str, Any]:
    topic_hint = (topics[0] if topics else (mentioned_skills[0] if mentioned_skills else "Arrays"))
    return {
        "id": f"dynamic-{re.sub(r'[^a-z0-9]+', '-', topic_hint.lower())}",
        "title": f"{topic_hint} - Pair Sum Exists",
        "prompt": """Given an array of integers and a target value, return YES if any two numbers add up to the target, otherwise return NO.

Input format:
- Line 1: n (array size)
- Line 2: n space-separated integers
- Line 3: target

Output format:
- Print YES or NO""",
        "languages": ["python", "javascript", "cpp", "java"],
        "starter_code": {
            "python": "def solve():\n    n=int(input().strip())\n    nums=list(map(int,input().split()))\n    target=int(input().strip())\n    # TODO\n    print('NO')\n\nif __name__=='__main__':\n    solve()\n",
            "javascript": "function solve(){\n  const fs=require('fs');\n  const lines=fs.readFileSync(0,'utf8').trim().split(/\\n/);\n  const n=Number(lines[0].trim());\n  const nums=lines[1].trim().split(/\\s+/).slice(0,n).map(Number);\n  const target=Number(lines[2].trim());\n  // TODO\n  console.log('NO');\n}\nsolve();\n",
            "cpp": "#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n  ios::sync_with_stdio(false);cin.tie(nullptr);\n  int n;cin>>n;vector<int> a(n);for(int i=0;i<n;i++)cin>>a[i];int target;cin>>target;\n  // TODO\n  cout<<\"NO\\n\";\n  return 0;\n}\n",
            "java": "import java.io.*;import java.util.*;\npublic class Main{\n  public static void main(String[] args) throws Exception{\n    BufferedReader br=new BufferedReader(new InputStreamReader(System.in));\n    int n=Integer.parseInt(br.readLine().trim());\n    String[] p=br.readLine().trim().split(\"\\\\s+\");\n    int[] a=new int[n];for(int i=0;i<n;i++)a[i]=Integer.parseInt(p[i]);\n    int target=Integer.parseInt(br.readLine().trim());\n    // TODO\n    System.out.println(\"NO\");\n  }\n}\n"
        },
        "visible_tests": [
            {"input": "5\n1 4 6 2 9\n8\n", "expected": "YES"},
            {"input": "4\n1 2 3 9\n8\n", "expected": "NO"}
        ],
        "hidden_tests": [
            {"input": "6\n10 -2 3 7 5 1\n8\n", "expected": "YES"},
            {"input": "3\n5 5 5\n11\n", "expected": "NO"}
        ]
    }


def _fallback_sql_challenge(topics: List[str], mentioned_skills: List[str]) -> Dict[str, Any]:
    return {
        "id": "dynamic-sql-top-customers",
        "title": "SQL - Top 2 Customers by Spend",
        "prompt": """You are given two tables:
- customers(id INTEGER PRIMARY KEY, name TEXT)
- orders(id INTEGER PRIMARY KEY, customer_id INTEGER, amount REAL)

Write a SQL query that returns top 2 customers by total order amount.
Output columns:
1) name
2) total_spend

Sort by total_spend DESC, then name ASC.
Return exactly 2 rows.""",
        "languages": ["sql"],
        "starter_code": {
            "sql": "SELECT c.name, SUM(o.amount) AS total_spend\nFROM customers c\nJOIN orders o ON o.customer_id = c.id\nGROUP BY c.id, c.name\nORDER BY total_spend DESC, c.name ASC\nLIMIT 2;"
        },
        "visible_tests": [
            {
                "input": "CREATE TABLE customers(id INTEGER PRIMARY KEY, name TEXT);\nCREATE TABLE orders(id INTEGER PRIMARY KEY, customer_id INTEGER, amount REAL);\nINSERT INTO customers VALUES (1,'Alice'),(2,'Bob'),(3,'Charlie');\nINSERT INTO orders VALUES (1,1,150.0),(2,1,100.0),(3,2,400.0),(4,3,50.0),(5,2,10.0);",
                "expected": "[[\"Bob\",410.0],[\"Alice\",250.0]]"
            },
            {
                "input": "CREATE TABLE customers(id INTEGER PRIMARY KEY, name TEXT);\nCREATE TABLE orders(id INTEGER PRIMARY KEY, customer_id INTEGER, amount REAL);\nINSERT INTO customers VALUES (1,'Zara'),(2,'Mohan'),(3,'Anita');\nINSERT INTO orders VALUES (1,1,200.0),(2,2,300.0),(3,3,300.0),(4,1,50.0);",
                "expected": "[[\"Anita\",300.0],[\"Mohan\",300.0]]"
            }
        ],
        "hidden_tests": [
            {
                "input": "CREATE TABLE customers(id INTEGER PRIMARY KEY, name TEXT);\nCREATE TABLE orders(id INTEGER PRIMARY KEY, customer_id INTEGER, amount REAL);\nINSERT INTO customers VALUES (1,'Ravi'),(2,'Neha'),(3,'Ishaan');\nINSERT INTO orders VALUES (1,1,10.0),(2,1,90.0),(3,2,60.0),(4,2,60.0),(5,3,50.0);",
                "expected": "[[\"Neha\",120.0],[\"Ravi\",100.0]]"
            },
            {
                "input": "CREATE TABLE customers(id INTEGER PRIMARY KEY, name TEXT);\nCREATE TABLE orders(id INTEGER PRIMARY KEY, customer_id INTEGER, amount REAL);\nINSERT INTO customers VALUES (1,'A'),(2,'B'),(3,'C');\nINSERT INTO orders VALUES (1,1,1.0),(2,2,1.0),(3,3,1.0),(4,1,1.0);",
                "expected": "[[\"A\",2.0],[\"B\",1.0]]"
            }
        ]
    }


def generate_personalized_coding_challenge(payload: Dict[str, Any]) -> Dict[str, Any]:
    resume_text = payload.get("resume_text") or ""
    topics = payload.get("topics") or []
    mentioned_skills = payload.get("mentioned_skills") or []
    user_summary = payload.get("user_summary") or ""
    round_no = payload.get("round", 1)
    lower_topics = " ".join([str(t).lower() for t in topics])
    lower_skills = " ".join([str(s).lower() for s in mentioned_skills])
    sql_needed = any(k in lower_topics for k in ["sql", "database", "postgres", "mysql"]) or any(
        k in lower_skills for k in ["sql", "database", "postgres", "mysql"]
    )

    if sql_needed:
        return _fallback_sql_challenge(topics, mentioned_skills)
    try:
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            temperature=0.4,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": """You are generating a personalized coding interview challenge.
Return ONLY valid JSON with this schema:
{
  "id": "short-id",
  "title": "string",
  "prompt": "clear console-input coding problem statement",
  "languages": ["python","javascript","cpp","java","sql"],
  "starter_code": {
    "python": "...",
    "javascript": "...",
    "cpp": "...",
    "java": "...",
    "sql": "..."
  },
  "visible_tests": [{"input":"...","expected":"..."}],
  "hidden_tests": [{"input":"...","expected":"..."}]
}
Rules:
- If candidate context is SQL/database-heavy, SQL challenge is allowed.
- Otherwise prefer DSA-style console coding tasks.
- Problem must be executable as a console program in all listed languages.
- Keep prompt concise and interview-ready.
- Make challenge relevant to candidate topics/skills.
- Use 2 visible + 2 hidden tests.
- No markdown fences.
"""
                },
                {
                    "role": "user",
                    "content": f"""Generate round {round_no} coding challenge.
Topics: {topics}
Mentioned Skills: {mentioned_skills}
User Summary: {user_summary}
Resume excerpt: {resume_text[:1400]}
"""
                }
            ]
        )

        parsed = json.loads(completion.choices[0].message.content)
        required_keys = ["id", "title", "prompt", "languages", "starter_code", "visible_tests", "hidden_tests"]
        if not all(k in parsed for k in required_keys):
            raise ValueError("Model output missing required keys")
        return parsed
    except Exception as e:
        print(f"Error generating personalized coding challenge: {e}")
        return _fallback_challenge(topics, mentioned_skills)
