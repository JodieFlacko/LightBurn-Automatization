# Victoria Laser App (Amazon Orders Feed Importer)

A specialized automation tool that synchronizes orders from Amazon/E-commerce feeds, manages laser engraving workflows, and automates LightBurn project generation.

## Features
* **Dual-Side Support:** Manages Front and Retro (Back) engraving queues separately.
* **Smart Sync:** Imports orders from CSV, XML, or JSON feeds.
* **Rule Engine:** Configurable mapping of SKUs to Templates and Keywords to Assets (Images/Fonts).
* **LightBurn Automation:** Automatically generates `.lbrn2` files with customer data injected.
* **Error Recovery:** Robust retry logic, configuration error hints, and rework management.

## Project Structure
This is a monorepo containing:
* `server/`: Node.js/Fastify backend with SQLite database.
* `web/`: React frontend built with Vite.
    * *Note:* The frontend builds into `server/public/`, which is served by the backend in production.

## Prerequisites
* Node.js (v18+)
* pnpm (v9+)
* **LightBurn** installed at default path (Windows) for automation features.

## Development Setup

1.  **Install Dependencies**
    ```bash
    pnpm install
    ```

2.  **Environment Configuration**
    You must create the environment file as it is not committed to the repository.
    Create a `.env` file in the `server/` directory based on the example:
    ```bash
    cp server/.env.example server/.env
    ```
    *Edit `server/.env` to point `FEED_URL` to your local file or URL.*

3.  **Generate Build Artifacts**
    The `server/public` directory is ignored by git. You must build the frontend once so the server has a folder to serve (even in dev mode):
    ```bash
    pnpm build
    ```

4.  **Database Setup**
    The SQLite database (`server/db.sqlite`) is ignored by git. You must initialize it locally:
    ```bash
    pnpm --filter server db:generate
    pnpm --filter server db:migrate
    # Optional: Seed with sample data
    pnpm --filter server seed
    ```

5.  **Run Development Server**
    Start both backend and frontend concurrently:
    ```bash
    pnpm dev
    ```
    * **Frontend (Vite):** `http://localhost:5173` (Use this for development)
    * **Backend (API):** `http://localhost:3001`

## Workflow Guide

### 1. Sync Orders
Click the **Sync** button in the header. This pulls the latest orders from your configured feed. New orders appear in the "To Do" list.

### 2. Configuration (First Run)
If orders show a "Configuration Error" (Orange badge):
1.  Go to **Settings**.
2.  Add a **Template Rule** mapping the SKU (e.g., `LSR-01`) to a template file.
3.  Add **Asset Rules** if you want to detect keywords like "Red" or "Logo" and map them to specific colors or image files.

### 3. Processing
1.  Locate an order in the list.
2.  Click **"Send to LightBurn"** on the **Action Fronte** column.
3.  LightBurn will open with the generated file.
4.  Once verified/printed, the status updates to "Printed".
5.  If a Retro side is required, repeat for the **Action Retro** column.

## Troubleshooting
* **Server crashes on start:** Ensure you ran `pnpm build` so the `server/public` directory exists.
* **LightBurn not launching:** Ensure LightBurn is installed at `C:\Program Files\LightBurn\LightBurn.exe`.
* **Database Reset:** Delete `server/db.sqlite` and re-run migrations to start fresh.