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

Provider-specific acquisition logic belongs under `src/connectors/`. A connector must return the shared `Listing` model defined in `src/types.ts`.

The scheduled worker is `scripts/refresh-listings.mjs`. The GitHub Actions workflow `.github/workflows/refresh-listings.yml` invokes it every two hours after the feature branch is merged into `main`.

## Local development

```bash
npm install
npm run dev
```

## Current limitation

The current connector is demo-only. No third-party property portal is scraped or queried yet. Real providers should be connected through an authorized API/feed or another permitted acquisition method, without coupling provider-specific logic to the UI.

## Next milestones

1. Persist user-created trackers.
2. Add the first real property data connector.
3. Store consolidated listings outside the repository once volume grows.
4. Add cross-platform duplicate detection.
5. Add notification rules for new listings and price drops.
6. Add opportunity scoring based on comparable €/m².
