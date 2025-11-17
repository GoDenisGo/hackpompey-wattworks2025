# Power Consumption comparison based on the ⚡ React + Vite Starter Kit (SSEN NERDA)

This application compares estimated power consumption between Portsmouth and Southampton and lets you compare individual BSPs using the SSEN NERDA API. It fetches substation metadata, extracts LineCurrent measurements, computes instantaneous power (P = sqrt(3) × V × I × PF), and presents per-capita metrics plus simple 24‑hour averages for selected BSPs.

---

## 🚀 Getting Started

### **1. Install dependencies**

Use **any** of the three supported runtimes:

#### **npm**
```bash
npm i
npm run dev
```

#### **pnpm**
```bash
pnpm i
pnpm dev
```

#### **bun**
```bash
bun i
bun run dev
```

Node **v24.5.0 or higher** is required.

---

## 🔑 Add Your NERDA API Token

1. Visit: **https://nerda.ssen.co.uk/nerda**
2. Create an account and log in
# ⚡ SSEN NERDA — React + Vite Starter

This lightweight app demonstrates using SSEN's NERDA endpoints to compute and compare power consumption. It's intentionally small and uses React + Vite + TanStack Query for data fetching.

Highlights in this fork
- Per-city (Portsmouth / Southampton) estimated instantaneous power and per-capita metrics
- BSP discovery (paginated) with two dropdowns to compare BSPs by estimated instantaneous power and 24h average
- Uses the dev-time Vite proxy (requests are made to `/api/*` so the dev proxy can inject an Authorization header)

---

## Quick start

Install and run (pick your package manager):

npm
```bash
npm install
npm run dev
```

pnpm
```bash
pnpm install
pnpm dev
```

Node 18+ should be fine; this project was developed with modern Node and Vite.

---

## Dev proxy & Authorization

During development the app talks to the upstream NERDA host through a Vite dev proxy. That proxy injects an Authorization header for you. Edit `vite.config.ts` and add your token into the proxy headers. Example shape:

```ts
// vite.config.ts (excerpt)
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'https://nerda.hackathons.dev', // forwarded upstream in dev
        changeOrigin: true,
        headers: {
          Authorization: 'Bearer <YOUR_SHORT_LIVED_TOKEN>'
        },
        rewrite: (path) => path // keep /api prefix
      }
    }
  }
})
```

Replace `<YOUR_SHORT_LIVED_TOKEN>` with the token you obtained from the NERDA service (short-lived tokens are expected). Restart the dev server after editing.

---

## What the app does

- Fetches static metadata from `/api/ApiNerdaStatic` for configured substation lists (Portsmouth and Southampton). Uses those to compute an estimated instantaneous power using P = sqrt(3) * V * I * PF.
- Fetches LineCurrent measurements from `/api/ApiNerdaAfter?measurement=...&after=...` and extracts current (A) values. Only measurements explicitly labelled as LineCurrent are used.
- Computes simple 24h averages by reading measurement histories (sample average of available samples).
- Provides a BSP discovery endpoint (`/api/getpaginatedsub?=&type=BSP&region=england&offset=0`) — pages are size 30 — the app will page through results and populate two dropdowns so you can compare any two BSPs by UUID.

---

## UI

- City comparison (Portsmouth vs Southampton) appears at the top, showing estimated power (kW), estimated energy per hour (kWh), and per-capita metrics.
- BSP compare section: two dropdowns (name — UUID). After selecting BSP A and BSP B the app fetches their substation metadata and measurements and shows:
  - estimated instantaneous power (kW)
  - estimated 24h average (kW)
  - per-line details (expandable)

---

## Performance & behaviour

- Fetching histories for 24h averages will generate extra network requests (one history request per measurement id). Expect delays when comparing BSPs with many lines.
- The dev proxy only applies in development. For production you must configure a server-side proxy or supply an Authorization mechanism appropriate for your deployment.

---

