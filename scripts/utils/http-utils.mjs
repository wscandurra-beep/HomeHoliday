import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
];

export function randomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export async function fetchWithProxy(url, options = {}) {
  const {
    headers = {},
    timeout = 30000,
    retries = 3,
    proxyConfig = null,
    retryDelay = 2000
  } = options;
  
  let lastError = null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const axiosConfig = {
        url,
        method: 'GET',
        headers: {
          ...headers,
          'User-Agent': headers['User-Agent'] || randomUserAgent()
        },
        timeout,
        validateStatus: (status) => status < 500
      };
      
      if (proxyConfig?.active && proxyConfig?.url) {
        const proxyAgent = new HttpsProxyAgent(proxyConfig.url);
        axiosConfig.httpsAgent = proxyAgent;
        axiosConfig.httpAgent = proxyAgent;
        axiosConfig.proxy = false;
      }
      
      const response = await axios(axiosConfig);
      
      if (response.status === 429 || response.status === 403) {
        throw new Error(`Rate limit: ${response.status}`);
      }
      
      if (response.status >= 400) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      
      return response.data;
      
    } catch (error) {
      lastError = error;
      console.warn(`[fetchWithProxy] Tentativo ${attempt}/${retries} fallito per ${url}`);
      
      if (attempt < retries) {
        const delay = retryDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
