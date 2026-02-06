import { useState, useEffect, useCallback } from 'react';
import { getWorkspaceFiles } from '../api/client.js';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileCode,
  FileJson,
  FileText,
  File,
  RefreshCw,
  FileImage,
  PanelLeftClose,
} from 'lucide-react';

// Map extensions to icons
function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  switch (ext) {
    case 'js': case 'mjs': case 'jsx': case 'ts': case 'tsx':
    case 'py': case 'html': case 'css': case 'scss': case 'sh':
    case 'bash': case 'sql': case 'xml': case 'yaml': case 'yml':
      return FileCode;
    case 'json':
      return FileJson;
    case 'md': case 'txt': case 'log': case 'csv':
      return FileText;
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': case 'ico':
      return FileImage;
    default:
      return File;
  }
}

// Get a color for file icons based on extension
function getFileColor(name) {
  const ext = name.split('.').pop().toLowerCase();
  switch (ext) {
    case 'js': case 'mjs': case 'jsx': return '#f0db4f';
    case 'ts': case 'tsx': return '#3178c6';
    case 'py': return '#3776ab';
    case 'json': return '#f5a623';
    case 'html': return '#e44d26';
    case 'css': case 'scss': return '#2965f1';
    case 'md': return '#519aba';
    case 'sh': case 'bash': return '#89e051';
    case 'yml': case 'yaml': return '#cb171e';
    default: return '#8b8b8b';
  }
}

// Build tree from flat file list
function buildTree(files) {
  const root = { name: '', type: 'directory', children: [], path: '' };

  for (const file of files) {
    const parts = file.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (isLast && file.type === 'file') {
        current.children.push({
          name: part,
          type: 'file',
          path: file.path,
          children: [],
        });
      } else {
        let dir = current.children.find(c => c.name === part && c.type === 'directory');
        if (!dir) {
          dir = {
            name: part,
            type: 'directory',
            path: parts.slice(0, i + 1).join('/'),
            children: [],
          };
          current.children.push(dir);
        }
        current = dir;
      }
    }
  }

  // Sort: directories first, then alphabetical
  const sortChildren = (node) => {
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(child => {
      if (child.type === 'directory') sortChildren(child);
    });
  };
  sortChildren(root);

  return root.children;
}

function TreeNode({ node, depth, expanded, onToggle, selectedPath, onSelect }) {
  const isDir = node.type === 'directory';
  const isExpanded = expanded[node.path];
  const isSelected = selectedPath === node.path;

  const handleClick = () => {
    if (isDir) {
      onToggle(node.path);
    } else {
      onSelect(node);
    }
  };

  const IconComponent = isDir
    ? (isExpanded ? FolderOpen : Folder)
    : getFileIcon(node.name);

  const iconColor = isDir ? '#dcb67a' : getFileColor(node.name);

  return (
    <>
      <div
        className={`tree-node ${isSelected ? 'selected' : ''}`}
        onClick={handleClick}
        style={{ paddingLeft: depth * 16 + 4 }}
      >
        <span className="tree-chevron">
          {isDir ? (
            isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : null}
        </span>
        <IconComponent size={15} style={{ color: iconColor, flexShrink: 0 }} />
        <span className="tree-label">{node.name}</span>
      </div>
      {isDir && isExpanded && node.children.map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

export function FileBrowser({ taskId, onFileSelect, fileVersion, onToggleSidebar }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [selectedPath, setSelectedPath] = useState(null);

  const loadFiles = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const data = await getWorkspaceFiles(taskId);
      setFiles(data.files || []);
      // Auto-expand all directories on first load
      if (data.files) {
        const dirs = {};
        for (const f of data.files) {
          if (f.type === 'directory') dirs[f.path] = true;
        }
        setExpanded(prev => ({ ...prev, ...dirs }));
      }
    } catch {
      setFiles([]);
    }
    setLoading(false);
  }, [taskId]);

  useEffect(() => {
    loadFiles();
  }, [taskId, fileVersion, loadFiles]);

  const toggleExpand = useCallback((path) => {
    setExpanded(prev => ({ ...prev, [path]: !prev[path] }));
  }, []);

  const handleSelect = useCallback((node) => {
    setSelectedPath(node.path);
    onFileSelect(node);
  }, [onFileSelect]);

  const tree = buildTree(files);

  if (!taskId) {
    return (
      <div className="file-explorer empty">
        <File size={24} />
        <p>No active workspace</p>
      </div>
    );
  }

  return (
    <div className="file-explorer">
      <div className="explorer-header">
        <span>EXPLORER</span>
        <div className="explorer-actions">
          <button onClick={loadFiles} className="explorer-action-btn" disabled={loading} title="Refresh">
            <RefreshCw size={13} className={loading ? 'spinner' : ''} />
          </button>
          {onToggleSidebar && (
            <button onClick={onToggleSidebar} className="explorer-action-btn" title="Close sidebar">
              <PanelLeftClose size={13} />
            </button>
          )}
        </div>
      </div>
      <div className="file-tree">
        {files.length === 0 && !loading && (
          <div className="tree-empty">No files yet</div>
        )}
        {tree.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            depth={0}
            expanded={expanded}
            onToggle={toggleExpand}
            selectedPath={selectedPath}
            onSelect={handleSelect}
          />
        ))}
      </div>
    </div>
  );
}
