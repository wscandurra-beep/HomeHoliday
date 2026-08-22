class ProxyManager {
  constructor(config) {
    this.proxies = [];
    this.failedProxies = new Set();
    this.currentIndex = 0;
    this.config = config;
  }
  
  async loadProxies() {
    // Carica da configurazione o servizio esterno
    if (this.config.proxyList) {
      this.proxies = this.config.proxyList.map(url => ({ url, failures: 0 }));
    } else if (this.config.proxyService) {
      // Ottieni proxy da servizio (es. BrightData API)
      this.proxies = await this.fetchFromService(this.config.proxyService);
    }
  }
  
  getNextProxy() {
    if (this.proxies.length === 0) return null;
    
    // Trova un proxy funzionante
    let attempts = 0;
    while (attempts < this.proxies.length) {
      const proxy = this.proxies[this.currentIndex % this.proxies.length];
      this.currentIndex++;
      
      if (!this.failedProxies.has(proxy.url)) {
        return proxy.url;
      }
      attempts++;
    }
    
    // Tutti i proxy sono falliti
    console.warn('Nessun proxy funzionante disponibile');
    return null;
  }
  
  markProxyFailed(proxyUrl) {
    this.failedProxies.add(proxyUrl);
    console.warn(`Proxy ${proxyUrl} marcato come fallito`);
  }
}
