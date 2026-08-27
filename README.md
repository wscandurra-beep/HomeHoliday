# HomeHoliday

HomeHoliday is a personal property scouting and monitoring application that consolidates real-estate listings into persistent trackers.

## MVP

- Search by location and price range
- Filter private sellers vs agencies
- Normalized listing model across providers
- Price per square meter
- Status tracking: `NEW`, `ACTIVE`, `UPDATED`, `REMOVED`, `BACK_ONLINE`
- Price history
- Connector architecture for multiple listing sources
- Public Immobiliare.it tracker for personal use
- Optional official Immobiliare.it Insights / Realitycs connector
- Scheduled refresh workflow every 2 hours
- Responsive React interface published with GitHub Pages
- Flag e note sincronizzabili fra dispositivi con Supabase Auth

## Architecture

```text
Property sources
      ↓
Connectors
      ↓
Normalizer
      ↓
Reconciliation / status engine
      ↓
public/data/listings.json
      ↓
React UI / GitHub Pages
```

Scheduled acquisition lives under `scripts/connectors/`. The worker `scripts/refresh-listings.mjs` runs every two hours through `.github/workflows/refresh-listings.yml`.

## Immobiliare.it public tracker

The active MVP connector is `scripts/connectors/immobiliare-public.mjs`. It reads only configured public search-result pages and does not log in, solve CAPTCHAs, rotate identities or bypass access controls.

The initial active tracker monitors Bardonecchia apartments for sale between €100,000 and €350,000. Configuration is stored in `config/tracked-searches.json`:

```json
[
  {
    "id": "bardonecchia-sale-public",
    "name": "Bardonecchia vendita",
    "provider": "immobiliare-public",
    "location": "Bardonecchia",
    "searchUrl": "https://www.immobiliare.it/vendita-appartamenti/bardonecchia/",
    "privateSearchUrl": "https://www.immobiliare.it/vendita-appartamenti/bardonecchia/da-privati/",
    "minPrice": 100000,
    "maxPrice": 350000,
    "maxPages": 3,
    "active": true
  }
]
```

The connector adds Immobiliare.it's public `prezzoMinimo`, `prezzoMassimo` and `pag` parameters, so it queries only the configured price range and a bounded number of result pages. The separate public private-seller search is used to classify matching listing IDs as `Privato`; other matching results are classified as `Agenzia`.

If Immobiliare.it returns HTTP 403 or 429, the connector stops and reports the failure. It intentionally does not try to evade those controls.

## Refresh behavior

Every two hours the worker compares the new snapshot with the previous one and assigns:

- `NEW` — first observation
- `ACTIVE` — listing still present with no price change
- `UPDATED` — price changed
- `REMOVED` — previously tracked listing no longer returned
- `BACK_ONLINE` — previously removed listing appears again

Price changes are appended to `priceHistory`. The store is written to `public/data/listings.json`. Because it is under `public/`, Vite includes it in the GitHub Pages deployment. The UI loads this file directly; demo data are used only when the store is empty or unavailable.

A refresh commit on `main` also triggers the Pages deployment workflow, so new tracker data become visible on the site automatically.

## Gmail property alerts

HomeHoliday can import the alert emails sent by Casa.it, Immobiliare.it and Idealista without using ChatGPT or an AI service. The workflow [`.github/workflows/import-gmail-alerts.yml`](.github/workflows/import-gmail-alerts.yml) runs once a day at 18:07 in the `Europe/Rome` timezone and can also be started manually.

The importer:

- uses the Gmail API with the read-only `gmail.readonly` scope;
- searches only messages from the three configured portals;
- keeps provider, title, location, price, surface, rooms, receipt date, stable provider ID and canonical URL;
- rejects listings above the configured maximum price;
- never stores Gmail message bodies, OAuth tokens or tracking URLs in the repository;
- hashes processed Gmail message IDs to make repeated runs idempotent;
- preserves `firstSeenAt`, `lastSeenAt` and `priceHistory`;
- runs the parser and deduplication tests before committing data to `main`.

Immobiliare.it tracking links are followed only on the approved `clicks.immobiliare.it` host. A listing is accepted only when a numeric ID can be verified and normalized as `https://www.immobiliare.it/annunci/<ID>/`. Ambiguous links are recorded, without their tracking URL, in `config/gmail-unresolved.json` and no ID is invented.

### One-time Gmail authorization

