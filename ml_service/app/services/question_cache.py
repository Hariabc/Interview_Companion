import hashlib
import json
import time
from typing import Dict, List, Optional
from datetime import datetime, timedelta

class QuestionCache:
    """In-memory cache for generated questions with TTL expiration."""

    def __init__(self, ttl_hours: int = 24):
        self.cache: Dict[str, Dict] = {}
        self.ttl_seconds = ttl_hours * 3600

    def _generate_key(self, topics: List[str], difficulty: int, experience_level: str, interview_mode: str) -> str:
        """Generate cache key from parameters."""
        key_data = f"{','.join(sorted(topics))}_{difficulty}_{experience_level}_{interview_mode}"
        return hashlib.md5(key_data.encode()).hexdigest()

    def _is_expired(self, timestamp: float) -> bool:
        """Check if cache entry has expired."""
        return time.time() - timestamp > self.ttl_seconds

    def get(self, topics: List[str], difficulty: int, experience_level: str, interview_mode: str) -> Optional[List[Dict]]:
        """Retrieve cached questions if available and not expired."""
        key = self._generate_key(topics, difficulty, experience_level, interview_mode)

        if key not in self.cache:
            return None

        cached_data = self.cache[key]

        if self._is_expired(cached_data["timestamp"]):
            del self.cache[key]
            return None

        return cached_data["questions"]

    def set(self, questions: List[Dict], topics: List[str], difficulty: int, experience_level: str, interview_mode: str) -> None:
        """Store questions in cache."""
        key = self._generate_key(topics, difficulty, experience_level, interview_mode)

        self.cache[key] = {
            "questions": questions,
            "timestamp": time.time(),
            "topics": topics,
            "difficulty": difficulty,
            "experience_level": experience_level,
            "interview_mode": interview_mode
        }

    def clear(self) -> None:
        """Clear all cached questions."""
        self.cache.clear()

    def get_stats(self) -> Dict:
        """Get cache statistics."""
        total_entries = len(self.cache)
        expired_entries = sum(1 for v in self.cache.values() if self._is_expired(v["timestamp"]))
        active_entries = total_entries - expired_entries

        return {
            "total_entries": total_entries,
            "active_entries": active_entries,
            "expired_entries": expired_entries,
            "cache_size_bytes": len(json.dumps(self.cache))
        }

# Global cache instance
_question_cache = QuestionCache()

def get_cached_questions(topics: List[str], difficulty: int, experience_level: str, interview_mode: str = "balanced") -> Optional[List[Dict]]:
    """Get cached questions."""
    return _question_cache.get(topics, difficulty, experience_level, interview_mode)

def cache_questions(questions: List[Dict], topics: List[str], difficulty: int, experience_level: str, interview_mode: str = "balanced") -> None:
    """Cache generated questions."""
    _question_cache.set(questions, topics, difficulty, experience_level, interview_mode)

def clear_cache() -> None:
    """Clear all cached questions."""
    _question_cache.clear()

def get_cache_stats() -> Dict:
    """Get cache statistics."""
    return _question_cache.get_stats()
