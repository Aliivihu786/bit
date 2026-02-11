import { readFile, writeFile, access } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

const execAsync = promisify(exec);

/**
 * Automatically analyze codebase and generate/update AGENTS.md
 * Runs on server startup to keep documentation synchronized
 */
export async function initializeCodebase() {
  console.log('\n🚀 [AUTO-INIT] Starting codebase analysis...');

  try {
    const rootDir = process.cwd();
    const agentsPath = join(rootDir, 'AGENTS.md');

    // Check if AGENTS.md exists and is recent (< 1 day old)
    try {
      const stats = await access(agentsPath).then(() => true).catch(() => false);
      if (stats) {
        console.log('✓ [AUTO-INIT] AGENTS.md exists - skipping regeneration');
        console.log('  (Delete AGENTS.md to force regeneration)\n');
        return;
      }
    } catch {
      // File doesn't exist, continue with generation
    }

    console.log('📦 [AUTO-INIT] Analyzing package.json...');
    const packageJson = JSON.parse(await readFile(join(rootDir, 'package.json'), 'utf-8'));

    console.log('📂 [AUTO-INIT] Scanning project structure...');
    const { stdout: fileTree } = await execAsync(
      'find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" -not -path "*/build/*" -not -path "*/.next/*" | head -150',
      { cwd: rootDir }
    );

    console.log('🔍 [AUTO-INIT] Detecting code patterns...');

    // Analyze source files
    const files = fileTree.split('\n').filter(Boolean);
    const jsFiles = files.filter(f => f.match(/\.(js|jsx|ts|tsx)$/));
    const configFiles = files.filter(f => f.match(/\.(json|config\.(js|ts)|rc)$/));

    // Sample a few source files to detect patterns
    let usesTypeScript = false;
    let usesReact = false;
    let usesES6 = false;
    let usesCommonJS = false;

    for (const file of jsFiles.slice(0, 5)) {
      try {
        const content = await readFile(join(rootDir, file), 'utf-8');
        if (file.endsWith('.ts') || file.endsWith('.tsx')) usesTypeScript = true;
        if (content.includes('import React') || content.includes('from \'react\'')) usesReact = true;
        if (content.includes('import ') || content.includes('export ')) usesES6 = true;
        if (content.includes('require(') || content.includes('module.exports')) usesCommonJS = true;
      } catch {
        // Skip files we can't read
      }
    }

    // Detect framework
    let framework = 'Node.js';
    if (packageJson.dependencies?.react) framework = 'React';
    if (packageJson.dependencies?.vue) framework = 'Vue';
    if (packageJson.dependencies?.next) framework = 'Next.js';
    if (packageJson.dependencies?.express) framework = framework === 'React' ? 'React + Express' : 'Express';

    // Build tech stack
    const techStack = [];
    if (usesTypeScript) techStack.push('TypeScript');
    else techStack.push('JavaScript');

    if (framework) techStack.push(framework);

    if (packageJson.dependencies?.vite || packageJson.devDependencies?.vite) techStack.push('Vite');
    if (packageJson.dependencies?.webpack || packageJson.devDependencies?.webpack) techStack.push('Webpack');
    if (packageJson.dependencies?.tailwindcss) techStack.push('Tailwind CSS');

    // Key dependencies
    const keyDeps = Object.entries(packageJson.dependencies || {})
      .filter(([name]) => !name.startsWith('@types/'))
      .slice(0, 15)
      .map(([name, version]) => `- **${name}** (${version})`)
      .join('\n');

    const devDeps = Object.entries(packageJson.devDependencies || {})
      .filter(([name]) => !name.startsWith('@types/'))
      .slice(0, 10)
      .map(([name, version]) => `- **${name}** (${version})`)
      .join('\n');

    // Available scripts
    const scripts = Object.entries(packageJson.scripts || {})
      .map(([name, cmd]) => `- \`npm run ${name}\` - ${cmd}`)
      .join('\n');

    // Generate directory structure (simplified)
    const dirStructure = await generateDirStructure(files);

    console.log('✍️  [AUTO-INIT] Generating AGENTS.md...');

    const agentsMd = `# Project Documentation

> Auto-generated on ${new Date().toISOString().split('T')[0]}

## Project Overview

**Name:** ${packageJson.name || 'Unknown'}
**Description:** ${packageJson.description || 'No description'}
**Version:** ${packageJson.version || '0.0.0'}

## Tech Stack

### Core Technologies
${techStack.map(t => `- ${t}`).join('\n')}

### Module System
- **ES6 Modules:** ${usesES6 ? '✓ Yes' : '✗ No'}
- **CommonJS:** ${usesCommonJS ? '✓ Yes' : '✗ No'}

## Project Structure

\`\`\`
${dirStructure}
\`\`\`

## Dependencies

### Production Dependencies
${keyDeps || '(none)'}

### Development Dependencies
${devDeps || '(none)'}

## Available Scripts

${scripts || '(none)'}

## Coding Conventions

### File Organization
- Source files located in: \`${detectSourceDir(files)}\`
- Configuration files in project root
- ${usesTypeScript ? 'TypeScript files use .ts/.tsx extensions' : 'JavaScript files use .js/.jsx extensions'}

### Code Style
- **Language:** ${usesTypeScript ? 'TypeScript' : 'JavaScript'}
- **Module System:** ${usesES6 ? 'ES6 Modules (import/export)' : 'CommonJS (require/module.exports)'}
- **Framework:** ${framework}

## Configuration Files

${configFiles.slice(0, 10).map(f => `- \`${f}\``).join('\n') || '(none detected)'}

