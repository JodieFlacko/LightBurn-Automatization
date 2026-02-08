# Victoria Laser App Architecture

## Monorepo Structure
- `server/`: Fastify API, Drizzle ORM, SQLite database (`db.sqlite` is git-ignored).
- `web/`: React + Vite + Tailwind UI source code.
    - *Build Output:* Compiles to `server/public/` (git-ignored), which is served by Fastify as static assets in production.

## Core Concepts
### 1. Dual-Side Processing
The app now treats every order as having two potential sides: **Front** (`fronte`) and **Retro** (back).
- **Front:** Always required.
- **Retro:** Conditional. The system checks `template_rules` to see if a specific SKU requires a retro template.
- **Overall Status:** Calculated based on the status of both sides. An order is only "Printed" when both required sides are done.

### 2. Rule Engine
Instead of hardcoding logic, the app uses database-driven rules:
- **Template Rules:** Matches SKU patterns (e.g., "MUG-") to specific `.lbrn2` template files.
- **Asset Rules:** Scans the `customField` text for keywords (e.g., "Red", "Skull") to inject specific images, fonts, or colors.

## Sync Pipeline
1. **Fetch:** Pulls data from `FEED_URL` (CSV/XML/JSON).
2. **Normalize:** Maps incoming fields to a standard schema.
3. **Insert/Update:** - New orders are inserted as `pending`.
   - Existing orders are skipped (idempotent).
   - Orders no longer in the feed are deleted.
4. **Retro Detection:** Post-sync, the system checks all new orders against `template_rules` to determine if `retroStatus` should be set to `pending` or `not_required`.

## Database Schema (SQLite)

### `orders` Table
Tracks the lifecycle of the order.
- **Identifiers:** `orderId` (Amazon ID), `sku`, `buyerName`.
- **Content:** `customField` (user input), `raw` (original JSON).
- **Overall Status:** `status` (pending, processing, printed, error).
- **Side Statuses:** - `fronteStatus`, `fronteErrorMessage`, `fronteAttemptCount`.
  - `retroStatus`, `retroErrorMessage`, `retroAttemptCount`.

### `template_rules` Table
Maps SKUs to LightBurn files.
- `skuPattern`: string to match (e.g., "LSR-MARK").
- `templateFilename`: file in `server/templates/`.
- `priority`: integer (higher number = higher priority).

### `asset_rules` Table
Maps keywords to design assets.
- `triggerKeyword`: word to search for in `customField`.
- `assetType`: `image`, `font`, or `color`.
- `value`: filename, font name, or hex code.

## LightBurn Integration
1. **Template Selection:** Finds best matching `.lbrn2` file based on SKU rules.
2. **Injection:** - Parses XML template.
   - Injects Customer Name into `Shape[Name="{{CUSTOMER_NAME}}"]`.
   - Injects Images (with "Magic Fix" for LightBurn compatibility) into `Shape[Name="{{DESIGN_IMAGE}}"]`.
3. **Execution:** Uses `cmd.exe` to launch LightBurn with the generated project file.
4. **Verification:** Checks file size and existence before confirming success.