# Risk Firewall, Supabase Auth & RBAC, Shared PriceChart & Design System

Comprehensive architectural blueprint for establishing Supabase-backed authentication, role-based access control (RBAC), QuickJS-sandboxed strategy execution, server-side Risk Firewall with hard ceilings and 422 remediation, high-performance Canvas `<PriceChart>` (25 indicators), and universal dual-theme design system rollout.

> [!IMPORTANT]
> **Key Architecture Decisions & Gated Delivery Pipeline**:
> 1. **Three Gated Delivery Stages**:
>    - **Stage 1 (Auth & Risk Firewall)**: Supabase JWKS verification, RBAC, object-level account authorization, privilege escalation barriers, bootstrap, 503 fail-closed mode with strict public allowlist, `risk_firewall_settings` & `risk_firewall_state` tables (`global:demo`, `global:live`, per-account), 422 order remediation with suggested lots, TTL-backed idempotency with 409 conflict detection, append-only SQLite triggers, and QuickJS (WASM) strategy isolation.
>    - **Stage 2 (Shared PriceChart Phase 1)**: Canvas `<PriceChart>` on Technical Analysis with dynamic CSS token sampling on theme change, 25 pure indicators verified against committed reference fixtures, adjustable MAs, SQLite layout persistence (`owner_id`), and 50,000-bar performance benchmarking.
>    - **Stage 3 (Universal Design System Rollout)**: Centralized semantic tokens, `src/components/ui/` library, and migration of all 12 views with automated zero-hardcoded-hex verification.
>    - *Each stage is strictly gated by running `tsc --noEmit`, automated Vitest suites, and `npm run build`.*
> 2. **QuickJS WASM Strategy Sandbox**: All user strategies (Backtester, Strategy Studio, and live server bots) run inside a secure QuickJS WebAssembly sandbox with rigid CPU time limits (e.g. 5,000ms), memory ceilings (e.g. 16MB), and zero access to `fetch`, `XMLHttpRequest`, `WebSocket`, `importScripts`, or filesystem primitives.
> 3. **MFA Enrolment & AAL2 Enforcement**: Dedicated TOTP MFA enrollment view allows users to scan QR codes and confirm tokens before `aal2` enforcement. When `MASTER_REQUIRE_MFA=true`, backend enforces `aal2` claim on all sensitive operations.
> 4. **Append-Only Auditing**: SQLite triggers enforce that `risk_firewall_audit` and `blocked_orders_log` reject all `UPDATE` and `DELETE` queries.
> 5. **Idempotency with Conflict Detection**: `X-Idempotency-Key` stores request hashes with a 24h TTL; exact replays return the cached response, while reusing the key with a different payload returns HTTP `409 Conflict`.

---

### System Architecture & Security Perimeter

```
┌────────────────────────────────────────────────────────────────────────┐
│                         CLIENT (React 19 + Vite)                       │
│ - Supabase Client SDK (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)      │
│ - AuthContext & Views: Login, MFA Enrollment, "Session Expired" modal  │
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
│ - Security: App-origin CORS, Helmet headers, IP/token rate-limiter     │
│ - Auth Guard: JWKS local JWT verification, 60s cached role/status      │
│ - Role Cache: In-memory cache invalidated immediately on role update   │
│ - MFA Guard: checks 'aal2' claim when MASTER_REQUIRE_MFA=true          │
│ - Fail-Closed Guard: Allowlist only; all others return 503             │
│ - Idempotency Guard: Replay returns cache; mismatch returns 409        │
│ - Object-Level Auth: verifies user assigned to target accountId        │
│ - Privilege Escalation Guard: prevents admins granting higher rights   │
│ - Risk Firewall Evaluator: reads risk_firewall_settings & state tables │
│ - Order Remediation: returns 422 with calculated suggested safe lots   │
│ - Strategy Isolation: QuickJS WASM Sandbox with time/memory caps       │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
                    ▼                                ▼
┌──────────────────────────────────────┐   ┌─────────────────────────────┐
│          SUPABASE (Remote)           │   │      SQLITE (Local Host)    │
│ - auth.users (Credentials & TOTP)    │   │ - risk_firewall_settings    │
│ - public.profiles (RLS enforced):    │   │ - risk_firewall_state (PK)  │
│   user_id, email, role, status       │   │ - risk_firewall_audit       │
│ - custom_roles & role_permissions    │   │   (append-only trigger)     │
│   (seeded: master_admin, admin,      │   │ - blocked_orders_log        │
│    trader, viewer; default: pending) │   │   (append-only trigger)     │
│ - JWKS endpoint (public keys)        │   │ - idempotency_keys (TTL)    │
│                                      │   │ - user_account_assignments  │
│                                      │   │ - chart_layouts (owner_id)  │
└──────────────────────────────────────┘   └─────────────────────────────┘
```