---

*Auto-generated by Bit Agent initialization. This file is regenerated on server startup if deleted.*
`;

    await writeFile(agentsPath, agentsMd, 'utf-8');
    console.log('✅ [AUTO-INIT] AGENTS.md created successfully!\n');

  } catch (err) {
    console.error('❌ [AUTO-INIT] Failed to initialize codebase:', err.message);
    console.error('  Continuing without AGENTS.md...\n');
  }
}

/**
 * Generate simplified directory structure
 */
function generateDirStructure(files) {
  const tree = {};

  files.slice(0, 100).forEach(file => {
    const parts = file.replace(/^\.\//, '').split('/');
    let current = tree;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) {
        // File
        if (!current.__files) current.__files = [];
        current.__files.push(part);
      } else {
        // Directory
        if (!current[part]) current[part] = {};
        current = current[part];
      }
    });
  });

  // Convert to string representation
  function treeToString(obj, indent = '') {
    let result = '';
    const dirs = Object.keys(obj).filter(k => k !== '__files').sort();
    const files = obj.__files || [];

    dirs.forEach((dir, i) => {
      const isLast = i === dirs.length - 1 && files.length === 0;
      result += `${indent}${isLast ? '└── ' : '├── '}${dir}/\n`;
      result += treeToString(obj[dir], indent + (isLast ? '    ' : '│   '));
    });

    files.slice(0, 5).forEach((file, i) => {
      const isLast = i === files.length - 1 || i === 4;
      result += `${indent}${isLast ? '└── ' : '├── '}${file}\n`;
    });

    if (files.length > 5) {
      result += `${indent}└── ... (${files.length - 5} more files)\n`;
    }

    return result;
  }

  return treeToString(tree);
}

/**
 * Detect the main source directory
 */
function detectSourceDir(files) {
  const srcDirs = files
    .filter(f => f.match(/\/(src|lib|app|pages)\//))
    .map(f => f.split('/')[1])
    .filter(Boolean);

  const counts = {};
  srcDirs.forEach(d => counts[d] = (counts[d] || 0) + 1);

  const mostCommon = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return mostCommon ? mostCommon[0] : 'src';
}
