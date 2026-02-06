import { chromium } from 'playwright-core';

const CHROMIUM_PATH = '/nix/store/wsdanhm606q4wzv2y98bxc5hpfbi3sap-idx-builtins/bin/chromium-browser';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes idle

class BrowserSessionManager {
  constructor() {
    this.sessions = new Map(); // taskId -> { browser, context, page, timer, refs }
  }

  async getOrCreate(taskId) {
    const existing = this.sessions.get(taskId);
    if (existing) {
      this._resetTimer(taskId);
      // Validate page is still alive
      try {
        await existing.page.evaluate(() => document.readyState);
        return existing;
      } catch {
        console.log(`[BrowserSession] Page for task ${taskId} crashed, recreating...`);
        await this._cleanup(taskId);
      }
    }
    return this._create(taskId);
  }

  async _create(taskId) {
    console.log(`[BrowserSession] Creating new browser for task ${taskId}`);

    // Anti-detection: More browser args to look like a real browser
    const browser = await chromium.launch({
      executablePath: CHROMIUM_PATH,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled', // Hide automation
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-web-security', // Allow cross-origin (be careful)
        '--disable-site-isolation-trials',
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }, // More realistic resolution
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', // Latest Chrome
      locale: 'en-US',
      timezoneId: 'America/New_York',
      ignoreHTTPSErrors: true,
      // Emulate real browser permissions
      permissions: ['geolocation', 'notifications'],
      // Add extra HTTP headers to look more real
      extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
      },
    });

    // Inject scripts to hide automation indicators
    await context.addInitScript(() => {
      // Overwrite the `navigator.webdriver` property
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // Mock chrome object
      window.chrome = {
        runtime: {},
      };

      // Mock plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // Mock languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });

      // Permissions API mock
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters)
      );
    });

    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(60000); // Longer timeout for slow pages

    // refs: Map<string, { role, name, nth, selector }> — cached element references
    const session = { browser, context, page, timer: null, refs: new Map() };
    this.sessions.set(taskId, session);
    this._resetTimer(taskId);
    return session;
  }

  _resetTimer(taskId) {
    const session = this.sessions.get(taskId);
    if (!session) return;
    if (session.timer) clearTimeout(session.timer);
    session.timer = setTimeout(() => this.kill(taskId), SESSION_TIMEOUT_MS);
  }

  get(taskId) {
    return this.sessions.get(taskId) || null;
  }

  async kill(taskId) {
    await this._cleanup(taskId);
  }

  async _cleanup(taskId) {
    const session = this.sessions.get(taskId);
    if (!session) return;
    if (session.timer) clearTimeout(session.timer);
    try { await session.browser.close(); } catch {}
    this.sessions.delete(taskId);
  }

  async killAll() {
    const ids = [...this.sessions.keys()];
    for (const id of ids) {
      await this.kill(id);
    }
  }
}

export const browserSessionManager = new BrowserSessionManager();
