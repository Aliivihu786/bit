import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { getWorkspaceFile } from '../api/client.js';
import { FileCode, Loader } from 'lucide-react';

const extToLang = {
  js: 'javascript',
  mjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  json: 'json',
  md: 'markdown',
  html: 'html',
  css: 'css',
  scss: 'scss',
  sh: 'shell',
  bash: 'shell',
  yml: 'yaml',
  yaml: 'yaml',
  xml: 'xml',
  sql: 'sql',
  txt: 'plaintext',
};

export function CodeViewer({ taskId, file }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!taskId || !file) return;
    setLoading(true);
    getWorkspaceFile(taskId, file.path)
      .then(data => setContent(data.content || ''))
      .catch(() => setContent('// Error loading file'))
      .finally(() => setLoading(false));
  }, [taskId, file]);

  if (!file) {
    return (
      <div className="code-viewer empty">
        <FileCode size={32} />
        <p>Select a file to view its content</p>
      </div>
    );
  }

  const ext = file.name.split('.').pop();
  const language = extToLang[ext] || 'plaintext';

  return (
    <div className="code-viewer">
      <div className="code-tab-bar">
        <div className="code-tab active">
          <FileCode size={13} />
          <span>{file.name}</span>
        </div>
      </div>
      <div className="monaco-container">
        {loading ? (
          <div className="monaco-loading">
            <Loader size={20} className="spinner" />
            <span>Loading...</span>
          </div>
        ) : (
          <Editor
            height="100%"
            language={language}
            value={content}
            theme="vs-dark"
            options={{
              readOnly: true,
              fontSize: 13,
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              lineNumbers: 'on',
              renderLineHighlight: 'line',
              scrollbar: {
                verticalScrollbarSize: 6,
                horizontalScrollbarSize: 6,
              },
              padding: { top: 8 },
              domReadOnly: true,
            }}
          />
        )}
      </div>
    </div>
  );
}
