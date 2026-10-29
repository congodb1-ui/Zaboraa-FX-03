# Risk Firewall, Supabase Auth & RBAC, Shared PriceChart & Design System

Comprehensive architectural blueprint for establishing Supabase-backed authentication, dual-mode token verification, object-level RBAC, QuickJS-sandboxed strategy execution, server-side Risk Firewall with hard ceilings and 422 remediation, high-performance Canvas `<PriceChart>` (25 indicators), and universal dual-theme design system rollout.

> [!IMPORTANT]
> **Key Architecture Decisions & Gated Delivery Pipeline**:
> 1. **Four Gated Delivery Stages**:
>    - **Stage 1a (Auth, RBAC & MFA)**: Runtime config `GET /api/auth/config`, dual-mode token verification (JWKS RS256/ES256, `SUPABASE_JWT_SECRET` HS256, and `getUser` fallback), real route-allowlist with route-inventory test, Supabase migrations (`profiles`, `custom_roles`, `role_permissions`, default `'pending'`), bootstrap, object-level account authorization (`objectAuth.test.ts`), hashed one-time MFA recovery codes, and emergency CLI reset script (`npm run admin:reset-mfa`).
>    - **Stage 1b (Risk Firewall & QuickJS Sandbox)**: `risk_firewall_settings` & `risk_firewall_state` tables, server hard ceilings, 422 rejection protocol with calculated suggested lots, atomic `in_progress` idempotency with broker reconciliation, append-only audit hash chain, and QuickJS WASM sandbox with 50ms per-bar CPU limits, memory caps, and strategy regression parity testing.
>    - **Stage 2 (Shared PriceChart Phase 1)**: Canvas `<PriceChart>` on Technical Analysis with dynamic CSS token sampling on theme change, 25 pure indicators verified against committed fixtures (`scripts/generate-indicator-fixtures.ts`), adjustable MAs, SQLite layout persistence (`owner_id`), and separate benchmarks for indicator computation vs visible-range draw prep ($\le 16.6\text{ms}$).
>    - **Stage 3 (Universal Design System Rollout)**: Centralized semantic tokens, `src/components/ui/` library, and migration of all 12 views with automated zero-hardcoded-hex verification.
>    - *Each stage is strictly gated by running `tsc --noEmit`, automated Vitest suites, and `npm run build`.*
> 2. **Runtime Auth Configuration**: `GET /api/auth/config` delivers `supabaseUrl` and `supabaseAnonKey` dynamically to the browser client, eliminating duplicate `VITE_` variables while strictly hiding `SUPABASE_SERVICE_ROLE_KEY`.
> 3. **Dual-Mode JWT Verification**: Inspects token `alg` header: uses JWKS for RS256/ES256 asymmetric signatures; uses `SUPABASE_JWT_SECRET` for HS256 symmetric signatures; falls back to `supabase.auth.getUser(token)` if local validation fails.
> 4. **Route Inventory Test**: Inspects Express router stack and fails automated test suite if any registered route is neither on the explicit public allowlist nor protected by `requireAuth`.
> 5. **Atomic Idempotency Protocol**: Inserts order key as `in_progress` atomically prior to calling MT5 bridge; concurrent requests receive `409 Conflict` ("Request in progress"); caches only final fills and reconciles pending requests with the broker.
> 6. **Append-Only Hash Chain**: Audit records in `risk_firewall_audit` incorporate cryptographic hash chaining (`prev_hash` + SHA-256 `hash`) and SQLite triggers prohibiting `UPDATE` and `DELETE`.

---

### System Architecture & Security Perimeter

