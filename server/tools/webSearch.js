import { BaseTool } from './baseTool.js';
import * as cheerio from 'cheerio';

export class WebSearchTool extends BaseTool {
  get name() { return 'web_search'; }

  get description() {
    return 'Search the web for information. Returns a list of results with titles, URLs, and snippets.';
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        num_results: { type: 'integer', description: 'Number of results (default 5, max 10)' },
      },
      required: ['query'],
    };
  }

  async execute({ query, num_results = 5 }) {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'BitAgent/1.0' },
    });
    const html = await resp.text();
    const $ = cheerio.load(html);

    const results = [];
    $('.result').each((i, el) => {
      if (i >= Math.min(num_results, 10)) return false;
      const title = $(el).find('.result__title a').text().trim();
      const href = $(el).find('.result__title a').attr('href');
      const snippet = $(el).find('.result__snippet').text().trim();
      if (title && href) results.push({ title, url: href, snippet });
    });

    return JSON.stringify({ query, results });
  }
}
