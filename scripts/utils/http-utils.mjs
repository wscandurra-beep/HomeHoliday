const USER_AGENTS = [
  'HomeHoliday/0.1 (+personal property tracker)',
  'Mozilla/5.0 (compatible; HomeHoliday/0.1; personal-property-tracker)'
];

export function randomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export async function fetchWithProxy(url, options = {}) {
  const {
    headers = {},
    timeout = 30000,
    retries = 2,
    retryDelay = 2000
  } = options;

  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': headers['User-Agent'] || randomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'it-IT,it;q=0.9,en;q=0.5',
          ...headers
        }
      });
      if (response.status === 403 || response.status === 429) {
        throw new Error(`Access declined: HTTP ${response.status}`);
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(retryDelay * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