```
┌────────────────────────────────────────────────────────────────────────┐
│                         CLIENT (React 19 + Vite)                       │
│ - Fetches config dynamically from GET /api/auth/config                 │
│ - Supabase Client SDK initialized at runtime (no VITE_ duplication)    │
│ - AuthContext & Views: Login, TOTP MFA Enrollment & Recovery Codes     │
│ - Master Admin UI: "Preview as" role simulation (visual only)          │
│ - Trading Desk: 422 Rejection Remediation & "Reduce to X lots" button  │
│ - Technical Analysis: <PriceChart> with Canvas & 25 indicators         │
│ - Design System: CSS Variables (--bg, --surface, --text, --primary)    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Authorization: Bearer <JWT>
                                    │ X-Idempotency-Key: <UUID>
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         NODE.JS / EXPRESS 5 BACKEND                    │
│ - Public Allowlist: /api/auth/config, /api/health, /api/technical/*,   │
│   /api/fundamentals/*, /api/smartmoney/* (all other routes return 503) │
│ - Route Inventory Guard: fails build if route is unprotected           │
│ - Dual-Mode JWT Auth: JWKS (RS256/ES256) + Secret (HS256) + getUser    │
│ - MFA Guard: checks 'aal2' claim when MASTER_REQUIRE_MFA=true          │
│ - Object-Level Auth: verifies user assigned to target accountId        │
│ - Privilege Escalation Guard: prevents admins granting higher rights   │
│ - Atomic Idempotency: in_progress state, 409 conflict, broker recon    │
│ - Risk Firewall Evaluator: reads risk_firewall_settings & state tables │
│ - Order Remediation: returns 422 with calculated suggested safe lots   │
│ - Strategy Isolation: QuickJS WASM (50ms/bar, memory ceiling, no I/O)  │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
                    ▼                                ▼
┌──────────────────────────────────────┐   ┌─────────────────────────────┐
│          SUPABASE (Remote)           │   │      SQLITE (Local Host)    │
│ - auth.users (Credentials & TOTP)    │   │ - risk_firewall_settings    │
│ - public.profiles (RLS enforced):    │   │ - risk_firewall_state (PK)  │
│   user_id, email, role, status       │   │ - risk_firewall_audit       │
│ - custom_roles & role_permissions    │   │   (append-only hash chain)  │
│   (seeded: master_admin, admin,      │   │ - blocked_orders_log        │
│    trader, viewer; default: pending) │   │   (append-only trigger)     │
│ - JWKS endpoint (public keys)        │   │ - user_mfa_recovery_codes   │
│                                      │   │ - idempotency_keys (TTL)    │
│                                      │   │ - user_account_assignments  │
│                                      │   │ - chart_layouts (owner_id)  │
└──────────────────────────────────────┘   └─────────────────────────────┘
```

---

## 1. Stage 1a: Authentication, RBAC, MFA & Route Allowlist

### Environment Configuration & Runtime Bootstrap
- Simplified `.env.example`:
  ```env
  # Supabase Cloud Authentication & RBAC
  SUPABASE_URL=https://your-project.supabase.co
  SUPABASE_ANON_KEY=eyJhbGciOi...
  SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...  # SERVER ONLY: Never sent to client or bundled
  SUPABASE_JWT_SECRET=optional_hs256_secret
  MASTER_ADMIN_EMAIL=admin@zaboraa.com     # Bootstrap initial Master Admin
  MASTER_REQUIRE_MFA=true                  # Enforces aal2 claim in production
  ```
- **Runtime Auth Config**: Endpoint `GET /api/auth/config` returns:
  ```json
  { "configured": true, "supabaseUrl": "https://...", "supabaseAnonKey": "eyJ..." }
  ```
  If unconfigured, returns `{ "configured": false }`. `SUPABASE_SERVICE_ROLE_KEY` is strictly excluded.

### Fail-Closed Allowlist & Route Inventory Test
- **Unconfigured Mode**: Only explicit allowlist endpoints respond:
  - `GET /api/health`
  - `GET /api/auth/config`
  - `GET /api/technical/analysis`
  - `GET /api/technical/candles`
  - `GET /api/fundamentals/cot`
  - `GET /api/fundamentals/macro`
  - `GET /api/smartmoney/*`
- All other routes (e.g. `GET /api/strategies`, `GET /api/backtests`, `GET /api/data/export`, all `POST`/`PUT`/`DELETE`, all AI routes) return HTTP `503 AUTH_NOT_CONFIGURED`.
- **Route Inventory Test (`routeInventory.test.ts`)**: Reflects on Express router stack to guarantee that 100% of non-allowlisted routes have `requireAuth` applied.

### Dual-Mode Token Verification
- Inspects JWT header:
  - If `alg === 'RS256'` or `alg === 'ES256'`: verifies using Supabase project JWKS (`/.well-known/jwks.json`).
  - If `alg === 'HS256'`: verifies using `SUPABASE_JWT_SECRET`.
  - Fallback: invokes `supabase.auth.getUser(token)` via Supabase client.
- Caches verified role/status for 60 seconds; invalidates immediately on administrative role or status change.

### MFA Enrollment & Hashed Server-Side Recovery Codes
- **TOTP Enrollment**: User scans QR code from `supabase.auth.mfa.enroll`, inputs 6-digit token, and activates MFA.
- **One-Time Recovery Codes**: Server generates 8 alphanumeric codes, stores SHA-256 hashes in `user_mfa_recovery_codes`, and returns plaintext codes once to the user for safe-keeping.
- **Emergency CLI Reset**: `scripts/reset-admin-mfa.ts` (`npm run admin:reset-mfa -- <email>`):
  - Uses `SUPABASE_SERVICE_ROLE_KEY` to delete MFA factors for a locked Master Admin account directly via Supabase Admin API.

