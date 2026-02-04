# Victoria Laser App Architecture

## Monorepo Structure
- `server/`: Fastify API, Drizzle ORM, SQLite database.
- `web/`: React + Vite + Tailwind UI.

## Sync Pipeline
- Source: `FEED_URL` environment variable.
- Parse feed: CSV/JSON/XML.
- Normalize fields into a consistent order shape.
- Insert with "ignore duplicates" strategy.
- Delete orders missing from the latest feed.

## Database Schema (orders)
- `orderId`: external order identifier.
- `purchaseDate`: order date/time string.
- `status`: order status.
- `customField`: user-defined field for laser workflow.
- `sku`: product SKU.
- `buyerName`: customer name.
- `raw`: original payload (JSON).

## API Endpoints
- `GET /orders?limit=&offset=&search=&hasCustomField=`:
  returns paginated orders; `search` is a substring match on `orderId`.
- `POST /sync`: fetches feed and syncs orders.
- `POST /orders/:orderId/ezcad`: builds LightBurn/EZCAD export for an order.
