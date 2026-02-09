import { useState, useEffect, useRef } from 'react';
import { Monitor, RefreshCw, ExternalLink } from 'lucide-react';

export function CanvasPreview({ browserState }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const iframeRef = useRef(null);

  const withTimestamp = (inputUrl, ts) => {
    if (!inputUrl) return inputUrl;
    const separator = inputUrl.includes('?') ? '&' : '?';
    return `${inputUrl}${separator}t=${ts}`;
  };

  // React to canvas events
  useEffect(() => {
    if (!browserState || browserState.type !== 'canvas') return;

    const canvasUrl = browserState.url;
    const canvasTitle = browserState.title || 'Canvas Preview';
    const timestamp = browserState.timestamp || Date.now();

    console.log('[CanvasPreview] Loading:', canvasUrl, 'timestamp:', timestamp);

    // Add timestamp to URL to force iframe reload on updates
    const urlWithTimestamp = withTimestamp(canvasUrl, timestamp);

    setUrl(urlWithTimestamp);
    setTitle(canvasTitle);
    setLoading(true);

    // Fallback: auto-hide loading after 2 seconds if onLoad doesn't fire
    const timeout = setTimeout(() => {
      console.log('[CanvasPreview] Timeout - assuming loaded');
      setLoading(false);
    }, 2000);

    return () => clearTimeout(timeout);
  }, [browserState]);

  const handleIframeLoad = () => {
    console.log('[CanvasPreview] Loaded successfully');
    setLoading(false);
  };

  const handleIframeError = () => {
    console.error('[CanvasPreview] Failed to load');
    setLoading(false);
  };

  const handleRefresh = () => {
    if (iframeRef.current && url) {
      setLoading(true);
      iframeRef.current.src = withTimestamp(url, Date.now()); // Cache bust
    }
  };

  const handleOpenExternal = () => {
    if (url) {
      window.open(url, '_blank');
    }
  };

  if (!url) {
    return (
      <div className="canvas-preview empty">
        <Monitor size={48} className="empty-icon" />
        <p className="empty-title">No Canvas Preview</p>
        <p className="empty-hint">Agent-created HTML will appear here</p>
      </div>
    );
  }

  return (
    <div className="canvas-preview">
      {/* Canvas Toolbar */}
      <div className="canvas-toolbar">
        <div className="canvas-info">
          <Monitor size={16} />
          <span className="canvas-title">{title}</span>
        </div>
        <div className="canvas-actions">
          <button
            className="canvas-btn"
            onClick={handleRefresh}
            title="Refresh"
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'spinning' : ''} />
          </button>
          <button
            className="canvas-btn"
            onClick={handleOpenExternal}
            title="Open in new tab"
          >
            <ExternalLink size={14} />
          </button>
        </div>
      </div>

      {/* Canvas Frame */}
      <div className="canvas-frame-container">
        {loading && (
          <div className="canvas-loading">
            <RefreshCw size={24} className="spinning" />
            <span>Loading preview...</span>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={url}
          className="canvas-frame"
          title="Canvas Preview"
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
        />
      </div>

      {/* Canvas Info Bar */}
      <div className="canvas-info-bar">
        <span className="canvas-url">{url}</span>
        <span className="canvas-status">
          {loading ? 'Loading...' : 'Ready'}
        </span>
      </div>
    </div>
  );
}