### Object-Level Authorization (`objectAuth.test.ts`)
- Table `user_account_assignments` maps `user_id` to `accountId`.
- Every order, position closure, bot control, and kill switch verifies target account access. Unassigned users receive HTTP `403 Forbidden`.

### Supabase Migrations (`supabase/migrations/20261029000000_auth_rbac.sql`)
- Creates `public.profiles` (`user_id uuid primary key references auth.users`, `email text`, `role text default 'pending'`, `status text default 'active'`, `created_at timestamptz`).
- Creates `public.custom_roles` and `public.role_permissions`.
- Seeds built-in roles: `master_admin`, `admin`, `trader`, `viewer`. Default role for new signups: `'pending'`.
- RLS Policies: Users can read only their own profile. No browser writes. Only service role can modify roles.

---

## 2. Stage 1b: Risk Firewall, Atomic Idempotency & QuickJS Sandbox

### Database Architecture & SQLite Schema (`src/db/sqlite.ts`)
- Backup of `data/zaboraa.sqlite` to `data/backups/zaboraa_pre_firewall_<timestamp>.sqlite`.
- **Table `risk_firewall_settings`**:
  - `scope` TEXT (`'global:demo'`, `'global:live'`, or `accountId`)
  - `key` TEXT, `value` TEXT, `updated_by` TEXT, `updated_at` TEXT
  - `PRIMARY KEY (scope, key)`
- **Table `risk_firewall_state`**:
  - `scope` TEXT PRIMARY KEY
  - `enabled` INTEGER NOT NULL DEFAULT 1
  - `disabled_at` TEXT, `disabled_until` TEXT, `disabled_by` TEXT, `reason` TEXT
- **Table `risk_firewall_audit` (Append-Only Hash Chain)**:
  - `id` TEXT PRIMARY KEY, `timestamp` TEXT, `actor` TEXT, `role` TEXT, `scope` TEXT, `key` TEXT, `old_value` TEXT, `new_value` TEXT, `reason` TEXT, `prev_hash` TEXT, `hash` TEXT
  - SQLite triggers reject `UPDATE` and `DELETE`.
- **Table `idempotency_keys`**:
  - `key` TEXT PRIMARY KEY, `user_id` TEXT, `request_hash` TEXT, `status` TEXT (`'in_progress'` | `'completed'`), `response_status` INTEGER, `response_body` TEXT, `created_at` TEXT, `expires_at` TEXT

### Atomic Idempotency & Broker Reconciliation
- `POST /api/orders` checks `X-Idempotency-Key`:
  - Inserts key as `status = 'in_progress'` atomically using `INSERT OR ABORT`.
  - Concurrent request with identical key receives HTTP `409 Conflict` ("Request currently in progress").
  - On broker fill, updates status to `'completed'` and caches response body.
  - If broker response times out or is uncertain, key remains pending and server reconciliation service checks MT5 ticket status.

### 422 Rejection Protocol & Lot Reduction Calculation
- Rejection returns HTTP `422 Unprocessable Entity`:
  ```json
  {
    "error": "FIREWALL_REJECTED",
    "rule": "maxRiskPerTradePct",
    "ruleName": "Max Risk Per Trade",
    "limit": 2.0,
    "attempted": 3.32,
    "attemptedRiskUsd": 332.00,
    "allowedRiskUsd": 200.00,
    "suggestedLots": 0.60,
    "message": "Risk check rejected: Trade risk of $332.00 (3.32%) exceeds allowed 2% per trade"
  }
  ```
- If maximum allowed lots falls below broker minimum (0.01 lot), server returns `suggestedLots: null` with an explanatory message.
- Trading desk displays the rejection banner and sets lot size on click. Never auto-submits.

### QuickJS WASM Strategy Sandbox
- Backtester and live bots execute user strategies inside QuickJS WebAssembly runtime (`src/engine/workerSandbox.ts`).
- **Safety Constraints**:
  - 50ms CPU time limit per bar; 10,000ms total job budget.
  - 16MB maximum memory ceiling.
  - Zero access to `fetch`, `XMLHttpRequest`, `WebSocket`, `importScripts`, or filesystem.
- **Regression Parity Test (`quickjsRegression.test.ts`)**:
  - Runs built-in TrendPullbackPro strategy across standard 6-month historical dataset under both native execution and QuickJS WASM sandbox.
  - Asserts 100% identical trades, execution prices, and net P&L.

---

## 3. Stage 2: Shared `<PriceChart>` Component (Phase 1)

### Phase 1: Technical Analysis Deployment
- Integrated into **Technical Analysis** view.
- High-performance HTML5 Canvas with visible-range rendering:
  - Samples dynamic CSS variables (`--bg`, `--surface`, `--border`, `--text`, `--primary`) directly from computed document styles at draw time.
  - Redraws automatically on theme change (`light` / `dark`) and window resize.
  - Supported Chart Types: Candlesticks, Heikin Ashi, Line, Bars.
