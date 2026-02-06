---
name: data-analysis
description: "Data analysis with Python, statistics, and visualization"
emoji: "📊"
requires:
  bins: []
  env: []
---

# Data Analysis Skill

This skill enables comprehensive data analysis using Python with pandas, statistics, and visualization.

## When to Use

Use this skill when asked to:
- Analyze datasets (CSV, JSON, etc.)
- Generate statistics and insights
- Create visualizations
- Clean and transform data
- Build reports from data

## Analysis Workflow

1. **Load Data**: Read the dataset using pandas
2. **Explore**: Check shape, dtypes, missing values
3. **Clean**: Handle missing data, outliers
4. **Analyze**: Calculate statistics, find patterns
5. **Visualize**: Create charts using matplotlib/seaborn
6. **Report**: Summarize findings

## Python Libraries

```python
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from scipy import stats
```

## Common Operations

### Load and Explore
```python
df = pd.read_csv('data.csv')
print(df.info())
print(df.describe())
print(df.isnull().sum())
```

### Visualization
```python
# Distribution
plt.figure(figsize=(10, 6))
sns.histplot(df['column'], kde=True)
plt.savefig('distribution.png')

# Correlation
sns.heatmap(df.corr(), annot=True)
plt.savefig('correlation.png')
```

## Output Format

```markdown
## Data Analysis Report

### Dataset Overview
- Rows: X
- Columns: Y
- Missing values: Z

### Key Statistics
| Metric | Value |
|--------|-------|
| Mean   | X     |
| Median | Y     |

### Insights
1. Finding 1
2. Finding 2

### Visualizations
[Include saved chart files]
```