---

## 1. Authentication & Role-Based Access Control (Supabase)

### Environment Variables & Credentials Architecture
- Updated `.env.example`:
  ```env
  # Supabase Cloud Authentication & RBAC
  SUPABASE_URL=https://your-project.supabase.co
  SUPABASE_ANON_KEY=eyJhbGciOi...
  SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...  # SERVER ONLY: Never sent to client or bundled
  MASTER_ADMIN_EMAIL=admin@zaboraa.com     # Bootstrap initial Master Admin
  VITE_SUPABASE_URL=https://your-project.supabase.co
  VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
  MASTER_REQUIRE_MFA=true                  # Enforces aal2 claim in production
  ```
- **Zero Token Leakage**: Automated test verifies that `SUPABASE_SERVICE_ROLE_KEY` does not exist in the Vite client bundle or in any API response payload.

### Fail-Closed & Public Research Route Allowlist
- **Unconfigured Mode**: If `SUPABASE_URL` or keys are missing:
  - **Strict Public Allowlist**: Only explicit public GET routes work:
    - `GET /api/health`
    - `GET /api/technical/analysis`
    - `GET /api/technical/candles`
    - `GET /api/cot/summary`
    - `GET /api/cot/report`
    - `GET /api/fundamental/macro`
  - **All other endpoints** (including `GET /api/strategies`, `GET /api/backtests`, `GET /api/data/export`, all `POST`/`PUT`/`DELETE`, and all `/api/ai/*`) immediately return HTTP `503 AUTH_NOT_CONFIGURED`.
  - Frontend displays an ambient setup banner and disables administrative/order functionality.
- **Configured Mode**:
  - Unauthenticated visitors see **only the Login view**.
  - Every `/api/*` route except `/api/health` requires a valid Bearer token.
  - Research routes require `research.view` permission.

### Token Verification, JWKS & Role Cache Invalidation
- **Local JWKS Verification**: Backend caches public keys from Supabase JWKS endpoint (`/.well-known/jwks.json`).
- **60-Second In-Memory Role Cache**: Fast path for user role, status, and permissions.
- **Instant Cache Invalidation**: Any administrative action via `/api/admin/users/*` (role change, disable user, account assignment) immediately purges the affected user's cache entry.

### Supabase Migrations (`supabase/migrations/20261029000000_auth_rbac.sql`)
- Creates `public.profiles`: `user_id uuid primary key references auth.users`, `email text`, `role text default 'pending'`, `status text default 'active'`, `created_at timestamptz`.
- Creates `public.custom_roles`: `role_name text primary key`, `description text`, `created_at timestamptz`.
- Creates `public.role_permissions`: `role_name text references custom_roles`, `permission text`, `primary key (role_name, permission)`.
- Seeds built-in roles: `master_admin`, `admin`, `trader`, `viewer`.
- Default role for new signups: `'pending'` with 0 permissions until reviewed by an administrator.
- RLS Policies: Users can read only their own profile (`auth.uid() = user_id`). No direct browser `INSERT`/`UPDATE`/`DELETE`. Only service role can modify roles and permissions.
- Auto-profile trigger: Trigger on `auth.users` insert creates profile with `'pending'` role.

