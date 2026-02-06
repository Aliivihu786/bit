import { useState, useEffect, useRef, useCallback } from 'react';
import { Globe, RefreshCw, ArrowLeft, ArrowRight, ExternalLink, Search, ChevronUp, ChevronDown, Monitor } from 'lucide-react';

function proxyUrl(url) {
  return `/api/browser/proxy?url=${encodeURIComponent(url)}`;
}

export function BrowserPreview({ taskId, browserState }) {
  const [url, setUrl] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState(null); // { type, url, title, ... }
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [scrollInfo, setScrollInfo] = useState(null);
  const iframeRef = useRef(null);

  // Scroll the iframe to a section position
  const scrollIframeTo = useCallback((section, totalSections) => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const tryScroll = () => {
      try {
        const win = iframe.contentWindow;
        const doc = iframe.contentDocument || win?.document;
        if (!doc || !doc.documentElement) return;

        const scrollHeight = doc.documentElement.scrollHeight;
        const clientHeight = iframe.clientHeight;
        const maxScroll = scrollHeight - clientHeight;
        if (maxScroll <= 0) return;

        const progress = (section - 1) / Math.max(totalSections - 1, 1);
        const targetScroll = Math.round(progress * maxScroll);

        win.scrollTo({ top: targetScroll, behavior: 'smooth' });
      } catch {
        // cross-origin — can't scroll, that's ok
      }
    };

    // Retry with delays since page may still be rendering
    tryScroll();
    setTimeout(tryScroll, 500);
    setTimeout(tryScroll, 1200);
  }, []);

  // React to agent browser events
  useEffect(() => {
    if (!browserState) return;

    if (browserState.type === 'loading') {
      setUrl(browserState.url);
      setInputUrl(browserState.url);
      setLoading(true);
      setScrollInfo(null);
      // Load the page via proxy in iframe immediately
      if (browserState.url && iframeRef.current) {
        iframeRef.current.src = proxyUrl(browserState.url);
      }
      setContent({ type: 'page', url: browserState.url, title: '' });
    } else if (browserState.type === 'searching') {
      setUrl('');
      setInputUrl(`search: ${browserState.query}`);
      setLoading(true);
      setScrollInfo(null);
      setContent(null);
    } else if (browserState.type === 'page') {
      const section = browserState.section || 1;
      const totalSections = browserState.totalSections || 1;
      const isScroll = browserState.action === 'scroll_down' || browserState.action === 'scroll_up';

      setUrl(browserState.url);
      setInputUrl(browserState.url);
      setLoading(false);
      setScrollInfo({ section, totalSections });

      if (isScroll) {
        // Just scroll the existing page
        scrollIframeTo(section, totalSections);
      } else {
        // New page — load via proxy if not already loading
        setContent({ type: 'page', url: browserState.url, title: browserState.title });
        if (browserState.url) {
          setHistory(prev => [...prev.slice(0, historyIndex + 1), browserState.url]);
          setHistoryIndex(prev => prev + 1);
          if (iframeRef.current) {
            const newSrc = proxyUrl(browserState.url);
            if (iframeRef.current.src !== newSrc) {
              iframeRef.current.src = newSrc;
            }
          }
        }
      }
    } else if (browserState.type === 'search_results') {
      setUrl('');
      setInputUrl(`search: ${browserState.query}`);
      setLoading(false);
      setScrollInfo(null);
      setContent({
        type: 'search',
        query: browserState.query,
        results: browserState.results || [],
      });
    } else if (browserState.type === 'automating') {
      setLoading(true);
      setScrollInfo(null);
      if (browserState.url) {
        setUrl(browserState.url);
        setInputUrl(browserState.url);
      }
      setContent(prev => prev?.type === 'automation' ? prev : { type: 'automation' });
    } else if (browserState.type === 'automation') {
      setLoading(false);
      setScrollInfo(null);
      if (browserState.url) {
        setUrl(browserState.url);
        setInputUrl(browserState.url);
      }
      setContent({
        type: 'automation',
        screenshot: browserState.screenshot,
        message: browserState.message,
        action: browserState.action,
        url: browserState.url,
        title: browserState.title,
      });
      // Also load the URL in iframe for live view
      if (browserState.url && iframeRef.current) {
        const newSrc = proxyUrl(browserState.url);
        if (iframeRef.current.src !== newSrc) {
          iframeRef.current.src = newSrc;
        }
      }
    }
    // Note: canvas type is handled by CanvasPreview component
  }, [browserState, scrollIframeTo, historyIndex]);

  // Fallback: if loading takes too long, clear loading state
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setLoading(false), 20000);
    return () => clearTimeout(timer);
  }, [loading]);

  const handleIframeLoad = useCallback(() => {
    setLoading(false);
    // If there's a scroll position pending, scroll to it
    if (scrollInfo && scrollInfo.section > 1) {
      scrollIframeTo(scrollInfo.section, scrollInfo.totalSections);
    }
  }, [scrollInfo, scrollIframeTo]);

  const navigate = (targetUrl) => {
    if (!targetUrl.trim()) return;
    let fullUrl = targetUrl.trim();
    if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
      fullUrl = 'https://' + fullUrl;
    }

    setUrl(fullUrl);
    setInputUrl(fullUrl);
    setLoading(true);
    setScrollInfo(null);
    setContent({ type: 'page', url: fullUrl, title: '' });

    if (iframeRef.current) {
      iframeRef.current.src = proxyUrl(fullUrl);
    }

    const newHistory = [...history.slice(0, historyIndex + 1), fullUrl];
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const goBack = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      navigate(history[newIndex]);
    }
  };

  const goForward = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      navigate(history[newIndex]);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    navigate(inputUrl);
  };

  const handleResultClick = (resultUrl) => {
    navigate(resultUrl);
  };

  const showIframe = content?.type === 'page' || (content?.type === 'automation' && !content.screenshot);
  const showScreenshot = content?.type === 'automation' && content.screenshot && !loading;
  const showSearch = content?.type === 'search' && !loading;

  return (
    <div className="browser-preview">
      <div className="browser-toolbar">
        <button className="browser-nav-btn" onClick={goBack} disabled={historyIndex <= 0}>
          <ArrowLeft size={14} />
        </button>
        <button className="browser-nav-btn" onClick={goForward} disabled={historyIndex >= history.length - 1}>
          <ArrowRight size={14} />
        </button>
        <button className="browser-nav-btn" onClick={() => url && navigate(url)} disabled={!url || loading}>
          <RefreshCw size={14} className={loading ? 'spin-icon' : ''} />
        </button>
        <form className="browser-url-bar" onSubmit={handleSubmit}>
          {content?.type === 'search' ? <Search size={12} className="url-icon" /> :
           content?.type === 'automation' ? <Monitor size={12} className="url-icon" /> :
           <Globe size={12} className="url-icon" />}
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="Enter URL to preview..."
          />
        </form>
        {url && (
          <a className="browser-nav-btn" href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={14} />
          </a>
        )}
      </div>

      {/* Scroll indicator bar */}
      {scrollInfo && scrollInfo.totalSections > 1 && (
        <div className="browser-scroll-bar">
          <ChevronUp size={12} className={scrollInfo.section <= 1 ? 'disabled' : ''} />
          <div className="scroll-track">
            <div
              className="scroll-progress"
              style={{ width: `${(scrollInfo.section / scrollInfo.totalSections) * 100}%` }}
            />
          </div>
          <span className="scroll-label">
            Section {scrollInfo.section} / {scrollInfo.totalSections}
          </span>
          <ChevronDown size={12} className={scrollInfo.section >= scrollInfo.totalSections ? 'disabled' : ''} />
        </div>
      )}

      <div className="browser-viewport">
        {/* Iframe — always present but hidden when not active */}
        <iframe
          ref={iframeRef}
          className="browser-iframe"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          referrerPolicy="no-referrer"
          title="Browser preview"
          onLoad={handleIframeLoad}
          onError={() => setLoading(false)}
          style={{ display: showIframe && !showScreenshot ? 'block' : 'none' }}
        />

        {/* Browser automation screenshot */}
        {showScreenshot && (
          <div className="browser-automation-view">
            <img
              src={`data:image/png;base64,${content.screenshot}`}
              alt="Browser screenshot"
              className="browser-screenshot"
            />
            {content.message && (
              <div className="automation-action-bar">
                <Monitor size={14} />
                <span>{content.message}</span>
              </div>
            )}
          </div>
        )}

        {/* Loading overlay */}
        {loading && (
          <div className="browser-loading-overlay">
            <div className="loading-spinner" />
            <p>{browserState?.type === 'searching'
              ? `Searching: ${browserState?.query || ''}...`
              : browserState?.type === 'automating'
              ? `Browser: ${browserState?.action || 'working'}...`
              : `Loading...`}
            </p>
          </div>
        )}

        {/* Empty state — no page loaded */}
        {!content && !loading && (
          <div className="browser-empty">
            <Globe size={40} />
            <p>Agent browser preview</p>
            <p className="browser-hint">
              When the agent browses the web or searches, results appear here in real time
            </p>
          </div>
        )}

        {/* Search results */}
        {showSearch && (
          <div className="browser-search-results">
            <div className="search-header">
              <Search size={16} />
              <span> Search results for: <strong>{content.query}</strong></span>
            </div>
            {content.results.length === 0 && (
              <p className="no-results">No results found</p>
            )}
            {content.results.map((result, i) => (
              <div key={i} className="search-result-item" onClick={() => handleResultClick(result.url)}>
                <div className="search-result-url">{result.url}</div>
                <div className="search-result-title">{result.title}</div>
                <div className="search-result-snippet">{result.snippet}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
