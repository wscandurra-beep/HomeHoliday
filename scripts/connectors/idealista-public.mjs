import { fetchWithProxy, randomUserAgent, sleep } from '../utils/http-utils.mjs';
import * as cheerio from 'cheerio';

const RATE_LIMIT = {
  requestsPerMinute: 10,
  minDelay: 2000,
  maxRetries: 3
};

export async function fetchListings(config) {
  const listings = [];
  let currentPage = 1;
  let hasMorePages = true;
  
  while (hasMorePages && currentPage <= (config.maxPages || 3)) {
    try {
      const url = buildSearchUrl(config, currentPage);
      
      const html = await fetchWithProxy(url, {
        headers: {
          'User-Agent': randomUserAgent(),
          'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        timeout: 30000,
        retries: RATE_LIMIT.maxRetries,
        proxyConfig: config.proxyConfig
      });
      
      const $ = cheerio.load(html);
      const pageListings = extractListings($, config);
      
      if (pageListings.length === 0) {
        hasMorePages = false;
        break;
      }
      
      listings.push(...pageListings);
      await sleep(RATE_LIMIT.minDelay + Math.random() * 1000);
      
      currentPage++;
      
    } catch (error) {
      console.error(`[Idealista] Errore:`, error.message);
      if (error.retries >= RATE_LIMIT.maxRetries) throw error;
    }
  }
  
  return listings;
}

function buildSearchUrl(config, page) {
  const baseUrl = `https://www.idealista.it/vendita-appartamenti/${config.location}/`;
  const params = new URLSearchParams();
  if (config.minPrice) params.append('prezzoMinimo', config.minPrice);
  if (config.maxPrice) params.append('prezzoMassimo', config.maxPrice);
  if (page > 1) params.append('pagina', page);
  return `${baseUrl}?${params.toString()}`;
}

function extractListings($, config) {
  const listings = [];
  
  $('.item-multimedia, .item-container, .listing-item').each((index, element) => {
    const $el = $(element);
    // Adatta questi selettori con quelli reali di Idealista
    const url = $el.find('a.item-link').attr('href');
    const id = url?.match(/\/inmueble\/(\d+)/)?.[1];
    const title = $el.find('.item-title').text().trim();
    const priceText = $el.find('.item-price').text().trim();
    const price = parsePrice(priceText);
    const location = $el.find('.item-location').text().trim();
    
    if (id) {
      listings.push({
        listingId: id,
        url: url?.startsWith('http') ? url : `https://www.idealista.it${url}`,
        title,
        price,
        location,
        sellerType: 'Agenzia', // Da classificare
        provider: 'idealista',
        observedAt: new Date().toISOString()
      });
    }
  });
  
  return listings;
}

function parsePrice(text) {
  if (!text) return null;
  const cleaned = text.replace(/[^\d,]/g, '').replace(',', '');
  return parseInt(cleaned) || null;
}
