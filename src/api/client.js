export async function runAgent(message, taskId = null, agentName = null) {
  const response = await fetch('/api/agent/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, taskId, agentName }),
  });

  if (!response.ok) {
    throw new Error(`Server error: ${response.status}`);
  }

  return response;
}

export function parseSSEStream(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  return (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop();

      for (const part of parts) {
        const line = part.trim();
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            onEvent(data);
          } catch {
            // skip malformed events
          }
        }
      }
    }
  })();
}

export async function getWorkspaceFiles(taskId) {
  const res = await fetch(`/api/workspace/${taskId}/files`);
  return res.json();
}

export async function getWorkspaceFile(taskId, path) {
  const res = await fetch(`/api/workspace/${taskId}/file?path=${encodeURIComponent(path)}`);
  return res.json();
}

export async function saveWorkspaceFile(taskId, path, content) {
  const res = await fetch(`/api/workspace/${taskId}/file`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });
  if (!res.ok) {
    throw new Error(`Failed to save file: ${res.status}`);
  }
  return res.json();
}

export async function listAgentTools() {
  const res = await fetch('/api/agent/tools');
  if (!res.ok) {
    throw new Error(`Failed to load tools: ${res.status}`);
  }
  return res.json();
}
