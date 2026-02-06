import { BaseTool } from './baseTool.js';
import * as cheerio from 'cheerio';

/**
 * Simple Web Browser Tool - Read-Only
 *
 * Fast HTML fetching for reading articles, documentation, and static content.
 * Does NOT support interactive features (forms, buttons, JavaScript).
 */

export class WebBrowserTool extends BaseTool {
  constructor() {
    super();
    this._currentPage = null;
    this._currentUrl = null;
  }

  get name() { return 'web_browser'; }

  get description() {
    return `Browse web pages and extract content. Fast HTML fetching for reading articles, docs, and static sites.

Available actions:
- "goto": Navigate to a URL and get the page content
- "get_text": Get text content from the current page
- "get_links": Get all links from the current page

This tool is for READING pages only. It cannot interact with forms, buttons, or JavaScript.`;
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['goto', 'get_text', 'get_links'],
          description: 'The action to perform',
        },
        url: {
          type: 'string',
          description: 'URL to navigate to (for "goto")',
        },
      },
      required: ['action'],
    };
  }

  async execute(args) {
    const { action, url } = args;

    try {
      switch (action) {
        case 'goto':
          return await this._goto(url);
        case 'get_text':
          return this._getText();
        case 'get_links':
          return this._getLinks();
        default:
          return JSON.stringify({ error: `Unknown action: ${action}` });
      }
    } catch (err) {
      return JSON.stringify({
        error: err.message,
        hint: 'The page may be unreachable or blocking requests. Try a different URL.',
      });
    }
  }

  async _goto(url) {
    if (!url) return JSON.stringify({ error: 'url is required for goto action' });

    // Try multiple strategies
    let html = null;
    let usedStrategy = null;

    // Strategy 1: Direct fetch
    try {
      html = await this._fetchDirect(url);
      usedStrategy = 'direct';
    } catch (e) {
      console.log(`[WebBrowser] Direct fetch failed: ${e.message}`);
    }

    // Strategy 2: Jina Reader (for JS-rendered sites)
    if (!html || html.length < 500) {
      try {
        const jinaResult = await this._fetchWithJina(url);
        if (jinaResult && jinaResult.length > (html?.length || 0)) {
          html = jinaResult;
          usedStrategy = 'jina';
        }
      } catch (e) {
        console.log(`[WebBrowser] Jina fetch failed: ${e.message}`);
      }
    }

    if (!html) {
      return JSON.stringify({
        error: 'Failed to fetch page content',
        url,
        hint: 'The page may be blocking requests or require JavaScript.',
      });
    }

    // Parse HTML
    const $ = cheerio.load(html);

    // Remove unwanted elements
    $('script, style, noscript, iframe, nav, footer, header, aside, [role="banner"], [role="navigation"]').remove();

    // Extract title
    const title = $('title').text().trim() || $('h1').first().text().trim() || 'Untitled';

    // Extract main content
    let mainContent = '';
    const mainSelectors = ['main', 'article', '[role="main"]', '.content', '.post-content', '.entry-content', '#content'];
    for (const sel of mainSelectors) {
      const main = $(sel).first();
      if (main.length && main.text().trim().length > 200) {
        mainContent = main.text();
        break;
      }
    }
    if (!mainContent) {
      mainContent = $('body').text();
    }

    // Clean up whitespace
    const cleanedContent = mainContent
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();

    // Extract links
    const links = [];
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href && text && !href.startsWith('#') && !href.startsWith('javascript:')) {
        try {
          const fullUrl = new URL(href, url).href;
          links.push({ text: text.slice(0, 100), url: fullUrl });
        } catch {}
      }
    });

    // Store for subsequent calls
    this._currentPage = $;
    this._currentUrl = url;

    // Chunk content for response
    const CHUNK_SIZE = 6000;
    const content = cleanedContent.slice(0, CHUNK_SIZE);

    return JSON.stringify({
      action: 'goto',
      url,
      title,
      content,
      contentLength: cleanedContent.length,
      truncated: cleanedContent.length > CHUNK_SIZE,
      linksCount: links.length,
      links: links.slice(0, 20),
      strategy: usedStrategy,
      message: `Loaded ${url}. Content: ${content.length} chars. ${links.length} links found.`,
    });
  }

  async _fetchDirect(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  async _fetchWithJina(url) {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(jinaUrl, {
        headers: {
          'Accept': 'text/plain',
          'X-Return-Format': 'text',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Jina HTTP ${response.status}`);
      }

      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  _getText() {
    if (!this._currentPage) {
      return JSON.stringify({
        error: 'No page loaded. Use "goto" first.',
      });
    }

    const text = this._currentPage('body').text()
      .replace(/\s+/g, ' ')
      .trim();

    const CHUNK_SIZE = 8000;

    return JSON.stringify({
      action: 'get_text',
      url: this._currentUrl,
      content: text.slice(0, CHUNK_SIZE),
      totalLength: text.length,
      truncated: text.length > CHUNK_SIZE,
    });
  }

  _getLinks() {
    if (!this._currentPage) {
      return JSON.stringify({
        error: 'No page loaded. Use "goto" first.',
      });
    }

    const $ = this._currentPage;
    const links = [];

    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href && text && !href.startsWith('#') && !href.startsWith('javascript:')) {
        try {
          const fullUrl = new URL(href, this._currentUrl).href;
          links.push({ text: text.slice(0, 100), url: fullUrl });
        } catch {}
      }
    });

    return JSON.stringify({
      action: 'get_links',
      url: this._currentUrl,
      links: links.slice(0, 50),
      totalLinks: links.length,
    });
  }
}