### Master Admin Bootstrap & Atomic Transaction
- During server startup or initial login: If and only if **zero active `master_admin` profiles exist**, a single database transaction verifies that the user's email is confirmed and matches `MASTER_ADMIN_EMAIL`, upgrading their role to `master_admin`.
- Protection: System blocks deleting, demoting, or disabling the last active `master_admin`.

### Privilege Escalation Barriers & Object-Level Access
- **Escalation Rules**:
  - Administrators cannot grant permissions they do not possess.
  - Administrators cannot assign, modify, or demote a `master_admin`.
  - Administrators cannot edit roles ranked above or equal to their own.
- **Object-Level Authorization**:
  - Table `user_account_assignments` maps `user_id` to `accountId`.
  - Orders, positions, bots, and kill switch verify user assignment to the target account. Unassigned users receive HTTP `403 Forbidden`.

### MFA Enrollment & Authenticator Recovery
- Dedicated MFA Enrollment UI (`src/components/MfaEnrollmentView.tsx`):
  - Fetches TOTP secret and QR code URI from Supabase Auth (`supabase.auth.mfa.enroll`).
  - Displays QR code and backup recovery code.
  - User submits 6-digit TOTP challenge to verify and activate MFA.
  - Documents recovery workflow: Lost authenticator requires Master Admin intervention to reset factor via service role API.

---

## 2. Risk Firewall & Server-Authoritative Enforcement

### Database Architecture & SQLite Schema (`src/db/sqlite.ts`)
- Pre-migration backup of `data/zaboraa.sqlite` saved to `data/backups/zaboraa_pre_firewall_<timestamp>.sqlite`.
- **Table `risk_firewall_settings`**:
  - `scope` TEXT (`'global:demo'`, `'global:live'`, or `accountId`)
  - `key` TEXT
  - `value` TEXT
  - `updated_by` TEXT
  - `updated_at` TEXT
  - `PRIMARY KEY (scope, key)`
- **Table `risk_firewall_state`**:
  - `scope` TEXT PRIMARY KEY (`'global:demo'`, `'global:live'`, or `accountId`)
  - `enabled` INTEGER NOT NULL DEFAULT 1
  - `disabled_at` TEXT
  - `disabled_until` TEXT
  - `disabled_by` TEXT
  - `reason` TEXT
- **Table `risk_firewall_audit` (Append-Only via SQLite Trigger)**:
  - `id` TEXT PRIMARY KEY, `timestamp` TEXT, `actor` TEXT, `role` TEXT, `scope` TEXT, `key` TEXT, `old_value` TEXT, `new_value` TEXT, `reason` TEXT
- **Table `blocked_orders_log` (Append-Only via SQLite Trigger)**:
  - `id` TEXT PRIMARY KEY, `timestamp` TEXT, `user_id` TEXT, `account_id` TEXT, `symbol` TEXT, `attempted_lots` REAL, `attempted_risk_usd` REAL, `rule_violated` TEXT, `suggested_lots` REAL
- **Table `idempotency_keys`**:
  - `key` TEXT PRIMARY KEY, `user_id` TEXT, `request_hash` TEXT, `response_status` INTEGER, `response_body` TEXT, `created_at` TEXT, `expires_at` TEXT
- **Append-Only Triggers**:
  ```sql
  CREATE TRIGGER IF NOT EXISTS prevent_audit_update BEFORE UPDATE ON risk_firewall_audit
  BEGIN SELECT RAISE(ABORT, 'Audit log is append-only: UPDATE prohibited'); END;
  CREATE TRIGGER IF NOT EXISTS prevent_audit_delete BEFORE DELETE ON risk_firewall_audit
  BEGIN SELECT RAISE(ABORT, 'Audit log is append-only: DELETE prohibited'); END;
  ```

