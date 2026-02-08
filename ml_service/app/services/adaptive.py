def suggest_next_difficulty(current_difficulty: int, last_score: float):
    # Simple ELO-like adjustment
    # Score is 0-100
    
    next_difficulty = current_difficulty
    
    if last_score > 80:
        next_difficulty += 1
    elif last_score < 50:
        next_difficulty -= 1
        
    # Clamp between 1 and 5
    return max(1, min(5, next_difficulty))
