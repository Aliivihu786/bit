import { Router } from 'express';
import * as cheerio from 'cheerio';

export const browserRoutes = Router();

// GET /api/browser/proxy?url=xxx — serves the page HTML directly for iframe embedding
browserRoutes.get('/proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('url query param required');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Cache-Control': 'no-cache',
      },
    });
    clearTimeout(timeout);

    // For non-HTML content (images, PDFs), pipe directly
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('html') && !contentType.includes('xml')) {
      res.setHeader('Content-Type', contentType);
      const buffer = Buffer.from(await response.arrayBuffer());
      return res.send(buffer);
    }

    const html = await response.text();

    // If HTML is empty or too short, serve a meaningful error
    if (!html || html.trim().length < 50) {
      return res.send(`<html><body style="font-family:sans-serif;padding:40px;color:#999;background:#1a1a2e">
        <h3 style="color:#ccc">Page returned empty content</h3>
        <p>URL: ${url}</p>
      </body></html>`);
    }

    const $ = cheerio.load(html);
    const resolvedUrl = response.url || url;

    // Remove scripts for safety
    $('script').remove();

    // Remove meta tags that block iframe embedding
    $('meta[http-equiv="X-Frame-Options"]').remove();
    $('meta[http-equiv="Content-Security-Policy"]').remove();
    $('meta[http-equiv="x-frame-options"]').remove();
    $('meta[http-equiv="content-security-policy"]').remove();

    // Inject <base> so relative resources (CSS, images) resolve to the original site
    const baseUrl = new URL('/', resolvedUrl).toString();
    $('base').remove(); // remove any existing <base>
    $('head').prepend(`<base href="${baseUrl}" />`);

    // Fix protocol-relative URLs (//cdn.example.com) to https
    $('link[href^="//"]').each((_, el) => {
      $(el).attr('href', 'https:' + $(el).attr('href'));
    });
    $('img[src^="//"]').each((_, el) => {
      $(el).attr('src', 'https:' + $(el).attr('src'));
    });

    // Inject a style to ensure the page body is visible (some sites set body to hidden until JS runs)
    $('head').append(`<style>
      body { visibility: visible !important; opacity: 1 !important; display: block !important; }
      .hidden, [hidden] { /* don't override */ }
    </style>`);

    // Remove X-Frame-Options and CSP headers from our response
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send($.html());
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'Request timed out' : err.message;
    res.status(200).send(`<html><body style="font-family:sans-serif;padding:40px;color:#999;background:#1a1a2e">
      <h2 style="color:#ccc">Failed to load page</h2>
      <p>${msg}</p>
      <p style="font-size:12px;margin-top:20px;color:#666">URL: ${url}</p>
    </body></html>`);
  }
});

// POST /api/browser/navigate — fetch a URL and return metadata (title, url)
browserRoutes.post('/navigate', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timeout);

    const html = await response.text();
    const $ = cheerio.load(html);
    const title = $('title').text().trim();

    res.json({
      url: response.url,
      title,
      status: response.status,
    });
  } catch (err) {
    res.json({
      url,
      title: 'Error',
      error: err.name === 'AbortError' ? 'Request timed out' : err.message,
    });
  }
});