### Server Hard Ceilings, Risk Baseline & Idempotency
- **Hard Ceilings**: `maxRiskPerTradePct <= 5.0%`, `dailyLossLimitPct <= 10.0%`, `maxLots <= 10.0`, `maxOpenPositions <= 20`, `maxDrawdownPct <= 30.0%`.
- **Risk Definition**: Risk is calculated strictly against **account balance** for deterministic, un-polluted validation.
- **Account Type Verification**: Verified via MT5 bridge. `UNKNOWN` account type is treated strictly as `LIVE` (fail-closed).
- **Auto-Expiry**: Evaluates `disabled_until` on server startup, recurring timer, GET, and order evaluation. If expired, `enabled` is restored to 1 and audited.
- **Idempotency with 409 Conflict Detection**:
  - `POST /api/orders` checks `X-Idempotency-Key` header.
  - If key exists and `request_hash` matches: returns original response immediately without re-executing.
  - If key exists and `request_hash` differs: returns HTTP `409 Conflict` ("Idempotency key reused with different payload").

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
- If maximum allowed lots falls below broker minimum (0.01 lot), server returns:
  ```json
  {
    "suggestedLots": null,
    "message": "Stop loss distance is too wide for minimum 0.01 lot ($200.00 max risk allows 0.006 lots)"
  }
  ```
- Trading desk displays the rejection banner and sets lot size on click. Never auto-submits.

### Strategy Execution Isolation: QuickJS WASM Sandbox
- All strategy executions (Backtester, Strategy Studio, Live Bots) run in a secure QuickJS WebAssembly runtime (`src/engine/workerSandbox.ts`).
- **Enforced Security Boundaries**:
  - Rigid CPU timeout (5,000ms max per evaluation loop).
  - Memory ceiling (16MB max heap).
  - Explicitly denied globals: `fetch`, `XMLHttpRequest`, `WebSocket`, `importScripts`, `Worker`, `fs`, `eval`, `Function`.
  - Handlers safely catch and terminate infinite loops and memory allocation bombs.

---

## 3. Shared `<PriceChart>` Component (Phase 1)

### Phase 1: Technical Analysis Deployment
- Integrated into **Technical Analysis** view.
- High-performance HTML5 Canvas with visible-range rendering:
  - Samples dynamic CSS variables (`--bg`, `--surface`, `--border`, `--text`, `--primary`) directly from computed document styles at draw time.
  - Redraws automatically on theme change (`light` / `dark`) and window resize.
  - Chart Types: Candlesticks, Heikin Ashi, Line, Bars.
- **50,000-Bar Performance Benchmark**:
  - Vitest benchmark testing 50,000 bars with 8 simultaneous active indicators, asserting compute + draw prep time $\le 16.6\text{ms}$ (60 FPS).
  - Frame rate verification test verifying steady rendering performance under zoom and pan operations.

### 25 Technical Indicators & Committed Test Fixtures
- All indicator math in `src/engine/technicalIndicators.ts` as pure functions.
- Indicators tested against committed reference fixtures (`src/engine/__tests__/fixtures/indicators_reference.json`) with documented source notes (e.g. TA-Lib reference series):
  - **Overlays (13)**: 1. SMA, 2. EMA, 3. WMA, 4. Hull MA, 5. Bollinger Bands, 6. Keltner Channels, 7. Donchian Channels, 8. Ichimoku Cloud (9/26/52, Chikou visual-only), 9. Supertrend (ATR period/mult), 10. Parabolic SAR, 11. Tick VWAP (daily reset with explicit broker UTC offset), 12. Pivot Points (Classic, Fib, Camarilla, Woodie, DeMark), 13. Session Boxes (Asian, London, NY).
  - **Sub-Panes (12)**: 14. RSI (Wilder smoothing), 15. MACD (12, 26, 9), 16. Stochastic (14, 3, 3), 17. Stochastic RSI, 18. ADX (+DI/-DI, Wilder smoothing), 19. ATR (Wilder smoothing), 20. CCI, 21. Williams %R, 22. Momentum/ROC, 23. Tick OBV, 24. Tick Volume + MA, 25. Awesome Oscillator.
- Warm-up returns `null` for bars prior to full lookback. No lookahead (bar $i$ uses only bars $\le i$). Forming candle excluded from signal calculation.
- Fullscreen mode (Fullscreen API with fixed overlay fallback, `F` key handler, PNG/CSV export).
- SQLite layout persistence (`chart_layouts` table storing `id`, `name`, `scope`, `owner_id`, `chart_type`, `indicators`, `moving_averages`).

---

