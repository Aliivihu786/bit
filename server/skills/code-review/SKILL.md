---
name: code-review
description: "Comprehensive code review with security, performance, and best practices analysis"
emoji: "👀"
requires:
  bins: []
  env: []
---

# Code Review Skill

This skill enables thorough code review with focus on security, performance, and best practices.

## When to Use

Use this skill when asked to:
- Review code for issues
- Audit code security
- Analyze performance
- Check best practices compliance
- Suggest improvements

## Review Checklist

### Security
- [ ] Input validation
- [ ] SQL injection prevention
- [ ] XSS prevention
- [ ] Authentication/authorization checks
- [ ] Sensitive data exposure
- [ ] Dependency vulnerabilities

### Performance
- [ ] N+1 queries
- [ ] Memory leaks
- [ ] Unnecessary re-renders (React)
- [ ] Large bundle sizes
- [ ] Caching opportunities

### Code Quality
- [ ] DRY principle
- [ ] Single responsibility
- [ ] Error handling
- [ ] Type safety
- [ ] Documentation

## Output Format

```markdown
## Code Review: [filename]

### 🔴 Critical Issues
- Issue description
  - Location: line X
  - Fix: suggested solution

### 🟡 Warnings
- Warning description

### 🟢 Suggestions
- Improvement idea

### Summary
Overall assessment and priority items.
```