- **Two Separate Performance Benchmarks**:
  1. Full indicator recomputation benchmark across 50,000 bars (asserts completion within generous threshold, e.g. $\le 200\text{ms}$).
  2. Per-frame draw-preparation benchmark for visible range (asserts $\le 16.6\text{ms}$ for 60 FPS rendering).

### 25 Technical Indicators & Committed Fixture Generator
- Indicator fixture generator script: `scripts/generate-indicator-fixtures.ts` committed to repository, documenting reference formulas (standard TA-Lib / Wilder definitions).
- Output committed to `src/engine/__tests__/fixtures/indicators_reference.json`.
- **25 Indicators**:
  - Overlays (13): SMA, EMA, WMA, Hull MA, Bollinger Bands, Keltner Channels, Donchian Channels, Ichimoku Cloud (Chikou visual-only), Supertrend, Parabolic SAR, Tick VWAP (daily reset with explicit broker UTC offset), Pivot Points (Classic, Fib, Camarilla, Woodie, DeMark), Session Boxes (Asian, London, NY).
  - Sub-Panes (12): RSI (Wilder smoothing), MACD, Stochastic, Stochastic RSI, ADX (+DI/-DI, Wilder smoothing), ATR (Wilder smoothing), CCI, Williams %R, Momentum/ROC, Tick OBV, Tick Volume + MA, Awesome Oscillator.
- Warm-up returns `null` for bars prior to full lookback. Zero lookahead (bar $i$ uses only bars $\le i$). Forming candle excluded from signal calculation.
- Fullscreen mode (Fullscreen API with fixed overlay fallback, `F` key handler, PNG/CSV export).
- SQLite layout persistence (`chart_layouts` table storing `id`, `name`, `scope`, `owner_id`, `chart_type`, `indicators`, `moving_averages`).

---

## 4. Stage 3: Universal Design System Rollout

### Token Strategy & Shared UI Kit (`src/components/ui/`)
- Unified CSS tokens in `src/index.css`:
  - Dark Navy: `--bg: #0B1020`, `--surface: #111A2E`, `--border: #223049`, `--text: #E6ECF5`, `--text-muted: #9FB0C8`, `--primary: #6366F1`.
  - Light Mode: `--bg: #F8FAFC`, `--surface: #FFFFFF`, `--border: #E2E8F0`, `--text: #0F172A`, `--text-muted: #64748B`, `--primary: #4F46E5`.
- Component Library: `Button`, `Card`, `SectionHeading`, `Badge`, `Toggle`, `Input`, `Select`, `Table`, `EmptyState`, `Modal`, `Tooltip`.
- Typography: Sentence-case sans headings, `tabular-nums` for all financial figures, minimum 12px text.

### Progressive View Migration
- Complete audit of hardcoded colors in `src/components/`.
- Replace legacy colors and inline styles across all 12 views:
  1. Technical Analysis, 2. Trading Desk (Markets), 3. Smart Money Footprint, 4. Admin & Accounts, 5. Backtest Lab, 6. Strategy Studio, 7. Optimization View, 8. Pine Converter, 9. Data Manager, 10. Automated Bot Fleet, 11. Fundamentals & Macro, 12. AI Quant Advisor.
- Automated test (`designTokens.test.ts`) verifies 0 instances of hardcoded hex or `slate-*` classes outside `src/index.css`.

---

## 5. Verification Gates Across All Stages

| Stage | Focus Area | Automated Test Suites | Build & Static Analysis Gate |
|---|---|---|---|
| **Stage 1a** | Supabase Auth, RBAC, Dual-Mode Token, Route Allowlist, MFA | `authMiddleware.test.ts`, `routeInventory.test.ts`, `objectAuth.test.ts`, `escalation.test.ts`, `tokenLeak.test.ts` | `npx tsc --noEmit` + `npm test` + `npm run build` |
| **Stage 1b** | Risk Firewall, In-Progress Idempotency, QuickJS WASM Sandbox | `firewall.test.ts`, `idempotency.test.ts`, `auditTriggers.test.ts`, `quickjsSandbox.test.ts`, `quickjsRegression.test.ts` | `npx tsc --noEmit` + `npm test` + `npm run build` |
| **Stage 2** | PriceChart Phase 1, 25 Indicators, Layouts, Benchmarks | `indicatorMath.test.ts`, `chartBenchmark.test.ts`, `fixturesParity.test.ts` | `npx tsc --noEmit` + `npm test` + `npm run build` |
| **Stage 3** | Universal Design System & UI Kit Migration | `designTokens.test.ts` | `npx tsc --noEmit` + `npm test` + `npm run build` |