## 4. Universal Design System Rollout

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
- Automated test verifies 0 instances of hardcoded hex or `slate-*` classes outside the token definition file.

---

## 5. Three Gated Delivery Stages & Verification Milestones

### Stage 1: Auth, RBAC, QuickJS Isolation & Risk Firewall
- **Deliverables**:
  - `supabase/migrations/20261029000000_auth_rbac.sql`
  - `src/services/supabaseServer.ts`, `src/services/supabaseClient.ts`, `src/context/AuthContext.tsx`
  - `src/components/LoginView.tsx`, `src/components/MfaEnrollmentView.tsx`
  - `server.ts` (JWKS verification, rate limiter, security headers, unconfigured 503 allowlist, `/api/admin/users/*`, `/api/admin/firewall`, idempotency with 409)
  - `src/db/sqlite.ts` (pre-backup, `risk_firewall_settings`, `risk_firewall_state`, append-only audit triggers, `idempotency_keys`)
  - `src/engine/workerSandbox.ts` (QuickJS WASM sandbox with CPU/memory limits and zero network/fs)
  - `src/components/AdminAccountsView.tsx` (Firewall tab with diff preview, Users & Assignments tab)
  - `src/components/MarketsView.tsx` (422 rejection card with "Reduce to X lots" button)
- **Automated Tests**:
  - `authMiddleware.test.ts`: 401 without token, 403 without permission, 503 on unconfigured non-allowlist routes, role cache instant invalidation.
  - `escalation.test.ts`: Admins cannot grant unheld permissions, cannot modify `master_admin`, last `master_admin` protected.
  - `firewall.test.ts`: Scope precedence (`accountId` > `global:*`), hard ceilings enforced, LIVE accounts cannot disable firewall, auto-expiry restored, 422 with suggested lots (or null if below min lot).
  - `auditTriggers.test.ts`: UPDATE and DELETE queries rejected on `risk_firewall_audit` and `blocked_orders_log`.
  - `idempotency.test.ts`: Replays return original response; mismatched body returns 409 Conflict.
  - `quickjsSandbox.test.ts`: Blocks `fetch`, `XHR`, `WebSocket`, `importScripts`; catches infinite loops and memory bombs safely.
  - `tokenLeak.test.ts`: `SUPABASE_SERVICE_ROLE_KEY` absent from client bundles and API responses.
- **Stage 1 Gating Check**: `npx tsc --noEmit` + `npm test` + `npm run build`.

### Stage 2: Shared `<PriceChart>` Phase 1
- **Deliverables**:
  - `src/engine/technicalIndicators.ts` (25 pure indicators, Wilder smoothing, warm-up `null`)
  - `src/engine/__tests__/fixtures/indicators_reference.json` (committed TA-Lib reference vectors)
  - `src/components/PriceChart.tsx` (Canvas renderer, MAs, 25 indicators, fullscreen, layout persistence)
  - `src/components/TechnicalAnalysisView.tsx` (integrated PriceChart)
  - `server.ts` (`/api/chart/layouts` with `owner_id`)
- **Automated Tests**:
  - `indicatorMath.test.ts`: Cross-checks all 25 indicators against committed fixtures within tolerance; tests Wilder smoothing and warm-up nulls.
  - `chartBenchmark.test.ts`: 50,000-bar benchmark verifying compute + draw prep time $\le 16.6\text{ms}$.
- **Stage 2 Gating Check**: `npx tsc --noEmit` + `npm test` + `npm run build`.

### Stage 3: Universal Design System Rollout
- **Deliverables**:
  - `src/index.css` (semantic CSS variables for Dark Navy and Light themes)
  - `src/components/ui/*` (Button, Card, SectionHeading, Badge, Toggle, Input, Select, Table, EmptyState, Modal, Tooltip)
  - Migration of all 12 views in `src/components/`
- **Automated Tests**:
  - `designTokens.test.ts`: Automated regex scan confirming zero hardcoded hex (`#...`) or legacy `slate-*` classes outside `src/index.css`.
- **Stage 3 Gating Check**: `npx tsc --noEmit` + `npm test` + `npm run build`.
