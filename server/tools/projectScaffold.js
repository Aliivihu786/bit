import { BaseTool } from './baseTool.js';
import { devServerManager } from '../agent/devServerManager.js';

const WORKSPACE_ROOT = '/home/user/workspace';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

const PACKAGE_MANAGERS = {
  npm: {
    exec: (pkg) => `npm_config_yes=true npx --yes ${pkg}`,
    install: () => 'npm install',
    run: (script) => `npm run ${script}`,
  },
  pnpm: {
    exec: (pkg) => `pnpm dlx ${pkg}`,
    install: () => 'pnpm install',
    run: (script) => `pnpm ${script}`,
  },
  yarn: {
    exec: (pkg) => `yarn dlx ${pkg}`,
    install: () => 'yarn install',
    run: (script) => `yarn ${script}`,
  },
  bun: {
    exec: (pkg) => `bunx ${pkg}`,
    install: () => 'bun install',
    run: (script) => `bun run ${script}`,
  },
};

const DEFAULT_ALLOWED_HOSTS = "['.e2b.app', 'localhost', '127.0.0.1']";

function patchViteAllowedHosts(content) {
  if (!content) return content;

  if (content.includes('allowedHosts: \'all\'') || content.includes('allowedHosts: "all"')) {
    return content
      .replace("allowedHosts: 'all'", `allowedHosts: ${DEFAULT_ALLOWED_HOSTS}`)
      .replace('allowedHosts: "all"', `allowedHosts: ${DEFAULT_ALLOWED_HOSTS}`);
  }

  if (content.includes('allowedHosts')) return content;

  const serverBlock = /server\s*:\s*{/;
  if (serverBlock.test(content)) {
    return content.replace(serverBlock, (match) => `${match}\n    allowedHosts: ${DEFAULT_ALLOWED_HOSTS},`);
  }

  const defineConfig = /defineConfig\s*\(\s*{/;
  if (defineConfig.test(content)) {
    return content.replace(defineConfig, (match) => `${match}\n  server: {\n    allowedHosts: ${DEFAULT_ALLOWED_HOSTS},\n  },`);
  }

  return content;
}

async function ensureViteAllowedHosts(sandbox, baseDir) {
  const candidates = [
    `${baseDir}/vite.config.ts`,
    `${baseDir}/vite.config.js`,
    `${baseDir}/vite.config.mjs`,
    `${baseDir}/vite.config.cjs`,
  ];

  for (const configPath of candidates) {
    try {
      const current = await sandbox.files.read(configPath);
      const patched = patchViteAllowedHosts(current);
      if (patched !== current) {
        await sandbox.files.write(configPath, patched);
        return configPath;
      }
      return configPath;
    } catch {
      // try next
    }
  }
  return null;
}

const FRAMEWORK_RECIPES = [
  {
    id: 'react-vite',
    label: 'React (Vite)',
    stack: 'frontend',
    languages: ['js', 'ts'],
    createPlan: ({ name, pm, language, install }) => {
      const template = language === 'ts' ? 'react-ts' : 'react';
      const devCmd = `${pm.run('dev')} -- --host 0.0.0.0 --port 5173`;
      return {
        commands: [
          { cmd: `${pm.exec('create-vite@latest')} ${name} --template ${template}`, cwd: WORKSPACE_ROOT },
          ...(install ? [{ cmd: pm.install(), cwd: `${WORKSPACE_ROOT}/${name}` }] : []),
        ],
        preview: {
          cwd: `${WORKSPACE_ROOT}/${name}`,
          dir: `${name}/dist`,
          buildCmd: pm.run('build'),
        },
        livePreview: {
          cwd: `${WORKSPACE_ROOT}/${name}`,
          command: devCmd,
          port: 5173,
        },
        devCommand: devCmd,
        viteConfigDir: `${WORKSPACE_ROOT}/${name}`,
        nextSteps: [
          `cd ${name}`,
          install ? '' : pm.install(),
          devCmd,
        ].filter(Boolean),
      };
    },
  },
  {
    id: 'vue-vite',
    label: 'Vue (Vite)',
    stack: 'frontend',
    languages: ['js', 'ts'],
    createPlan: ({ name, pm, language, install }) => {
      const template = language === 'ts' ? 'vue-ts' : 'vue';
      const devCmd = `${pm.run('dev')} -- --host 0.0.0.0 --port 5173`;
      return {
        commands: [
          { cmd: `${pm.exec('create-vite@latest')} ${name} --template ${template}`, cwd: WORKSPACE_ROOT },
          ...(install ? [{ cmd: pm.install(), cwd: `${WORKSPACE_ROOT}/${name}` }] : []),
        ],
        preview: {
          cwd: `${WORKSPACE_ROOT}/${name}`,
          dir: `${name}/dist`,
          buildCmd: pm.run('build'),
        },
        livePreview: {
          cwd: `${WORKSPACE_ROOT}/${name}`,
          command: devCmd,
          port: 5173,
        },
        devCommand: devCmd,
        viteConfigDir: `${WORKSPACE_ROOT}/${name}`,
        nextSteps: [
          `cd ${name}`,
          install ? '' : pm.install(),
          devCmd,
        ].filter(Boolean),
      };
    },
  },
  {
    id: 'svelte-vite',
    label: 'Svelte (Vite)',
    stack: 'frontend',
    languages: ['js', 'ts'],
    createPlan: ({ name, pm, language, install }) => {
      const template = language === 'ts' ? 'svelte-ts' : 'svelte';
      const devCmd = `${pm.run('dev')} -- --host 0.0.0.0 --port 5173`;
      return {
        commands: [
          { cmd: `${pm.exec('create-vite@latest')} ${name} --template ${template}`, cwd: WORKSPACE_ROOT },
          ...(install ? [{ cmd: pm.install(), cwd: `${WORKSPACE_ROOT}/${name}` }] : []),
        ],
        preview: {
          cwd: `${WORKSPACE_ROOT}/${name}`,
          dir: `${name}/dist`,
          buildCmd: pm.run('build'),
        },
        livePreview: {
          cwd: `${WORKSPACE_ROOT}/${name}`,
          command: devCmd,
          port: 5173,
        },
        devCommand: devCmd,
        viteConfigDir: `${WORKSPACE_ROOT}/${name}`,
        nextSteps: [
          `cd ${name}`,
          install ? '' : pm.install(),
          devCmd,
        ].filter(Boolean),
      };
    },
  },
  {
    id: 'solid-vite',
    label: 'Solid (Vite)',
    stack: 'frontend',
    languages: ['js', 'ts'],
    createPlan: ({ name, pm, language, install }) => {
      const template = language === 'ts' ? 'solid-ts' : 'solid';
      const devCmd = `${pm.run('dev')} -- --host 0.0.0.0 --port 5173`;
      return {
        commands: [
          { cmd: `${pm.exec('create-vite@latest')} ${name} --template ${template}`, cwd: WORKSPACE_ROOT },
          ...(install ? [{ cmd: pm.install(), cwd: `${WORKSPACE_ROOT}/${name}` }] : []),
        ],
        preview: {
          cwd: `${WORKSPACE_ROOT}/${name}`,
          dir: `${name}/dist`,
          buildCmd: pm.run('build'),
        },
        livePreview: {
          cwd: `${WORKSPACE_ROOT}/${name}`,
          command: devCmd,
          port: 5173,
        },
        devCommand: devCmd,
        viteConfigDir: `${WORKSPACE_ROOT}/${name}`,
        nextSteps: [
          `cd ${name}`,
          install ? '' : pm.install(),
          devCmd,
        ].filter(Boolean),
      };
    },
  },
  {
    id: 'preact-vite',
    label: 'Preact (Vite)',
    stack: 'frontend',
    languages: ['js', 'ts'],
    createPlan: ({ name, pm, language, install }) => {
      const template = language === 'ts' ? 'preact-ts' : 'preact';
      const devCmd = `${pm.run('dev')} -- --host 0.0.0.0 --port 5173`;
      return {
        commands: [
          { cmd: `${pm.exec('create-vite@latest')} ${name} --template ${template}`, cwd: WORKSPACE_ROOT },
          ...(install ? [{ cmd: pm.install(), cwd: `${WORKSPACE_ROOT}/${name}` }] : []),
        ],
        preview: {
          cwd: `${WORKSPACE_ROOT}/${name}`,
          dir: `${name}/dist`,
          buildCmd: pm.run('build'),
        },
        livePreview: {
          cwd: `${WORKSPACE_ROOT}/${name}`,
          command: devCmd,
          port: 5173,
        },
        devCommand: devCmd,
        viteConfigDir: `${WORKSPACE_ROOT}/${name}`,
        nextSteps: [
          `cd ${name}`,
          install ? '' : pm.install(),
          devCmd,
        ].filter(Boolean),
      };
    },
  },
  {
    id: 'vanilla-vite',
    label: 'Vanilla (Vite)',
    stack: 'frontend',
    languages: ['js', 'ts'],
    createPlan: ({ name, pm, language, install }) => {
      const template = language === 'ts' ? 'vanilla-ts' : 'vanilla';
      const devCmd = `${pm.run('dev')} -- --host 0.0.0.0 --port 5173`;
      return {
        commands: [
          { cmd: `${pm.exec('create-vite@latest')} ${name} --template ${template}`, cwd: WORKSPACE_ROOT },
          ...(install ? [{ cmd: pm.install(), cwd: `${WORKSPACE_ROOT}/${name}` }] : []),
        ],
        preview: {
          cwd: `${WORKSPACE_ROOT}/${name}`,
          dir: `${name}/dist`,
          buildCmd: pm.run('build'),
        },
        livePreview: {
          cwd: `${WORKSPACE_ROOT}/${name}`,
          command: devCmd,
          port: 5173,
        },
        devCommand: devCmd,
        viteConfigDir: `${WORKSPACE_ROOT}/${name}`,
        nextSteps: [
          `cd ${name}`,
          install ? '' : pm.install(),
          devCmd,
        ].filter(Boolean),
      };
    },
  },
  {
    id: 'nextjs',
    label: 'Next.js (React)',
    stack: 'fullstack',
    languages: ['js', 'ts'],
    createPlan: ({ name, pm, language, install, packageManager }) => {
      const langFlag = language === 'ts' ? '--ts' : '--js';
      const devCmd = `${pm.run('dev')} -- --hostname 0.0.0.0 --port 3000`;
      const pmFlag = getNextPackageManagerFlag(packageManager);
      return {
        commands: [
          { cmd: `${pm.exec('create-next-app@latest')} ${name} ${langFlag} --yes ${pmFlag} --eslint --app --src-dir --no-tailwind --no-import-alias --skip-install`, cwd: WORKSPACE_ROOT },
          ...(install ? [{ cmd: pm.install(), cwd: `${WORKSPACE_ROOT}/${name}` }] : []),
        ],
        livePreview: {
          cwd: `${WORKSPACE_ROOT}/${name}`,
          command: devCmd,
          port: 3000,
        },
        devCommand: devCmd,
        nextSteps: [
          `cd ${name}`,
          install ? '' : pm.install(),
          devCmd,
        ].filter(Boolean),
      };
    },
  },
  {
    id: 'nuxt',
    label: 'Nuxt (Vue)',
    stack: 'fullstack',
    languages: ['js', 'ts'],
    createPlan: ({ name, pm, language, install }) => {
      const devCmd = `${pm.run('dev')} -- --host 0.0.0.0 --port 3000`;
      return {
        commands: [
          { cmd: `${pm.exec('nuxi')} init ${name}`, cwd: WORKSPACE_ROOT },
          ...(install ? [{ cmd: pm.install(), cwd: `${WORKSPACE_ROOT}/${name}` }] : []),
        ],
        livePreview: {
          cwd: `${WORKSPACE_ROOT}/${name}`,
          command: devCmd,
          port: 3000,
        },
        devCommand: devCmd,
        nextSteps: [
          `cd ${name}`,
          install ? '' : pm.install(),
          devCmd,
        ].filter(Boolean),
      };
    },
  },
  {
    id: 'express',
    label: 'Express (Node)',
    stack: 'backend',
    languages: ['js'],
    createPlan: ({ name, pm, install }) => {
      return {
        commands: [
          { cmd: `mkdir -p ${name}`, cwd: WORKSPACE_ROOT },
          { cmd: 'npm init -y', cwd: `${WORKSPACE_ROOT}/${name}` },
          ...(install ? [{ cmd: 'npm install express cors', cwd: `${WORKSPACE_ROOT}/${name}` }] : []),
        ],
        files: [
          {
            path: `${name}/index.js`,
            content: `const express = require('express');\nconst cors = require('cors');\n\nconst app = express();\napp.use(cors());\napp.use(express.json());\n\napp.get('/api/health', (req, res) => {\n  res.json({ ok: true, message: 'Hello from Express' });\n});\n\nconst port = Number(process.env.PORT || 4000);\nconst host = process.env.HOST || '0.0.0.0';\napp.listen(port, host, () => {\n  console.log('Express server running on', host + ':' + port);\n});\n`,
          },
        ],
        livePreview: {
          cwd: `${WORKSPACE_ROOT}/${name}`,
          command: 'HOST=0.0.0.0 PORT=4000 node index.js',
          port: 4000,
          waitPath: '/api/health',
          expectedStatus: [200],
        },
        devCommand: 'HOST=0.0.0.0 PORT=4000 node index.js',
        nextSteps: [
          `cd ${name}`,
          install ? '' : 'npm install express cors',
          'HOST=0.0.0.0 PORT=4000 node index.js',
        ].filter(Boolean),
      };
    },
  },
  {
    id: 'fastapi',
    label: 'FastAPI (Python)',
    stack: 'backend',
    languages: ['py'],
    createPlan: ({ name, install }) => {
      return {
        commands: [
          { cmd: `mkdir -p ${name}`, cwd: WORKSPACE_ROOT },
          ...(install ? [{ cmd: 'pip install fastapi uvicorn', cwd: `${WORKSPACE_ROOT}/${name}` }] : []),
        ],
        files: [
          {
            path: `${name}/main.py`,
            content: `from fastapi import FastAPI\n\napp = FastAPI()\n\n@app.get('/api/health')\ndef health():\n    return {\"ok\": True, \"message\": \"Hello from FastAPI\"}\n`,
          },
          {
            path: `${name}/requirements.txt`,
            content: 'fastapi\nuvicorn\n',
          },
        ],
        livePreview: {
          cwd: `${WORKSPACE_ROOT}/${name}`,
          command: 'uvicorn main:app --host 0.0.0.0 --port 4000 --reload',
          port: 4000,
          waitPath: '/api/health',
          expectedStatus: [200],
        },
        devCommand: 'uvicorn main:app --host 0.0.0.0 --port 4000 --reload',
        nextSteps: [
          `cd ${name}`,
          install ? '' : 'pip install -r requirements.txt',
          'uvicorn main:app --host 0.0.0.0 --port 4000 --reload',
        ].filter(Boolean),
      };
    },
  },
  {
    id: 'django',
    label: 'Django (Python)',
    stack: 'backend',
    languages: ['py'],
    createPlan: ({ name, install }) => {
      return {
        commands: [
          { cmd: `mkdir -p ${name}`, cwd: WORKSPACE_ROOT },
          ...(install ? [{ cmd: 'pip install django', cwd: `${WORKSPACE_ROOT}/${name}` }] : []),
          { cmd: 'django-admin startproject app .', cwd: `${WORKSPACE_ROOT}/${name}` },
        ],
        files: [
          {
            path: `${name}/requirements.txt`,
            content: 'django\n',
          },
        ],
        livePreview: {
          cwd: `${WORKSPACE_ROOT}/${name}`,
          command: 'python manage.py runserver 0.0.0.0:4000',
          port: 4000,
          waitPath: '/api/health',
          expectedStatus: [200],
        },
        devCommand: 'python manage.py runserver 0.0.0.0:4000',
        nextSteps: [
          `cd ${name}`,
          install ? '' : 'pip install -r requirements.txt',
          'python manage.py runserver 0.0.0.0:4000',
        ].filter(Boolean),
      };
    },
  },
  {
    id: 'flask',
    label: 'Flask (Python)',
    stack: 'backend',
    languages: ['py'],
    createPlan: ({ name, install }) => {
      return {
        commands: [
          { cmd: `mkdir -p ${name}`, cwd: WORKSPACE_ROOT },
          ...(install ? [{ cmd: 'pip install flask', cwd: `${WORKSPACE_ROOT}/${name}` }] : []),
        ],
        files: [
          {
            path: `${name}/app.py`,
            content: `from flask import Flask, jsonify\nimport os\n\napp = Flask(__name__)\n\n@app.get('/api/health')\ndef health():\n    return jsonify({\"ok\": True, \"message\": \"Hello from Flask\"})\n\nif __name__ == '__main__':\n    host = os.getenv('HOST', '0.0.0.0')\n    port = int(os.getenv('PORT', 4000))\n    app.run(host=host, port=port, debug=True)\n`,
          },
          {
            path: `${name}/requirements.txt`,
            content: 'flask\n',
          },
        ],
        livePreview: {
          cwd: `${WORKSPACE_ROOT}/${name}`,
          command: 'HOST=0.0.0.0 PORT=4000 python app.py',
          port: 4000,
          waitPath: '/api/health',
          expectedStatus: [200],
        },
        devCommand: 'HOST=0.0.0.0 PORT=4000 python app.py',
        nextSteps: [
          `cd ${name}`,
          install ? '' : 'pip install -r requirements.txt',
          'HOST=0.0.0.0 PORT=4000 python app.py',
        ].filter(Boolean),
      };
    },
  },
  {
    id: 'react-express',
    label: 'React + Express (Full Stack)',
    stack: 'fullstack',
    languages: ['js', 'ts'],
    createPlan: ({ name, pm, language, install }) => {
      const template = language === 'ts' ? 'react-ts' : 'react';
      const devCmd = `${pm.run('dev')} -- --host 0.0.0.0 --port 5173`;
      return {
        commands: [
          { cmd: `mkdir -p ${name}`, cwd: WORKSPACE_ROOT },
          { cmd: 'mkdir -p backend', cwd: `${WORKSPACE_ROOT}/${name}` },
          { cmd: 'npm init -y', cwd: `${WORKSPACE_ROOT}/${name}/backend` },
          { cmd: 'npm pkg set type=module', cwd: `${WORKSPACE_ROOT}/${name}/backend` },
          { cmd: 'npm pkg set scripts.dev="HOST=0.0.0.0 PORT=4000 node index.js"', cwd: `${WORKSPACE_ROOT}/${name}/backend` },
          { cmd: `${pm.exec('create-vite@latest')} frontend --template ${template}`, cwd: `${WORKSPACE_ROOT}/${name}` },
          ...(install ? [{ cmd: pm.install(), cwd: `${WORKSPACE_ROOT}/${name}/frontend` }] : []),
          ...(install ? [{ cmd: 'npm install express cors', cwd: `${WORKSPACE_ROOT}/${name}/backend` }] : []),
        ],
        files: [
          {
            path: `${name}/backend/index.js`,
            content: `import express from 'express';\nimport cors from 'cors';\n\nconst app = express();\napp.use(cors());\napp.use(express.json());\n\napp.get('/api/health', (req, res) => {\n  res.json({ ok: true, message: 'Hello from Express' });\n});\n\nconst port = Number(process.env.PORT || 4000);\nconst host = process.env.HOST || '0.0.0.0';\napp.listen(port, host, () => {\n  console.log('Express API running on', host + ':' + port);\n});\n`,
          },
          {
            path: `${name}/frontend/src/App.jsx`,
            content: `import { useEffect, useState } from 'react';\nimport './App.css';\n\nfunction getDefaultApiBase() {\n  if (typeof window === 'undefined') return 'http://127.0.0.1:4000';\n  const host = window.location.host;\n  if (/^\\d+-/.test(host)) {\n    return window.location.origin.replace(/^https?:\\/\\/\\d+-/, \`\${window.location.protocol}//4000-\`);\n  }\n  return \`\${window.location.protocol}//\${window.location.hostname}:4000\`;\n}\n\nfunction App() {\n  const [message, setMessage] = useState('Loading...');\n\n  useEffect(() => {\n    const apiBase = import.meta.env.VITE_API_BASE_URL || getDefaultApiBase();\n    fetch(\`\${apiBase}/api/health\`)\n      .then((r) => r.json())\n      .then((data) => setMessage(data.message || 'OK'))\n      .catch(() => setMessage('Failed to reach API'));\n  }, []);\n\n  return (\n    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>\n      <h1>React + Express</h1>\n      <p>API says: <strong>{message}</strong></p>\n    </div>\n  );\n}\n\nexport default App;\n`,
          },
        ],
        preview: {
          cwd: `${WORKSPACE_ROOT}/${name}/frontend`,
          dir: `${name}/frontend/dist`,
          buildCmd: pm.run('build'),
        },
        livePreview: {
          name: 'frontend',
          cwd: `${WORKSPACE_ROOT}/${name}/frontend`,
          command: devCmd,
          port: 5173,
          waitPath: '/',
          expectedStatus: [200, 304],
        },
        extraLivePreviews: [
          {
            name: 'backend',
            cwd: `${WORKSPACE_ROOT}/${name}/backend`,
            command: 'npm run dev',
            port: 4000,
            waitPath: '/api/health',
            expectedStatus: [200],
          },
        ],
        devCommand: `frontend: ${devCmd}; backend: npm run dev (port 4000)`,
        viteConfigDir: `${WORKSPACE_ROOT}/${name}/frontend`,
        nextSteps: [
          `cd ${name}/backend`,
          install ? '' : 'npm install express cors',
          'npm run dev',
          `cd ${name}/frontend`,
          install ? '' : pm.install(),
          devCmd,
        ].filter(Boolean),
      };
    },
  },
];

const FRAMEWORK_ALIASES = {
  react: 'react-vite',
  vue: 'vue-vite',
  svelte: 'svelte-vite',
  solid: 'solid-vite',
  preact: 'preact-vite',
  vanilla: 'vanilla-vite',
  next: 'nextjs',
  nextjs: 'nextjs',
  nuxt: 'nuxt',
  express: 'express',
  fastapi: 'fastapi',
  django: 'django',
  flask: 'flask',
  'react+express': 'react-express',
  'react-express': 'react-express',
};

function getNextPackageManagerFlag(packageManager) {
  switch (packageManager) {
    case 'pnpm':
      return '--use-pnpm';
    case 'yarn':
      return '--use-yarn';
    case 'bun':
      return '--use-bun';
    case 'npm':
    default:
      return '--use-npm';
  }
}

function normalizeName(name) {
  const safe = String(name || '').trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  const collapsed = safe.replace(/-+/g, '-').replace(/^[-_]+|[-_]+$/g, '');
  return collapsed || 'app';
}

function getPackageManager(pm) {
  if (!pm) return PACKAGE_MANAGERS.npm;
  return PACKAGE_MANAGERS[pm] || PACKAGE_MANAGERS.npm;
}

function buildExternalUrl(host) {
  if (!host) return null;
  if (host.startsWith('http://') || host.startsWith('https://')) return host;
  return `https://${host}`;
}

function toTrailingSlash(url) {
  if (!url) return null;
  return url.endsWith('/') ? url : `${url}/`;
}

function joinUrlPath(baseUrl, path = '/') {
  if (!baseUrl) return null;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}${normalizedPath}`;
}

function getTrafficAccessHeaders(sandbox) {
  if (!sandbox?.trafficAccessToken) return {};
  return { 'e2b-traffic-access-token': sandbox.trafficAccessToken };
}

function buildPreviewTargets({ sandbox, taskId, port }) {
  const host = sandbox.getHost(port);
  const externalUrl = toTrailingSlash(buildExternalUrl(host));
  const proxyUrl = taskId ? `/api/workspace/${taskId}/preview-service/${port}/` : null;
  return { host, externalUrl, proxyUrl };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function probeBlockedHost(url, headers = {}) {
  if (!url) return false;
  try {
    const resp = await fetch(url, { redirect: 'follow', headers });
    if (resp.status === 403) return true;
    const text = await resp.text();
    return text.includes('Blocked request') || text.includes('blocked host');
  } catch {
    return false;
  }
}

async function waitForExternalPreview({
  url,
  headers = {},
  expectedStatuses = [200, 204, 301, 302, 304, 307, 308],
  timeoutMs = 90_000,
  intervalMs = 1_500,
}) {
  if (!url) return { ready: false, status: null, attempts: 0 };
  const maxAttempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const resp = await fetch(url, { redirect: 'follow', headers });
      if (expectedStatuses.includes(resp.status)) {
        return { ready: true, status: resp.status, attempts: attempt };
      }
    } catch {
      // keep polling
    }
    await sleep(intervalMs);
  }
  return { ready: false, status: null, attempts: maxAttempts };
}

async function maybeFixViteBlockedHost({ sandbox, taskId, url, viteConfigDir, livePreview, headers = {} }) {
  if (!viteConfigDir || !url || !taskId || !livePreview) return { fixed: false };

  // Give dev server a moment to boot
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(1500 + attempt * 1000);
    const blocked = await probeBlockedHost(url, headers);
    if (!blocked) return { fixed: false };
    // Blocked: patch config and restart once
    await ensureViteAllowedHosts(sandbox, viteConfigDir);
    await devServerManager.start({
      taskId,
      sandbox,
      cwd: livePreview.cwd,
      command: livePreview.command,
      port: livePreview.port,
      restart: true,
      waitFor: {
        enabled: true,
        url: `http://127.0.0.1:${livePreview.port}${livePreview.waitPath || '/'}`,
        expectedStatus: livePreview.expectedStatus || [200],
        timeoutMs: livePreview.startupTimeoutMs || 120_000,
      },
    });
    return { fixed: true };
  }

  return { fixed: false };
}

