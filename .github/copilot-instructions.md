# Copilot Instructions for Negadras-market

This file gives concise, repo-specific guidance to AI coding assistants to be immediately productive.

- **Architecture & Big Picture**
- **Two-tier app**: a lightweight Node/Express backend at `backend/` (provides small server-side helpers and a health endpoint) and a React + Vite frontend at `frontend/`.
- **Frontend dev server proxies `/api` to backend** via `frontend/vite.config.js` (target `http://localhost:5000`). Keep that proxy in mind when editing API paths.
- **Auth & roles**: authentication is mostly client-side using `localStorage` and the `useAuth` hook (`frontend/src/hooks/useAuth.js`). Roles: `admin`, `shop_owner`, `customer` (see `shopsData.js` for shop-owner test accounts).

**How to run (developer flows)**
- Start backend: `cd backend; npm install; npm start` (backend script runs `node server.js`). Backend uses ESM (`"type": "module"`).
- Start frontend: `cd frontend; npm install; npm run dev` (Vite dev server).
- Build/preview frontend: `cd frontend; npm run build` then `npm run preview`.
- Lint frontend: `cd frontend; npm run lint`.

**Important environment variables**
- Backend `.env` keys: `PORT` (defaults to 5000). Payment integration (Chapa) has been removed from this repo; do NOT add secret keys here unless you plan to reintroduce a server-side payment integration.

- **Key files & what they show (use these as examples)**
- `backend/server.js` — lightweight backend with a health route `/api/health`. Chapa/payment endpoints were removed; add new server routes following the small-handler try/catch JSON response pattern.
- `frontend/vite.config.js` — dev proxy configuration (`/api` → `http://localhost:5000`).
- `frontend/src/hooks/useAuth.js` — primary auth flow: login/register/reset uses `localStorage`; `admin` master account hard-coded (`admin/admin123`) for dev/testing. Use this when implementing auth-related UI/logic.
- `frontend/src/contex/AppContext.js` — global app state via `useReducer` (actions: `SET_USER`, `SET_CART`). Prefer using this central pattern for app-wide state changes.
- `frontend/src/data/shopsData.js` — sample shops + shop owner credentials used by `useAuth` for shop-owner login.
- `frontend/src/App.jsx` — routing and role-based route guards (`isAdmin || isShopOwner` checks) and examples of navigation / route protection.

**Conventions & patterns to follow**
- Minimal backend: backend contains only small helpers and proxy-like endpoints for third-party services when necessary — prefer keeping secrets on the server, not in frontend code.
- Client-side persistence: accounts/customers are stored in `localStorage` (search for `localStorage.getItem("customers")`). When changing data formats, migrate read/writes consistently.
- Dev-only credentials: `admin/admin123` and shop owner credentials in `shopsData.js` are for local/dev only — do not commit production secrets.
- Error handling: return consistent JSON shapes from backend handlers (use try/catch and include status/message). If adding external integrations, follow patterns used in server routes for error responses.

**Integration points / cross-component notes**
- Frontend-to-backend: all frontend API calls should target `/api/...` to respect the Vite proxy during development.
- Role checks: UI and routing use `useAuth` flags (`isAdmin`, `isShopOwner`, `isCustomer`) — update these values consistently whenever user state changes.

**When you edit code, practical tips**
- If adding server routes, follow the current small-handler style (async handler, try/catch, consistent JSON error responses).
- If changing auth storage shape in `localStorage`, update `useAuth` load/save logic and search for direct `localStorage` reads in the codebase.
- When modifying UI routes in `App.jsx`, preserve the existing role-guard pattern (use `Navigate` to redirect unauthorized users).

**Files to inspect for context when making changes**
- `backend/server.js`, `backend/package.json`
- `frontend/vite.config.js`, `frontend/package.json`, `frontend/README.md`
- `frontend/src/hooks/useAuth.js`, `frontend/src/contex/AppContext.js`, `frontend/src/data/shopsData.js`, `frontend/src/App.jsx`

If anything here is unclear or you want a different level of detail (sample PR message conventions, tests to add, or CI hooks), tell me which area to expand. I can iterate on this file.
