# HomeHoliday

HomeHoliday is a property scouting and monitoring application that consolidates real-estate listings into persistent trackers.

## MVP

- Search by location and price range
- Filter private sellers vs agencies
- Normalized listing model across providers
- Price per square meter
- Status tracking: `NEW`, `ACTIVE`, `UPDATED`, `REMOVED`, `BACK_ONLINE`
- Price history
- Connector architecture for multiple listing sources
- Official Immobiliare.it Insights / Realitycs connector
- Scheduled refresh workflow every 2 hours
- Responsive React interface

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
Listing store
      ↓
Trackers + UI
```

Provider-specific acquisition logic is isolated from the UI. Front-end connectors live under `src/connectors/`; scheduled server-side data acquisition lives under `scripts/connectors/`.

The scheduled worker is `scripts/refresh-listings.mjs`. The GitHub Actions workflow `.github/workflows/refresh-listings.yml` invokes it every two hours after the implementation is merged into `main`.

## Immobiliare.it integration

HomeHoliday uses the official Immobiliare.it Insights / Realitycs Comps API rather than scraping the public website.

The current connector calls:

- `POST /oauth/token` for OAuth 2.0 authentication
- `POST /comparables/fullSearchByAttribute` for individual asking listings

The production Comps API base URL is:

```text
https://comparables.realitycs.it
```

The sandbox URL is:

```text
https://sandbox-comparables.realitycs.it
```

### Required credentials

Access to the API must be enabled by Immobiliare.it Insights. Configure these GitHub Actions repository secrets:

```text
IMMOBILIARE_CLIENT_ID
IMMOBILIARE_CLIENT_SECRET
IMMOBILIARE_USERNAME
IMMOBILIARE_PASSWORD
```

Optionally configure the repository variable:

```text
IMMOBILIARE_BASE_URL=https://comparables.realitycs.it
```

If `IMMOBILIARE_BASE_URL` is not provided locally, the connector defaults to the production Comps endpoint.

Do not commit credentials to the repository.

### Tracked searches

Automated searches are configured in:

```text
config/tracked-searches.json
```

Example:

```json
[
  {
    "id": "bardonecchia-sale",
    "name": "Bardonecchia vendita",
    "provider": "immobiliare",
    "municipalityID": "<IMMOBILIARE_MUNICIPALITY_ID>",
    "contractTypeID": 1,
    "minPrice": 100000,
    "maxPrice": 350000,
    "active": true
  }
]
```

`municipalityID` is an Immobiliare.it Insights taxonomy identifier, not free text. Municipality IDs can be obtained using the official location taxonomy endpoints once API access is available.

Supported connector filters currently include municipality, minimum/maximum price, minimum/maximum surface, contract type, publication status and client type when enabled by the API account.

Results are normalized into the shared HomeHoliday listing model and include, when provided by the API, title, municipality, price, surface, rooms, source URL, publication/update date, image, seller type and address.

### Refresh behavior

The refresh workflow runs every two hours. The reconciliation engine compares each result with the previous snapshot and assigns:

- `NEW` — first observation
- `ACTIVE` — listing still present with no price change
- `UPDATED` — price changed
- `REMOVED` — previously tracked listing no longer returned
- `BACK_ONLINE` — previously removed listing appears again

Price changes are appended to `priceHistory`.

The worker deliberately skips execution when no tracked search has `active: true`. The initial Bardonecchia configuration is therefore disabled until a valid Immobiliare.it municipality ID and API credentials are available.

## Local development

```bash
npm install
npm run dev
```

To execute the scheduled data worker locally:

```bash
IMMOBILIARE_CLIENT_ID=... \
IMMOBILIARE_CLIENT_SECRET=... \
IMMOBILIARE_USERNAME=... \
IMMOBILIARE_PASSWORD=... \
node scripts/refresh-listings.mjs
```

## Data access and compliance

HomeHoliday is designed to use authorized APIs, feeds, or other explicitly permitted provider integrations. It does not implement automated scraping of Immobiliare.it.

Immobiliare.it public terms restrict commercial exploitation of information from the public site. API access and the data that may be used, retained, displayed or redistributed remain subject to the commercial agreement and permissions granted by Immobiliare.it Insights.

## Current status

The Immobiliare.it connector is implemented and wired into the two-hour worker, but live production monitoring is not yet active. Activation requires valid Immobiliare.it Insights credentials, a valid municipality taxonomy ID for each tracked area, `active: true` on the corresponding tracked search, and the credentials stored as GitHub Actions secrets.

The React UI still uses demo data independently from the scheduled repository data. Connecting the generated listing store to the UI is the next application step.

## Next milestones

1. Obtain and configure Immobiliare.it Insights credentials and municipality IDs.
2. Activate the first real tracked search and validate the API payload end-to-end.
3. Connect `data/listings.json` or a database-backed API to the React interface.
4. Add cross-platform duplicate detection.
5. Add notification rules for new listings and price drops.
6. Add additional providers behind the same connector contract.
7. Add opportunity scoring based on comparable €/m².