function listFrameworks() {
  return FRAMEWORK_RECIPES.map(r => ({
    id: r.id,
    label: r.label,
    stack: r.stack,
    languages: r.languages,
  }));
}

async function runCommand(sandbox, cmd, cwd) {
  const proc = await sandbox.commands.run(cmd, {
    cwd,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });

  return {
    cmd,
    cwd,
    exitCode: proc.exitCode,
    stdout: (proc.stdout || '').slice(0, 4000),
    stderr: (proc.stderr || '').slice(0, 2000),
  };
}

export class ProjectScaffoldTool extends BaseTool {
  constructor(sandboxGetter) {
    super();
    this._getSandbox = sandboxGetter;
  }

  get name() { return 'project_scaffold'; }

  get description() {
    return `Create full-stack or single-stack web projects inside the sandbox workspace.

Actions:
- list: list supported frameworks
- create: scaffold a project

If the framework is not supported, use action "create" with framework "custom" and provide a "command" to run.
If a framework supports both JS and TS, you must specify "language".
Supported frameworks auto-start dev services on fixed ports and return preview URLs mapped from sandbox ports.`;
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'create'] },
        framework: { type: 'string', description: 'Framework id or alias' },
        project_name: { type: 'string', description: 'Project folder name' },
        stack: { type: 'string', enum: ['frontend', 'backend', 'fullstack'] },
        language: { type: 'string', enum: ['js', 'ts', 'py', 'python'] },
        package_manager: { type: 'string', enum: ['npm', 'pnpm', 'yarn', 'bun'] },
        install: { type: 'boolean', description: 'Install dependencies (default true)' },
        command: { type: 'string', description: 'Custom scaffold command (framework=custom)' },
      },
      required: ['action'],
      additionalProperties: false,
    };
  }

  async execute(args, context) {
    const { action } = args || {};
    if (!action) throw new Error('action is required');

    if (action === 'list') {
      return JSON.stringify({
        frameworks: listFrameworks(),
        note: 'Use framework "custom" with a command for unsupported generators.',
      });
    }

    if (action !== 'create') {
      throw new Error(`Unsupported action: ${action}`);
    }

    const {
      framework,
      project_name,
      stack,
      language,
      package_manager,
      install = true,
      command,
    } = args || {};

    if (!framework) throw new Error('framework is required');
    if (!project_name) throw new Error('project_name is required');

    const name = normalizeName(project_name);
    const pm = getPackageManager(package_manager);
    const sandbox = await this._getSandbox();
    const taskId = context?.taskId || null;

    if (framework === 'custom') {
      if (!command) throw new Error('command is required for custom framework');
      const result = await runCommand(sandbox, command, WORKSPACE_ROOT);
      return JSON.stringify({
        success: result.exitCode === 0,
        framework: 'custom',
        project: { name, path: `${WORKSPACE_ROOT}/${name}` },
        commands: [result],
        previewUrl: null,
        build: null,
        note: 'Custom scaffold command executed in workspace root.',
      });
    }

    // Prevent accidental overwrite if project already exists
    try {
      const entries = await sandbox.files.list(WORKSPACE_ROOT);
      const exists = entries.some(e => e.name === name);
      if (exists) {
        return JSON.stringify({
          success: false,
          error: `Project already exists: ${name}`,
          hint: 'Choose a different project_name or delete the existing folder.',
        });
      }
    } catch {
      // ignore; workspace may not exist yet
    }

    const key = FRAMEWORK_ALIASES[framework] || framework;
    const recipe = FRAMEWORK_RECIPES.find(r => r.id === key);
    if (!recipe) {
      return JSON.stringify({
        success: false,
        error: `Unsupported framework: ${framework}`,
        supported: listFrameworks(),
        hint: 'Use framework "custom" with a command for unsupported generators.',
        previewUrl: null,
      });
    }

    if (stack && recipe.stack !== stack) {
      return JSON.stringify({
        success: false,
        error: `Framework ${recipe.id} is ${recipe.stack}, not ${stack}.`,
        supported: listFrameworks(),
      });
    }

    let normalizedLanguage = language === 'python' ? 'py' : language;
    if (!normalizedLanguage) {
      if (recipe.languages.length === 1) {
        normalizedLanguage = recipe.languages[0];
      } else {
        return JSON.stringify({
          success: false,
          error: `Language is required for ${recipe.id}. Choose one of: ${recipe.languages.join(', ')}`,
          needsLanguage: true,
          choices: recipe.languages,
        });
      }
    }

    if (!recipe.languages.includes(normalizedLanguage)) {
      return JSON.stringify({
        success: false,
        error: `Framework ${recipe.id} does not support language ${normalizedLanguage}.`,
        supported: listFrameworks(),
      });
    }

    const plan = recipe.createPlan({
      name,
      pm,
      language: normalizedLanguage,
      install,
      packageManager: package_manager || 'npm',
    });

    const commandResults = [];
    for (const c of plan.commands || []) {
      const result = await runCommand(sandbox, c.cmd, c.cwd);
      commandResults.push(result);
      if (result.exitCode !== 0) {
        return JSON.stringify({
          success: false,
          framework: recipe.id,
          project: { name, path: `${WORKSPACE_ROOT}/${name}` },
          commands: commandResults,
          error: `Command failed: ${c.cmd}`,
        });
      }
    }

    for (const file of plan.files || []) {
      const fullPath = `${WORKSPACE_ROOT}/${file.path}`.replace(/\/+/g, '/');
      const parent = fullPath.substring(0, fullPath.lastIndexOf('/'));
      if (parent) {
        await sandbox.files.makeDir(parent).catch(() => {});
      }
      await sandbox.files.write(fullPath, file.content || '');
    }

    if (plan.viteConfigDir) {
      await ensureViteAllowedHosts(sandbox, plan.viteConfigDir);
    }

    let previewUrl = null;
    let previewExternalUrl = null;
    let previewProxyUrl = null;
    let previewAuthHeader = null;
    let buildResult = null;
    let liveResult = null;
    let runtimeFix = null;
    const serviceUrls = [];

    const liveServices = [
      ...(plan.livePreview ? [plan.livePreview] : []),
      ...(Array.isArray(plan.extraLivePreviews) ? plan.extraLivePreviews : []),
    ];

    if (liveServices.length > 0 && install && taskId) {
      const liveResults = [];
      const authHeaders = getTrafficAccessHeaders(sandbox);
      const startedServices = await Promise.all(
        liveServices.map(async (service, index) => {
          const serviceName = service.name || (index === 0 ? 'frontend' : `service-${index + 1}`);
          const waitPath = service.waitPath || '/';
          const expectedStatus = service.expectedStatus || [200, 204, 301, 302, 304];

          const started = await devServerManager.start({
            taskId,
            sandbox,
            cwd: service.cwd,
            command: service.command,
            port: service.port,
            waitFor: {
              enabled: true,
              url: `http://127.0.0.1:${service.port}${waitPath}`,
              expectedStatus,
              timeoutMs: service.startupTimeoutMs || 120_000,
            },
          });

          const previewTargets = buildPreviewTargets({
            sandbox,
            taskId,
            port: service.port,
          });
          const externalCheckUrl = joinUrlPath(previewTargets.externalUrl, waitPath);
          const externalReady = await waitForExternalPreview({
            url: externalCheckUrl,
            headers: authHeaders,
            expectedStatuses: expectedStatus,
            timeoutMs: service.startupTimeoutMs || 120_000,
          });

          const embedUrl = sandbox.trafficAccessToken
            ? previewTargets.proxyUrl
            : previewTargets.externalUrl;

          const serviceInfo = {
            name: serviceName,
            port: service.port,
            waitPath,
            url: embedUrl,
            externalUrl: previewTargets.externalUrl,
            proxyUrl: previewTargets.proxyUrl,
            requiresAccessToken: Boolean(sandbox.trafficAccessToken),
            ready: externalReady.ready,
            readyStatus: externalReady.status,
          };

          return { index, started, serviceInfo, previewTargets, embedUrl };
        }),
      );

      for (const item of startedServices) {
        const { index, started, serviceInfo, previewTargets, embedUrl } = item;
        serviceUrls.push(serviceInfo);
        liveResults.push({ ...started, ...serviceInfo });

        if (index === 0) {
          previewUrl = embedUrl;
          previewExternalUrl = previewTargets.externalUrl;
          previewProxyUrl = sandbox.trafficAccessToken ? previewTargets.proxyUrl : null;
          previewAuthHeader = sandbox.trafficAccessToken ? 'e2b-traffic-access-token' : null;
        }
      }

      if (plan.viteConfigDir && plan.livePreview && previewExternalUrl) {
        runtimeFix = await maybeFixViteBlockedHost({
          sandbox,
          taskId,
          url: joinUrlPath(previewExternalUrl, plan.livePreview.waitPath || '/'),
          viteConfigDir: plan.viteConfigDir,
          livePreview: plan.livePreview,
          headers: authHeaders,
        });
      }

      liveResult = liveResults.length === 1 ? liveResults[0] : liveResults;
    } else if (plan.preview && install) {
      buildResult = await runCommand(sandbox, plan.preview.buildCmd, plan.preview.cwd);
      if (buildResult.exitCode === 0 && taskId) {
        const previewPath = `${plan.preview.dir}/index.html`.replace(/\/+/g, '/');
        previewUrl = `/api/workspace/${taskId}/preview-app/${previewPath}`;
      }
    }

    return JSON.stringify({
      success: true,
      framework: recipe.id,
      project: { name, path: `${WORKSPACE_ROOT}/${name}` },
      commands: commandResults,
      devCommand: plan.devCommand || null,
      nextSteps: plan.nextSteps || [],
      previewUrl,
      previewExternalUrl,
      previewProxyUrl,
      previewAuthHeader,
      serviceUrls,
      build: buildResult,
      live: liveResult,
      runtimeFix,
    });
  }
}
