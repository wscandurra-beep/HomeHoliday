import { fetchWithProxy, randomUserAgent, sleep } from '../utils/http-utils.mjs';
import * as cheerio from 'cheerio';

// Configurazione del rate limiting
const RATE_LIMIT = {
  requestsPerMinute: 10,
  minDelay: 2000, // 2 secondi tra le richieste
  maxRetries: 3,
  backoffMultiplier: 2
};

export async function fetchListings(config) {
  const listings = [];
  let currentPage = 1;
  let hasMorePages = true;
  
  while (hasMorePages && currentPage <= (config.maxPages || 3)) {
    try {
      // 1. Costruisci URL con paginazione
      const url = buildSearchUrl(config, currentPage);
      
      // 2. Effettua richiesta con proxy e user-agent rotation
      const html = await fetchWithProxy(url, {
        headers: {
          'User-Agent': randomUserAgent(),
          'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: 30000,
        retries: RATE_LIMIT.maxRetries,
        proxyConfig: config.proxyConfig // Passato dalla configurazione globale
      });
      
      // 3. Rilevazione CAPTCHA
      if (isCaptchaPage(html)) {
        console.warn(`[Casa.it] CAPTCHA rilevato per ${url}, fermo per 5 minuti`);
        await sleep(300000); // 5 minuti di pausa
        continue;
      }
      
      // 4. Parsing della pagina
      const $ = cheerio.load(html);
      const pageListings = extractListings($, config);
      
      if (pageListings.length === 0) {
        hasMorePages = false;
        break;
      }
      
      listings.push(...pageListings);
      
      // 5. Rate limiting rispettoso
      await sleep(RATE_LIMIT.minDelay + Math.random() * 1000);
      
      // 6. Controllo prossima pagina
      const nextPageUrl = $('a.next-page, a[rel="next"]').attr('href');
      if (!nextPageUrl) {
        hasMorePages = false;
      }
      
      currentPage++;
      
    } catch (error) {
      console.error(`[Casa.it] Errore durante il fetching:`, error.message);
      
      // Se è un errore 429 o 403, backoff più lungo
      if (error.status === 429 || error.status === 403) {
        console.warn(`[Casa.it] Rate limit hit, backoff di 10 minuti`);
        await sleep(600000);
      }
      
      if (error.retries >= RATE_LIMIT.maxRetries) {
        throw error;
      }
    }
  }
  
  return listings;
}

function buildSearchUrl(config, page) {
  const baseUrl = `https://www.casa.it/vendita/appartamenti/${config.location}/`;
  const params = new URLSearchParams();
  
  if (config.minPrice) params.append('prezzoMinimo', config.minPrice);
  if (config.maxPrice) params.append('prezzoMassimo', config.maxPrice);
  if (page > 1) params.append('pagina', page);
  
  // Aggiungi parametri per evitare caching
  params.append('_t', Date.now());
  
  return `${baseUrl}?${params.toString()}`;
}

function extractListings($, config) {
  const listings = [];
  
  // Selettori specifici per Casa.it (da adattare dopo analisi)
  $('.listing-item, .annuncio-item, .card-annuncio').each((index, element) => {
    const $el = $(element);
    
    // Estrai i dati
    const url = $el.find('a.listing-link, a[data-testid="listing-link"]').attr('href');
    const id = extractIdFromUrl(url);
    const title = $el.find('.listing-title, .annuncio-title').text().trim();
    const priceText = $el.find('.listing-price, .price').text().trim();
    const price = parsePrice(priceText);
    const location = $el.find('.listing-location, .localita').text().trim();
    const surfaceText = $el.find('.listing-surface, .superficie').text().trim();
    const surface = parseSurface(surfaceText);
    const roomsText = $el.find('.listing-rooms, .locali').text().trim();
    const rooms = parseInt(roomsText) || null;
    
    // Classifica venditore (Privato/Agenzia)
    const sellerType = $el.find('.agency-tag, .privato-tag').length > 0 ? 'Privato' : 'Agenzia';
    
    if (id) {
      listings.push({
        listingId: id,
        url: url.startsWith('http') ? url : `https://www.casa.it${url}`,
        title,
        price,
        location,
        surface,
        rooms,
        sellerType,
        provider: 'casa-it',
        observedAt: new Date().toISOString()
      });
    }
  });
  
  return listings;
}

function extractIdFromUrl(url) {
  if (!url) return null;
  // Pattern per estrarre ID da URL Casa.it
  const match = url.match(/\/annuncio\/([a-zA-Z0-9-]+)/) || 
                url.match(/\/listing\/(\d+)/);
  return match ? match[1] : null;
}

function parsePrice(text) {
  if (!text) return null;
  const cleaned = text.replace(/[^\d,]/g, '').replace(',', '');
  return parseInt(cleaned) || null;
}

function parseSurface(text) {
  if (!text) return null;
  const match = text.match(/(\d+)/);
  return match ? parseInt(match[1]) : null;
}

function isCaptchaPage(html) {
  // Rilevazione CAPTCHA comuni
  const patterns = [
    'captcha',
    'recaptcha',
    'cf-browser-verification',
    'accesso-negato',
    'verifica-umana'
  ];
  return patterns.some(pattern => html.toLowerCase().includes(pattern));
}

Create casa-it-public.mjs