1. In Google Cloud create an OAuth client for a desktop application and enable the Gmail API.
2. Set the client values locally, then run the authorization helper:

   ```bash
   GMAIL_CLIENT_ID="..." GMAIL_CLIENT_SECRET="..." npm run gmail:authorize
   ```

3. Open the printed Google authorization URL and grant read-only access to `onenooneonethousand@gmail.com`.
4. In **GitHub → Settings → Secrets and variables → Actions**, create these repository secrets:

   ```text
   GMAIL_CLIENT_ID
   GMAIL_CLIENT_SECRET
   GMAIL_REFRESH_TOKEN
   ```

The scheduled workflow skips cleanly until all three secrets are configured. Secrets and tokens must never be placed in `.env.example`, committed files, repository variables or workflow logs.

## Official Immobiliare.it Insights connector

The previous official connector remains available as `scripts/connectors/immobiliare-insights.mjs`. It uses the Immobiliare.it Insights / Realitycs API with OAuth credentials and can be re-enabled later by adding a tracker with `provider: "immobiliare"` and configuring the required GitHub Secrets.

## Local development

```bash
npm install
npm run dev
```

Run the tracker manually with:

```bash
node scripts/refresh-listings.mjs
```

No API credentials are required for the currently active public tracker.

## Sincronizzazione fra dispositivi con Supabase

Flag e note restano sempre salvati anche nel browser. Collegando Supabase vengono inoltre sincronizzati sul cloud per l'utente autenticato. L'accesso avviene tramite magic link email, senza password: **Accedi** è riservato alle email già registrate, mentre **Registrati** crea un nuovo account. Al primo accesso le annotazioni locali già presenti vengono trasferite automaticamente.

1. Crea un progetto su Supabase.
2. Apri **SQL Editor** ed esegui in ordine i file [`202608230001_create_property_annotations.sql`](supabase/migrations/202608230001_create_property_annotations.sql) e [`202608230002_add_shared_workspaces.sql`](supabase/migrations/202608230002_add_shared_workspaces.sql). Le tabelle usano Row Level Security: soltanto i membri di un gruppo possono leggerne e modificarne le annotazioni.
3. In **Authentication → URL Configuration** imposta come Site URL e Redirect URL:

   ```text
   https://wscandurra-beep.github.io/HomeHoliday/
   ```

4. In GitHub apri **Settings → Secrets and variables → Actions → Variables** e crea:

   ```text
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

5. Avvia nuovamente il workflow **Deploy HomeHoliday to GitHub Pages**.

La publishable key può essere inclusa nel frontend perché l'accesso ai dati è protetto dalle policy RLS. Non inserire mai una `secret` key o la `service_role` key nel repository o nelle variabili Vite.

Per lo sviluppo locale copia `.env.example` in `.env.local`, compila i due valori e avvia `npm run dev`.

### Gruppi condivisi

Dopo l'accesso ogni utente dispone di uno spazio personale. Per condividere flag e note fra email diverse:

1. crea un gruppo dall'area **Sincronizzazione e condivisione**;
2. genera un codice di invito monouso, valido per sette giorni;
3. comunica il codice alla seconda persona;
4. la seconda persona accede con la propria email e inserisce il codice in **Entra in un gruppo**.

Il proprietario può vedere i partecipanti e rimuovere i membri. Ogni gruppo mantiene annotazioni e cache locale separate.

## Data access and use

The public connector is intended for low-frequency, personal monitoring. It stores a compact subset of listing information needed by HomeHoliday: listing ID/link, price, location, approximate surface/rooms when detectable, seller classification and observation history. It links back to the original Immobiliare.it listing instead of reproducing the full listing content.

The connector is intentionally conservative: three result pages by default, one scheduled run every two hours, no login automation, no access-control circumvention and no high-frequency crawling.

## Current status

- HomeHoliday is published through GitHub Pages.
- The React UI reads `public/data/listings.json`.
- Bardonecchia €100k–€350k public monitoring is active in configuration.
- The refresh Action runs every two hours and can also be started manually from GitHub Actions.

## Next milestones

1. Validate the first public refresh payload end-to-end.
2. Improve extraction of title, surface and agency name where available.
3. Add cross-platform duplicate detection.
4. Add notification rules for new listings and price drops.
5. Add additional providers behind the same connector contract.
6. Add opportunity scoring based on comparable €/m².
