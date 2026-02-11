import fs from 'fs';
import path from 'path';

const REQUIRED_FILES = [
  'bit.md',
  path.join('tasks', 'todo.md'),
  path.join('tasks', 'lessons.md'),
];

const REQUIRED_CLAUDE_HEADINGS = [
  'Operating Principles',
  'Workflow Orchestration',
  'Task Management',
  'Communication Guidelines',
  'Definition of Done',
];

const errors = [];

for (const file of REQUIRED_FILES) {
  if (!fs.existsSync(file)) {
    errors.push(`Missing required file: ${file}`);
  }
}

if (fs.existsSync('bit.md')) {
  const claude = fs.readFileSync('bit.md', 'utf8');
  for (const heading of REQUIRED_CLAUDE_HEADINGS) {
    if (!claude.includes(heading)) {
      errors.push(`bit.md missing heading: ${heading}`);
    }
  }
}

if (fs.existsSync(path.join('tasks', 'todo.md'))) {
  const todo = fs.readFileSync(path.join('tasks', 'todo.md'), 'utf8');
  if (!todo.includes('# Todo')) {
    errors.push('tasks/todo.md missing "# Todo" heading.');
  }
}

if (fs.existsSync(path.join('tasks', 'lessons.md'))) {
  const lessons = fs.readFileSync(path.join('tasks', 'lessons.md'), 'utf8');
  if (!lessons.includes('# Lessons')) {
    errors.push('tasks/lessons.md missing "# Lessons" heading.');
  }
}

if (errors.length > 0) {
  console.error('Agent guideline checks failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Agent guideline checks passed.');
