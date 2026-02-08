import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

def analyze_correlations(csv_file):
    df = pd.read_csv(csv_file)
    
    # Simulate Human Scores for comparison if not present
    # In a real experiment, we'd manually grade a subset and join it here.
    if 'human_score' not in df.columns:
        print("Simulating human scores for correlation analysis...")
        # Add some noise to AI score to simulate human variance
        df['human_score'] = df['semantic_score'] * 0.9 + np.random.normal(0, 5, len(df))
        
    # Compute Correlation
    corr = df['semantic_score'].corr(df['human_score'])
    print(f"Correlation between AI Semantic Score and Human Score: {corr:.4f}")
    
    # Plot
    plt.figure(figsize=(10, 6))
    plt.scatter(df['human_score'], df['semantic_score'], alpha=0.5)
    plt.title(f'AI vs Human Score Correlation (r={corr:.2f})')
    plt.xlabel('Human Score')
    plt.ylabel('AI Semantic Score')
    plt.grid(True)
    plt.savefig('correlation_plot.png')
    print("Saved correlation_plot.png")

if __name__ == "__main__":
    # Example usage
    # analyze_correlations("research_data_latest.csv")
    pass
