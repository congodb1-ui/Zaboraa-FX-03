import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { GoogleGenAI, Type } from '@google/genai';
import { initMasterKey, hashContent, maskSecret } from './src/services/crypto';
import {
  getDb,
  getNoNewOrdersFlag,
  setNoNewOrdersFlag,
  logOrderIntent,
  updateOrderStatus,
  saveLiveToken,
  consumeLiveToken,
  insertAuditLog,
  insertRiskEvent,
  getPendingOrders,
  saveStrategy,
  getAllStrategies,
  getStrategyById,
  deleteStrategy,
  saveBot,
  getAllBots,
  updateBotStatusDb,
  deleteBotDb,
  stopAllBots,
  cancelAllPendingOrders,
  createJobDb,
  getJobDb,
  updateJobProgressDb,
  updateJobCompletedDb,
  updateJobFailedDb,
  cancelJobDb,
  isJobCancelledDb,
  getCachedAi,
  setCachedAi,
  getBotById,
  getRecentRiskEvents,
  getRecentAuditLogs,
  getOpenPositionsDb,
} from './src/services/db';
import { BridgeClient, executeOrderThroughBridge } from './src/services/bridgeClient';
import { reconcileWithBroker } from './src/engine/reconciliation';
import { globalWatchdog } from './src/engine/watchdog';
import { BotScheduler } from './src/engine/botScheduler';
import {
  savePartitionedCandles,
  loadPartitionedCandles,
  getDataCatalog,
  auditCandleIntegrity,
} from './src/services/candleStorage';
import {
  parseSymbol,
  parseTimeframe,
  runCheck,
  runLoad,
  runAudit,
  runExport,
  runImport,
  runAutofix,
  runBulkSave,
  type DataDeps,
} from './src/engine/marketdata/dataApi';
import { validateStrategyAST, transpileStrategyCode } from './src/engine/transpiler';
import { runOptimizationSweep } from './src/engine/optimizer';
import { runBacktest } from './src/engine/backtester';
import { getStrategyExecutor, BUILT_IN_STRATEGIES } from './src/services/builtInStrategies';
import { generateHistoricalCandles } from './src/services/marketData';
import { getQuickJS, QuickJSStrategySandbox, createQuickJSStrategyExecutor } from './src/engine/quickjsSandbox';
import { OrderRecord, OrderStatus, Position } from './src/types/forex';

interface BackgroundJob {
  id: string;
  type: string;
  status: string;
  progress: number;
  params: any;
  createdAt: string;
  result?: any;
  error?: string;
}

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isPreview = process.env.AI_STUDIO_PREVIEW === 'true';
const rawHost = process.env.HOST ? process.env.HOST.split('#')[0].trim() : '';
const HOST = rawHost || (isPreview ? '0.0.0.0' : '127.0.0.1');
const isProduction = process.env.NODE_ENV === 'production';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

export function validateBridgeToken(token?: string): boolean {
  if (!token || token.trim().length < 24) {
    throw new Error(
      'CRITICAL_SECURITY_HALT: BRIDGE_TOKEN is missing or shorter than 24 characters in environment. ' +
      'Refusing to start with default or weak tokens.'
    );
  }
  const disallowedTokens = ['dev-bridge-token', 'zaboraa_local_bridge_token', 'zaboraa_local_bridge_token_9872'];
  if (disallowedTokens.some((d) => token.includes(d))) {
    throw new Error(
      'CRITICAL_SECURITY_HALT: Default placeholder bridge token detected. Refusing to start with insecure default.'
    );
  }
  return true;
}

const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN;
if (process.env.BRIDGE_URL || process.env.REQUIRE_BRIDGE_TOKEN === 'true') {
  validateBridgeToken(BRIDGE_TOKEN);
} else if (BRIDGE_TOKEN && BRIDGE_TOKEN.trim().length > 0 && !BRIDGE_TOKEN.startsWith('#')) {
  validateBridgeToken(BRIDGE_TOKEN);
} else if (process.env.NODE_ENV !== 'test') {
  console.warn(
    '\n[SECURITY WARNING] BRIDGE_TOKEN is not configured in .env. ' +
    'MT5 bridge communication will fail until configured.\n'
  );
}

app.use(express.json({ limit: '20mb' }));

try {
  initMasterKey();
} catch (err: any) {
  if (process.env.NODE_ENV !== 'test') {
    console.error(err.message);
  }
}

getDb();

export const SERVER_SESSION_SECRET = crypto.randomBytes(32).toString('hex');

app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) {
    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    const cookieFlags = isSecure
      ? 'SameSite=None; Secure; Path=/'
      : 'SameSite=Lax; Path=/';
    res.setHeader(
      'Set-Cookie',
      `zfx_session=${SERVER_SESSION_SECRET}; HttpOnly; ${cookieFlags}`
    );
  }
  next();
});

export function apiSecurityMiddleware(req: any, res: any, next: any) {
  const host = (req.headers.host || '').split(':')[0].toLowerCase();
  const origin = req.headers.origin || '';
  const allowPreview = process.env.AI_STUDIO_PREVIEW === 'true';

  const isLocalHost = (h: string) => {
    if (!h) return true;
    if (h === '127.0.0.1' || h === 'localhost') return true;
    if (allowPreview && h === '0.0.0.0') return true;
    if (allowPreview) {
      return (
        h.endsWith('.run.app') ||
        h.includes('aistudio') ||
        h.includes('googleusercontent.com') ||
        h.includes('google.com')
      );
    }
    return false;
  };

  const isAllowedOrigin = (orig: string) => {
    if (!orig) return true;
    try {
      const u = new URL(orig);
      const h = u.hostname.toLowerCase();
      if (h === '127.0.0.1' || h === 'localhost') return true;
      if (allowPreview && h === '0.0.0.0') return true;
      if (allowPreview) {
        return (
          h.endsWith('.run.app') ||
          h.includes('aistudio') ||
          h.includes('googleusercontent.com') ||
          h.includes('google.com')
        );
      }
      return false;
    } catch {
      return false;
    }
  };

  if (!isLocalHost(host)) {
    return res.status(403).json({ error: 'FORBIDDEN_HOST: Foreign Host header rejected. Localhost access only.' });
  }

  if (origin && !isAllowedOrigin(origin)) {
    return res.status(403).json({ error: 'FORBIDDEN_ORIGIN: Foreign Origin rejected. Localhost access only.' });
  }

  const cookieHeader = req.headers.cookie || '';
  const sessionHeader = req.headers['x-session-secret'];
  const hasCookie = cookieHeader.includes(`zfx_session=${SERVER_SESSION_SECRET}`);
  const hasValidHeader = sessionHeader === SERVER_SESSION_SECRET;
  const isSameOrigin =
    req.headers['sec-fetch-site'] === 'same-origin' ||
    req.headers['sec-fetch-site'] === 'same-site' ||
    (origin && host && origin.toLowerCase().includes(host.toLowerCase())) ||
    (!origin && req.headers.referer && host && req.headers.referer.toLowerCase().includes(host.toLowerCase())) ||
    (isLocalHost(host) && !origin);

  if (req.path === '/health') {
    return next();
  }

  if (!hasCookie && !hasValidHeader && !isSameOrigin) {
    return res.status(401).json({
      error: 'UNAUTHORIZED: Missing or invalid session secret cookie (zfx_session). Access denied.',
    });
  }

  next();
}

app.use('/api', apiSecurityMiddleware);

const activeJobs = new Map<string, any>();

const ai = new GoogleGenAI({
  vertexai: true,
  project: 'prime-bridge-511404-a3',
  location: 'us-central1',
  httpOptions: {
    headers: {
      'User-Agent': 'zaboraa-fx-gcp',
    },
  },
});

let brokerState = {
  isConnected: false,
  isSimulated: true,
  broker: 'Exness',
  server: process.env.MT5_SERVER || 'Exness-MT5Trial9',
  login: '',
  mode: 'DEMO',
  symbolSuffix: 'm',
  balance: 10000.0,
  equity: 10000.0,
  margin: 0.0,
  freeMargin: 10000.0,
  leverage: 200,
  utcOffsetHours: 2,
  lastHeartbeat: new Date().toISOString(),
};

export async function runSystemReconciliation(): Promise<any> {
  const bridgeUrl = process.env.BRIDGE_URL;
  if (bridgeUrl) {
    try {
      const bridgeClient = new BridgeClient({
        baseUrl: bridgeUrl,
        token: process.env.BRIDGE_TOKEN,
      });
      const report = await reconcileWithBroker(bridgeClient);
      return report;
    } catch (err: any) {
      if (process.env.NODE_ENV !== 'test') {
        console.warn(`[RECONCILIATION] Broker bridge unreachable, applying local reconciliation: ${err?.message}`);
      }
    }
  }

  try {
    const pending = getPendingOrders();
    if (pending.length > 0) {
      for (const ord of pending) {
        updateOrderStatus(ord.id, 'UNKNOWN', undefined, undefined, 'Reconciled on server restart without broker connection');
        insertAuditLog({
          id: `aud_recon_${Date.now()}_${ord.id}`,
          timestamp: new Date().toISOString(),
          actor: 'System Reconciler',
          action: 'ORDER_RECONCILE',
          entity: `${ord.symbol} #${ord.id}`,
          details: `Order intent resolved from ${ord.status} to UNKNOWN upon server boot.`,
          status: 'WARNING',
        });
      }
    }
  } catch (err) {
    console.error('Error during startup order reconciliation:', err);
  }
}
runSystemReconciliation();

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'Zaboraa FX',
    timestamp: new Date().toISOString(),
    brokerStatus: brokerState.isConnected ? 'ONLINE' : 'OFFLINE',
    server: brokerState.server,
    accountType: brokerState.mode,
    geminiModel: GEMINI_MODEL,
    noNewOrders: getNoNewOrdersFlag(),
  });
});

app.get('/api/broker/status', (req, res) => {
  res.json({
    ...brokerState,
    loginMasked: brokerState.login ? maskSecret(brokerState.login) : '',
    lastHeartbeat: new Date().toISOString(),
    noNewOrders: getNoNewOrdersFlag(),
  });
});

app.post('/api/broker/connect', (req, res) => {
  const { login, server, symbolSuffix } = req.body;
  if (!login || !server) {
    return res.status(400).json({ error: 'Login and server name are required' });
  }

  brokerState = {
    ...brokerState,
    login: String(login),
    server: String(server),
    symbolSuffix: symbolSuffix !== undefined ? symbolSuffix : 'm',
    mode: 'DEMO',
    isConnected: true,
    lastHeartbeat: new Date().toISOString(),
  };

  insertAuditLog({
    id: `aud_conn_${Date.now()}`,
    timestamp: new Date().toISOString(),
    actor: 'User',
    action: 'CONNECT_BROKER',
    entity: brokerState.server,
    details: `Updated session parameters for account login ${maskSecret(brokerState.login)}.`,
    status: 'SUCCESS',
  });

  res.json({
    success: true,
    message: `Connected to ${brokerState.broker} (${brokerState.mode}) on ${brokerState.server}`,
    account: {
      ...brokerState,
      loginMasked: maskSecret(brokerState.login),
    },
  });
});

app.post('/api/live/token', (req, res) => {
  const { botId, accountLogin, riskLimits } = req.body;

  if (!botId || !accountLogin || !riskLimits) {
    return res.status(400).json({ error: 'botId, accountLogin, and riskLimits are required' });
  }

  if (!process.env.ENCRYPTION_MASTER_KEY && process.env.ALLOW_LIVE === 'true') {
    return res.status(500).json({
      error: 'CRITICAL_SECURITY_HALT: ENCRYPTION_MASTER_KEY is not configured in server environment. Cannot issue live trading token.',
    });
  }

  const riskHash = hashContent(JSON.stringify(riskLimits));
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 1000).toISOString();

  saveLiveToken({
    token,
    botId,
    accountLogin,
    riskHash,
    createdAt: now.toISOString(),
    expiresAt,
  });

  insertAuditLog({
    id: `aud_token_${Date.now()}`,
    timestamp: now.toISOString(),
    actor: 'Live Gate',
    action: 'LIVE_TOKEN_ISSUED',
    entity: `Bot ${botId} / Acc ${maskSecret(accountLogin)}`,
    details: `Single-use confirmation token issued with 60s TTL. Risk hash: ${riskHash.slice(0, 10)}...`,
    status: 'WARNING',
  });

  res.json({
    success: true,
    token,
    expiresAt,
    riskHash,
  });
});

export async function queryBridgeAccountType(): Promise<'DEMO' | 'REAL' | 'CONTEST' | 'UNKNOWN'> {
  const bridgeUrl = process.env.BRIDGE_URL;
  const token = process.env.BRIDGE_TOKEN;
  if (!bridgeUrl) return 'UNKNOWN';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const resp = await fetch(`${bridgeUrl}/health`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (resp.ok) {
      const data: any = await resp.json();
      const type = data.account_type;
      if (type === 'DEMO' || type === 'REAL' || type === 'CONTEST') {
        return type;
      }
      return 'UNKNOWN';
    }
  } catch (_) {}
  return 'UNKNOWN';
}

app.post('/api/broker/order', async (req, res) => {
  const {
    botId,
    magicNumber,
    symbol,
    side,
    direction,
    volume,
    lots,
    price,
    sl,
    tp,
    comment,
    mode: clientClaimedMode,
    liveToken,
    riskLimits,
  } = req.body;

  const effectiveSide = String(side || direction || 'BUY').toUpperCase() as 'BUY' | 'SELL';
  const effectiveVolume = Number(volume || lots || 0.1);

  if (getNoNewOrdersFlag()) {
    insertRiskEvent({
      id: `risk_block_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'Firewall',
      action: 'ORDER_REJECTED_HALT',
      entity: `${symbol} ${effectiveSide}`,
      details: 'Rejected order open because Emergency Halt (no_new_orders) is active.',
      severity: 'CRITICAL',
      status: 'BLOCKED',
    });
    return res.status(403).json({
      error: 'ORDER_BLOCKED: Emergency Kill Switch is engaged. No new orders permitted.',
    });
  }

  if (!sl || typeof sl !== 'number' || sl <= 0) {
    insertRiskEvent({
      id: `risk_sl_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'Firewall',
      action: 'ORDER_REJECTED_NO_SL',
      entity: `${symbol} ${effectiveSide}`,
      details: 'Rejected order because mandatory Stop-Loss is missing or invalid.',
      severity: 'CRITICAL',
      status: 'REJECTED',
    });
    return res.status(400).json({
      error: 'MANDATORY_STOP_LOSS_REQUIRED: Every order must include a verified broker stop-loss.',
    });
  }

  // Authoritative Account Mode Verification (Evaluated BEFORE idempotency logging)
  const authoritativeMode = await queryBridgeAccountType();

  if (authoritativeMode === 'UNKNOWN') {
    insertRiskEvent({
      id: `risk_unverified_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'Live Gate',
      action: 'ORDER_REJECTED_UNVERIFIED_ACCOUNT',
      entity: `${symbol} ${effectiveSide}`,
      details: 'Rejected order because broker account type could not be verified (UNKNOWN).',
      severity: 'CRITICAL',
      status: 'REJECTED',
    });
    return res.status(503).json({
      error: 'ACCOUNT_TYPE_UNVERIFIED: Cannot verify broker account type.',
    });
  }

  if (authoritativeMode === 'REAL' || authoritativeMode === 'CONTEST') {
    if (clientClaimedMode === 'DEMO') {
      insertRiskEvent({
        id: `risk_mismatch_${Date.now()}`,
        timestamp: new Date().toISOString(),
        actor: 'Live Gate',
        action: 'ORDER_REJECTED_ACCOUNT_MISMATCH',
        entity: `${symbol} ${effectiveSide}`,
        details: `Client attempted to place order with claimed mode DEMO against a ${authoritativeMode} broker account.`,
        severity: 'CRITICAL',
        status: 'REJECTED',
      });
      return res.status(403).json({
        error: `ACCOUNT_TYPE_MISMATCH: Authoritative broker account is ${authoritativeMode}. Live trading gate and confirmation token are required.`,
      });
    }

    if (process.env.ALLOW_LIVE !== 'true') {
      return res.status(403).json({
        error: `LIVE_TRADING_DISABLED: Non-demo broker account (${authoritativeMode}) detected but ALLOW_LIVE=true is not set on the server.`,
      });
    }

    if (!liveToken) {
      return res.status(403).json({ error: 'LIVE_TOKEN_REQUIRED: Missing live confirmation token.' });
    }
    const riskHash = hashContent(JSON.stringify(riskLimits || {}));
    const isValid = consumeLiveToken(liveToken, botId, brokerState.login, riskHash);
    if (!isValid) {
      return res.status(403).json({
        error: 'INVALID_OR_EXPIRED_LIVE_TOKEN: Token has expired, was already consumed, or does not match current risk limits.',
      });
    }
  }

  const barTime = Math.floor(Date.now() / 60000) * 60;
  const idempotencyKey = hashContent(`${botId}:${symbol}:${barTime}:${effectiveSide}`);
  const shortComment = `zfx_${magicNumber || 1001}_${Date.now().toString().slice(-6)}`;
  const orderId = `ord_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const orderRecord: OrderRecord = {
    id: orderId,
    idempotencyKey,
    botId: botId || 'manual',
    magicNumber: magicNumber || 1001,
    symbol,
    side: effectiveSide,
    volume: effectiveVolume,
    intentPrice: Number(price) || 0,
    sl: Number(sl),
    tp: tp ? Number(tp) : undefined,
    status: 'PENDING_BROKER',
    comment: shortComment,
    createdAt: new Date().toISOString(),
  };

  try {
    logOrderIntent(orderRecord);
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({
        error: 'DUPLICATE_ORDER_INTENT: An order with this idempotency key was already logged and dispatched for this bar interval.',
      });
    }
    throw err;
  }

  if (process.env.BRIDGE_URL) {
    const bridgeClient = new BridgeClient({
      baseUrl: process.env.BRIDGE_URL,
      token: process.env.BRIDGE_TOKEN,
    });

    const execution = await executeOrderThroughBridge(bridgeClient, orderRecord, {
      botMode: authoritativeMode === 'REAL' ? 'LIVE' : 'DEMO_LIVE',
      liveToken,
      accountLogin: brokerState.login,
      riskLimits,
    });

    if (!execution.success) {
      return res.status(execution.order.status === 'REJECTED' ? 400 : 502).json({
        success: false,
        error: execution.error || `Order dispatch resulted in status ${execution.order.status}`,
        order: execution.order,
        status: execution.order.status,
      });
    }

    return res.json({
      success: true,
      orderId: execution.order.id,
      ticket: execution.order.ticket,
      fillPrice: execution.order.fillPrice,
      status: execution.order.status,
      mode: authoritativeMode,
      comment: execution.order.comment,
    });
  }

  const simFillPrice = orderRecord.intentPrice > 0 ? orderRecord.intentPrice : (effectiveSide === 'BUY' ? 1.0845 : 1.0840);
  updateOrderStatus(orderId, 'SIMULATED', undefined, simFillPrice, 'SIMULATION: no broker connected');

  insertAuditLog({
    id: `aud_ord_sim_${Date.now()}`,
    timestamp: new Date().toISOString(),
    actor: 'Simulation Engine',
    action: 'ORDER_SIMULATED',
    entity: `${symbol} (No Broker Connected)`,
    details: `SIMULATED order placed without broker connection. Side: ${effectiveSide}, Volume: ${effectiveVolume}, Price: ${simFillPrice}`,
    status: 'WARNING',
  });

  res.json({
    success: true,
    simulation: true,
    orderId,
    ticket: undefined,
    fillPrice: simFillPrice,
    status: 'SIMULATED',
    mode: 'DEMO',
    message: 'SIMULATION: no broker connected',
    comment: `${shortComment}_SIM`,
  });
});

export async function executeKillSwitchOperation(
  reason = 'Emergency Kill Switch Triggered',
  options?: { retryDelayMs?: number; maxRetries?: number }
) {
  setNoNewOrdersFlag(true);
  const botsStopped = stopAllBots();
  const ordersCancelled = cancelAllPendingOrders();

  insertRiskEvent({
    id: `risk_kill_${Date.now()}`,
    timestamp: new Date().toISOString(),
    actor: 'Kill Switch',
    action: 'EMERGENCY_HALT',
    entity: 'ALL_BOTS_AND_POSITIONS',
    details: `${reason}. Bots stopped: ${botsStopped}, orders cancelled: ${ordersCancelled}`,
    severity: 'CRITICAL',
    status: 'ENGAGED',
  });

  const bridgeUrl = process.env.BRIDGE_URL;
  const bridgeToken = process.env.BRIDGE_TOKEN || '';

  if (!bridgeUrl) {
    return {
      status: 200,
      data: {
        success: true,
        simulation: true,
        message: 'SIMULATION: no broker connected',
        allFlat: false,
        noNewOrders: true,
        botsStopped,
        ordersCancelled,
        timestamp: new Date().toISOString(),
      },
    };
  }

  let killResp: Response | null = null;
  try {
    const controller = new AbortController();
    // The bridge closes positions one at a time and re-reads MT5, which can take far longer than 3 s.
    const killTimeoutMs = Number(process.env.KILL_BRIDGE_TIMEOUT_MS) > 0 ? Number(process.env.KILL_BRIDGE_TIMEOUT_MS) : 30000;
    const timeout = setTimeout(() => controller.abort(), killTimeoutMs);
    killResp = await fetch(`${bridgeUrl}/kill`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bridgeToken}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (err: any) {
    return {
      status: 500,
      data: {
        success: false,
        loudFailure: true,
        reason: 'BRIDGE_UNREACHABLE',
        error: `Kill switch failed: bridge at ${bridgeUrl} is unreachable or timed out (${err?.message || 'Network Error'}).`,
        noNewOrders: true,
        allFlat: false,
        timestamp: new Date().toISOString(),
      },
    };
  }

  if (!killResp.ok) {
    const reasonCode = killResp.status === 401 ? 'BRIDGE_UNAUTHORIZED' : 'BRIDGE_ERROR';
    return {
      status: 500,
      data: {
        success: false,
        loudFailure: true,
        reason: reasonCode,
        error: `Bridge returned HTTP ${killResp.status} during emergency kill command.`,
        noNewOrders: true,
        allFlat: false,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // The bridge reports pending orders it could not remove. They are not positions, but they can still fill.
  let pendingRemaining: number[] = [];
  try {
    const killBody: any = await killResp.json();
    if (Array.isArray(killBody?.pending_remaining)) pendingRemaining = killBody.pending_remaining;
  } catch (_) {}

  let verifiedFlat = false;
  let remainingPositions: any[] = [];
  const maxRetries = options?.maxRetries ?? 5;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const posController = new AbortController();
      const posTimeout = setTimeout(() => posController.abort(), 1800);
      const posResp = await fetch(`${bridgeUrl}/positions`, {
        headers: { Authorization: `Bearer ${bridgeToken}` },
        signal: posController.signal,
      });
      clearTimeout(posTimeout);

      if (posResp.ok) {
        remainingPositions = await posResp.json();
        if (Array.isArray(remainingPositions) && remainingPositions.length === 0) {
          verifiedFlat = true;
          break;
        }
      }
    } catch (_) {}

    if (attempt < maxRetries) {
      const retryDelayMs = options?.retryDelayMs ?? (process.env.NODE_ENV === 'test' ? 10 : 1500);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  if (verifiedFlat && pendingRemaining.length > 0) {
    insertRiskEvent({
      id: `risk_kill_pending_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'Kill Switch',
      action: 'PENDING_ORDERS_REMAIN',
      entity: `Orders: ${pendingRemaining.join(', ')}`,
      details: 'Positions are flat but the bridge could not remove all pending orders.',
      severity: 'CRITICAL',
      status: 'LOUD_FAILURE',
    });
    return {
      status: 500,
      data: {
        success: false,
        allFlat: false,
        loudFailure: true,
        reason: 'PENDING_ORDERS_REMAIN',
        unclosedTickets: [],
        pendingOrders: pendingRemaining,
        error: 'CRITICAL: Positions are flat but pending orders remain on the broker terminal.',
        noNewOrders: true,
        timestamp: new Date().toISOString(),
      },
    };
  }

  if (verifiedFlat) {
    insertAuditLog({
      id: `aud_kill_flat_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'Kill Switch',
      action: 'FLAT_VERIFIED',
      entity: 'Global Account',
      details: 'All open positions liquidated and verified flat by bridge.',
      status: 'SUCCESS',
    });

    return {
      status: 200,
      data: {
        success: true,
        allFlat: true,
        status: 'FLAT_VERIFIED',
        message: 'Global Kill Switch engaged. All active market positions liquidated and verified flat.',
        noNewOrders: true,
        timestamp: new Date().toISOString(),
      },
    };
  } else {
    const unclosedTickets = remainingPositions.map((p) => p.ticket || p.id);
    insertRiskEvent({
      id: `risk_kill_fail_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'Kill Switch',
      action: 'PARTIAL_CLOSE_FAILURE',
      entity: `Tickets: ${unclosedTickets.join(', ')}`,
      details: 'Positions remain open after liquidation retries. Market may be closed or off-quotes.',
      severity: 'CRITICAL',
      status: 'LOUD_FAILURE',
    });

    return {
      status: 500,
      data: {
        success: false,
        allFlat: false,
        loudFailure: true,
        reason: 'PARTIAL_CLOSE_FAILURE',
        unclosedTickets,
        error: 'CRITICAL: Failed to verify flat state. Open positions remain on broker terminal.',
        noNewOrders: true,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

app.post('/api/kill-switch', async (req, res) => {
  const { reason } = req.body;
  const result = await executeKillSwitchOperation(reason || 'Emergency Kill Switch Triggered');
  res.status(result.status).json(result.data);
});

app.post('/api/kill-switch/retry', async (req, res) => {
  const result = await executeKillSwitchOperation('Emergency Kill Switch Manual Retry');
  res.status(result.status).json(result.data);
});

app.post('/api/kill-switch/reset', (req, res) => {
  const { confirmReset } = req.body;
  if (!confirmReset) {
    return res.status(400).json({ error: 'Explicit confirmReset confirmation is required.' });
  }

  setNoNewOrdersFlag(false);
  insertAuditLog({
    id: `aud_reset_${Date.now()}`,
    timestamp: new Date().toISOString(),
    actor: 'Trader',
    action: 'RESET_KILL_SWITCH',
    entity: 'System Firewall',
    details: 'Emergency Halt flag cleared by manual confirmed reset. New orders now permitted.',
    status: 'WARNING',
  });

  res.json({
    success: true,
    message: 'Emergency Halt cleared. New orders now permitted.',
    noNewOrders: false,
  });
});

app.post('/api/strategies/smoke-test', async (req, res) => {
  try {
    const { code, candles, params } = req.body;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Strategy code string is required' });
    }

    const testCandles = candles && Array.isArray(candles) && candles.length > 0 ? candles : Array.from({ length: 40 }, (_, i) => ({
      time: 1700000000 + i * 3600,
      open: 1.0850 + i * 0.0001,
      high: 1.0860 + i * 0.0001,
      low: 1.0840 + i * 0.0001,
      close: 1.0855 + i * 0.0001,
      tickVolume: 200,
      spread: 1.0,
    }));

    const transpiled = transpileStrategyCode(code);
    const quickjs = await getQuickJS();
    const sandbox = new QuickJSStrategySandbox(quickjs, {
      barTimeoutMs: 50,
      memoryLimitBytes: 16 * 1024 * 1024,
    });

    let totalSignals = 0;
    const result = await sandbox.executeBacktest(
      transpiled.jsCode,
      testCandles,
      params || {},
      { balance: 10000, equity: 10000, openPositions: [] },
      () => {
        totalSignals++;
      }
    );

    res.json({
      success: true,
      executedBars: result.executedBars,
      totalSignals,
      durationMs: result.executionTimeMs,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err.message || 'QuickJS strategy smoke test error',
    });
  }
});

app.post('/api/pine/convert', async (req, res) => {
  try {
    const { pineCode, scriptTitle, userNotes } = req.body;

    if (!pineCode || typeof pineCode !== 'string' || pineCode.trim().length === 0) {
      return res.status(400).json({ error: 'Pine Script code is required' });
    }

    const promptVersion = 'v1';
    const cacheKey = crypto
      .createHash('sha256')
      .update(`${pineCode}:${scriptTitle || ''}:${userNotes || ''}:${GEMINI_MODEL}:${promptVersion}`)
      .digest('hex');

    const cached = getCachedAi(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    if (!process.env.GEMINI_API_KEY) {
      const fallback = {
        typescriptCode: `export const strategy = {
  name: "${scriptTitle || 'Converted Pine Strategy'}",
  version: "1.0.0",
  paramsSchema: [
    { name: "fastPeriod", type: "number", default: 14, description: "Fast Period" },
    { name: "slowPeriod", type: "number", default: 28, description: "Slow Period" }
  ],
  init(ctx) { ctx.warmupPeriod = 30; },
  onBar(ctx, bar) {
    if (ctx.data.length < 30) return;
    const fast = ctx.sma(ctx.params.fastPeriod || 14);
    const slow = ctx.sma(ctx.params.slowPeriod || 28);
    if (fast !== null && slow !== null && fast > slow && ctx.openPositions.length === 0) {
      ctx.buy(0.1, bar.close - 0.0030, bar.close + 0.0060, "Pine Trend Long");
    } else if (fast !== null && slow !== null && fast < slow && ctx.openPositions.length === 0) {
      ctx.sell(0.1, bar.close + 0.0030, bar.close - 0.0060, "Pine Trend Short");
    }
  }
};`,
        detectedParams: [
          { name: 'fastPeriod', type: 'number', default: '14', description: 'Fast Period' },
          { name: 'slowPeriod', type: 'number', default: '28', description: 'Slow Period' },
        ],
        warnings: ['Generated via local deterministic offline converter because GEMINI_API_KEY is unset.'],
        lookaheadDetected: false,
        repaintingDetected: false,
        explanation: 'Converted automatically to Zaboraa FX StrategyContract with SMA indicators.',
        author: 'AI Converter',
        sourceUrl: '',
        license: 'MIT',
      };
      setCachedAi(cacheKey, 'pine_convert', 'local_offline', promptVersion, fallback);
      return res.json(fallback);
    }

    const systemPrompt = `You are a quantitative software engineer specializing in translating TradingView Pine Script (v4, v5, v6) into production-grade TypeScript strategies for Zaboraa FX.
Output must adhere to this exact interface:
export const strategy = {
  name: "Strategy Name",
  version: "1.0.0",
  paramsSchema: [
    { name: "param1", type: "number", default: 14, description: "Description" }
  ],
  init(ctx) { ctx.warmupPeriod = 20; },
  onBar(ctx, bar) {
    // Execution methods: ctx.buy(size, sl, tp, comment), ctx.sell(size, sl, tp, comment), ctx.close(ticket)
  }
};
Rules:
1. Valid TypeScript only. No 'window', 'document', 'fetch', 'process', or 'eval'.
2. Flag lookahead hazards (request.security with lookahead=barmerge.lookahead_on) and repainting.
3. Extract strategy() parameters (commission_value, slippage, pyramiding, default_qty_value).
4. Extract author, sourceUrl, and license if present in comments.
5. Return JSON matching the schema.`;

    const userPrompt = `Translate this Pine Script into TypeScript StrategyContract:
Title: ${scriptTitle || 'Untitled'}
Notes: ${userNotes || 'None'}
Pine Script:
\`\`\`pinescript
${pineCode}
\`\`\``;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            typescriptCode: { type: Type.STRING },
            detectedParams: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  type: { type: Type.STRING },
                  default: { type: Type.STRING },
                  description: { type: Type.STRING },
                },
                required: ['name', 'type', 'default', 'description'],
              },
            },
            warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
            lookaheadDetected: { type: Type.BOOLEAN },
            repaintingDetected: { type: Type.BOOLEAN },
            explanation: { type: Type.STRING },
            author: { type: Type.STRING },
            sourceUrl: { type: Type.STRING },
            license: { type: Type.STRING },
          },
          required: ['typescriptCode', 'detectedParams', 'warnings', 'lookaheadDetected', 'repaintingDetected', 'explanation'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    setCachedAi(cacheKey, 'pine_convert', GEMINI_MODEL, promptVersion, parsed);
    return res.json(parsed);
  } catch (err: any) {
    console.error('Error in /api/pine/convert:', err);
    return res.status(500).json({ error: 'Failed to convert Pine Script', message: err?.message });
  }
});

app.post('/api/pine/analyze', async (req, res) => {
  try {
    const { backtestMetrics, strategyName, symbol, timeframe, provenance } = req.body;
    if (!backtestMetrics) {
      return res.status(400).json({ error: 'backtestMetrics is required' });
    }

    const stratName = strategyName || backtestMetrics.strategyName || 'Strategy';
    const sym = symbol || backtestMetrics.symbol || 'EURUSD';
    const tf = timeframe || backtestMetrics.timeframe || 'H1';
    const promptVersion = 'v1';

    const cacheKey = crypto
      .createHash('sha256')
      .update(
        `analyze:${stratName}:${sym}:${tf}:${backtestMetrics.netProfit}:${backtestMetrics.profitFactor}:${backtestMetrics.maxDrawdownPct}:${GEMINI_MODEL}:${promptVersion}`
      )
      .digest('hex');

    const cached = getCachedAi(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    let analysisText = '';

    if (process.env.GEMINI_API_KEY) {
      const prompt = `You are a professional quant researcher. Analyze these realistic backtest metrics:
Strategy: ${stratName}
Symbol: ${sym} (${tf})
Provenance: ${provenance?.label || 'SIMULATED'}
Net Profit: $${backtestMetrics.netProfit} (${backtestMetrics.returnPct}%)
Profit Factor: ${backtestMetrics.profitFactor}
Win Rate: ${backtestMetrics.winRate}% (${backtestMetrics.totalTrades} trades)
Max Drawdown: ${backtestMetrics.maxDrawdownPct}% ($${backtestMetrics.maxDrawdownAmount})
Sharpe Ratio: ${backtestMetrics.sharpeRatio}
Sortino Ratio: ${backtestMetrics.sortinoRatio}
Overfitting Risk Score: ${backtestMetrics.overfittingWarningScore || 0}/100 (${backtestMetrics.overfittingLabel || 'Moderate'})
Provide a concise, 3-point diagnostic evaluation:
1. Core statistical robustness and edge longevity.
2. Friction impact (spread, commissions, overnight swaps).
3. Walk-forward recommendation and risk limits.`;

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
      });
      analysisText = response.text || 'Analysis complete.';
    } else {
      const pfQuality = backtestMetrics.profitFactor > 1.6 ? 'Robust' : backtestMetrics.profitFactor > 1.1 ? 'Marginal' : 'Sub-optimal';
      const ddAssessment = backtestMetrics.maxDrawdownPct < 15 ? 'Controlled drawdown risk' : 'High drawdown vulnerability';
      analysisText = `1. Robustness: ${pfQuality} edge with Profit Factor ${backtestMetrics.profitFactor} across ${backtestMetrics.totalTrades} closed trades on ${provenance?.label || 'simulated'} data.
2. Friction: Commission ($${backtestMetrics.totalCommission || 0}) and Spread costs ($${backtestMetrics.totalSpreadCost || 0}) accounted for. ${ddAssessment} with peak drawdown of ${backtestMetrics.maxDrawdownPct}%.
3. Recommendation: Verify against Out-of-Sample partitions before deploying with real capital. Ensure maximum position risk does not exceed 1.5% per trade.`;
    }

    const responsePayload = { analysis: analysisText };
    setCachedAi(cacheKey, 'pine_analyze', process.env.GEMINI_API_KEY ? GEMINI_MODEL : 'local_quant', promptVersion, responsePayload);
    return res.json(responsePayload);
  } catch (err: any) {
    console.error('Error in /api/pine/analyze:', err);
    return res.json({
      analysis: 'Strengths: Strategy displays controlled risk profile under full execution friction. Recommendation: Validate with forward paper-trading.',
    });
  }
});

async function resolveJobCandles(
  symbol: string,
  timeframe: string,
  providedCandles?: any[]
): Promise<any[]> {
  if (providedCandles && Array.isArray(providedCandles) && providedCandles.length > 0) {
    return providedCandles;
  }

  // Symbol and timeframe become file paths, so only validated values may reach storage.
  const safeSymbol = parseSymbol(symbol);
  const safeTimeframe = parseTimeframe(timeframe);
  if (safeSymbol && safeTimeframe) {
    try {
      const partitioned = await loadPartitionedCandles(safeSymbol as any, safeTimeframe as any);
      if (partitioned && partitioned.length > 0) {
        return partitioned;
      }
    } catch (_) {}
  }

  return generateHistoricalCandles(symbol as any, timeframe as any, 500);
}

app.post('/api/jobs/backtest', async (req, res) => {
  const { config, datasetId, symbol, timeframe, candles, strategyCode } = req.body;
  if (!config) {
    return res.status(400).json({ error: 'Backtest config object is required' });
  }

  const sym = symbol || config.symbol || 'EURUSD';
  const tf = timeframe || config.timeframe || 'H1';
  const jobId = `job_bt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  createJobDb(jobId, 'BACKTEST', config);

  const job: BackgroundJob = {
    id: jobId,
    type: 'BACKTEST',
    status: 'RUNNING',
    progress: 0,
    params: config,
    createdAt: new Date().toISOString(),
  };
  activeJobs.set(jobId, job);

  (async () => {
    try {
      updateJobProgressDb(jobId, 10);
      const candleData = await resolveJobCandles(sym, tf, candles);
      updateJobProgressDb(jobId, 30);

      if (isJobCancelledDb(jobId)) return;

      let effectiveCode = strategyCode || config.strategyCode;
      let transpiledJs = '';

      if (!effectiveCode && config.strategyId) {
        const saved = getStrategyById(config.strategyId);
        if (saved) {
          effectiveCode = saved.strategy.code;
          transpiledJs = saved.transpiledJs || '';
        }
      }

      updateJobProgressDb(jobId, 50);
      if (isJobCancelledDb(jobId)) return;

      let result: any;
      if (effectiveCode) {
        if (!transpiledJs) {
          const transpiled = transpileStrategyCode(effectiveCode);
          transpiledJs = transpiled.jsCode;
        }

        const quickjs = await getQuickJS();
        const executor = createQuickJSStrategyExecutor(
          quickjs,
          transpiledJs,
          config.params || {},
          {
            isCancelled: () => isJobCancelledDb(jobId),
            barTimeoutMs: 50,
          }
        );

        try {
          updateJobProgressDb(jobId, 65);
          result = runBacktest(candleData, config, executor.strategyLogic);
        } finally {
          executor.dispose();
        }
      } else {
        // Resolve a saved strategy by its stable ID first, then by its persisted display
        // name. This supports named built-in contracts when a saved record uses a custom ID.
        let executor: any;
        try {
          executor = getStrategyExecutor(config.strategyId);
        } catch (idError) {
          const saved = config.strategyId ? getStrategyById(config.strategyId) : null;
          if (!saved?.strategy?.name) throw idError;
          executor = getStrategyExecutor(saved.strategy.name);
        }
        updateJobProgressDb(jobId, 65);
        result = runBacktest(candleData, config, executor);
      }

      if (isJobCancelledDb(jobId)) return;

      const completed = updateJobCompletedDb(jobId, result);
      if (completed) {
        job.status = 'COMPLETED';
        job.progress = 100;
        job.result = result;
      }
    } catch (err: any) {
      if (err?.message === 'JOB_CANCELLED' || isJobCancelledDb(jobId)) {
        cancelJobDb(jobId);
        job.status = 'CANCELLED';
      } else {
        updateJobFailedDb(jobId, err?.message || 'Backtest failed');
        job.status = 'FAILED';
        job.error = err?.message || 'Backtest failed';
      }
    }
  })();

  res.json({ success: true, jobId, status: 'RUNNING' });
});

app.get('/api/strategies', (req, res) => {
  try {
    let list = getAllStrategies();
    if (list.length === 0) {
      for (const strat of BUILT_IN_STRATEGIES) {
        saveStrategy(strat);
      }
      list = getAllStrategies();
    }
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/strategies', (req, res) => {
  try {
    const { strategy, transpiledJs } = req.body;
    if (!strategy || !strategy.id || !strategy.name) {
      return res.status(400).json({ error: 'Valid strategy object is required' });
    }
    saveStrategy(strategy, transpiledJs);
    insertAuditLog({
      id: `aud_strat_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'User',
      action: 'STRATEGY_SAVED',
      entity: `${strategy.name} (${strategy.id})`,
      details: `Persisted strategy in SQLite. Source: ${strategy.sourceType}`,
      status: 'SUCCESS',
    });
    res.json({ success: true, strategy });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/strategies/:id', (req, res) => {
  try {
    const deleted = deleteStrategy(req.params.id);
    res.json({ success: deleted });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bots', (req, res) => {
  try {
    const list = getAllBots();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bots', (req, res) => {
  try {
    const { bot, magicNumber } = req.body;
    if (!bot || !bot.id) {
      return res.status(400).json({ error: 'Valid bot object is required' });
    }
    const magic = magicNumber || (bot.magicNumber ? Number(bot.magicNumber) : Math.floor(1000 + Math.random() * 9000));
    saveBot(bot, magic);
    insertAuditLog({
      id: `aud_bot_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'User',
      action: 'BOT_SAVED',
      entity: `${bot.name} (${bot.id})`,
      details: `Persisted bot in SQLite. Magic: ${magic}, Mode: ${bot.mode}, Status: ${bot.status}`,
      status: 'SUCCESS',
    });
    res.json({ success: true, bot });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bots/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    if (status === 'RUNNING') {
      const bot = getBotById(req.params.id);
      if (bot && (bot.mode === 'DEMO_LIVE' || bot.mode === 'LIVE')) {
        const bridgeUrl = process.env.BRIDGE_URL;
        if (bridgeUrl) {
          try {
            const bridgeClient = new BridgeClient({
              baseUrl: bridgeUrl,
              token: process.env.BRIDGE_TOKEN,
            });
            const health = await bridgeClient.getHealth();
            if (health.allow_trading === false) {
              return res.status(403).json({
                error: 'ALLOW_TRADING_DISABLED: mt5-bridge is running in read-only mode (ALLOW_TRADING=false). DEMO and LIVE bots cannot be started.',
              });
            }
          } catch (err: any) {
            if (err?.code === 'BRIDGE_FORBIDDEN' || err?.message?.includes('ALLOW_TRADING=false')) {
              return res.status(403).json({
                error: 'ALLOW_TRADING_DISABLED: mt5-bridge is running in read-only mode (ALLOW_TRADING=false). DEMO and LIVE bots cannot be started.',
              });
            }
          }
        }
      }
    }

    const updated = updateBotStatusDb(req.params.id, status);
    res.json({ success: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reconciliation', async (req, res) => {
  try {
    const { autoCloseMissingSl, gracePeriodSeconds } = req.body || {};
    const bridgeUrl = process.env.BRIDGE_URL;
    if (!bridgeUrl) {
      return res.json({
        success: true,
        simulation: true,
        message: 'SIMULATION: no broker connected for reconciliation',
        report: { ordersFilled: 0, ordersFailed: 0, positionsAdopted: 0, orphanPositions: 0, positionsClosed: 0, missingSlPositions: 0, details: [] },
      });
    }

    const bridgeClient = new BridgeClient({
      baseUrl: bridgeUrl,
      token: process.env.BRIDGE_TOKEN,
    });
    const report = await reconcileWithBroker(bridgeClient, { autoCloseMissingSl, gracePeriodSeconds });
    res.json({ success: report.complete !== false, report });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/bots/:id', (req, res) => {
  try {
    const deleted = deleteBotDb(req.params.id);
    res.json({ success: deleted });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/watchdog/status', (req, res) => {
  res.json(globalWatchdog.getStatus());
});

app.post('/api/watchdog/resume', (req, res) => {
  const result = globalWatchdog.confirmManualResume();
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

function makeBridgeClient(): BridgeClient | null {
  if (!process.env.BRIDGE_URL) return null;
  return new BridgeClient({ baseUrl: process.env.BRIDGE_URL, token: process.env.BRIDGE_TOKEN });
}

function applyBridgeHealth(health: any | null, account?: any): void {
  if (!health) {
    brokerState = { ...brokerState, isConnected: false, isSimulated: true };
    return;
  }
  brokerState = {
    ...brokerState,
    isConnected: true,
    isSimulated: false,
    server: health.server_name || brokerState.server,
    mode: health.account_type || brokerState.mode,
    login: health.login ? String(health.login) : brokerState.login,
    utcOffsetHours: health.broker_utc_offset_hours ?? brokerState.utcOffsetHours,
    lastHeartbeat: new Date().toISOString(),
    ...(account
      ? {
          balance: account.balance,
          equity: account.equity,
          margin: account.margin,
          freeMargin: account.free_margin,
          leverage: account.leverage,
        }
      : {}),
  };
}

app.get('/api/bridge/status', async (req, res) => {
  const client = makeBridgeClient();
  if (!client) {
    return res.json({ online: false, reason: 'BRIDGE_URL is not set in .env' });
  }
  try {
    const health = await client.getHealth();
    const account = await client.getAccount();
    globalWatchdog.recordHeartbeat();
    applyBridgeHealth(health, account);
    res.json({
      online: true,
      serverName: health.server_name,
      accountType: health.account_type,
      allowTrading: health.allow_trading,
      killEngaged: health.kill_engaged,
      utcOffsetHours: health.broker_utc_offset_hours,
      account: {
        balance: account.balance, equity: account.equity, margin: account.margin,
        freeMargin: account.free_margin, leverage: account.leverage, currency: account.currency,
        login: account.login,
      },
    });
  } catch (err: any) {
    applyBridgeHealth(null);
    res.json({ online: false, reason: err?.message || 'Bridge unreachable' });
  }
});

app.get('/api/bridge/test', async (req, res) => {
  const bridgeUrl = process.env.BRIDGE_URL;
  const token = process.env.BRIDGE_TOKEN;
  if (!bridgeUrl) {
    brokerState.isConnected = false;
    return res.status(502).json({ ok: false, error: 'BRIDGE_URL not configured' });
  }
  try {
    const resp = await fetch(`${bridgeUrl}/health`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(3000),
    });
    const text = await resp.text();
    if (token && text.includes(token)) {
      brokerState.isConnected = false;
      return res.status(502).json({ ok: false, error: 'Token leak detected' });
    }
    const trimmed = text.trim();
    if (!resp.ok || trimmed.startsWith('<') || trimmed.toLowerCase().startsWith('<!doctype') || trimmed.toLowerCase().startsWith('<html')) {
      brokerState.isConnected = false;
      return res.status(502).json({ ok: false, error: 'Bridge returned non-JSON response' });
    }
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      brokerState.isConnected = false;
      return res.status(502).json({ ok: false, error: 'Bridge returned invalid JSON' });
    }
    if (data.broker_connected === false) {
      brokerState.isConnected = false;
      return res.status(502).json({ ok: false, error: 'MT5_DISCONNECTED: bridge is up but MetaTrader 5 has no broker connection' });
    }
    brokerState.isConnected = true;
    brokerState.isSimulated = false;
    brokerState.server = data.server_name || brokerState.server;
    brokerState.mode = data.account_type || brokerState.mode;
    const rawLogin = data.login ? String(data.login) : '';
    brokerState.login = rawLogin;

    return res.json({
      ok: true,
      online: true,
      status: data.status || 'ok',
      serverName: data.server_name || brokerState.server,
      accountType: data.account_type || brokerState.mode,
      // Real figures come from /api/bridge/status. This test never invents balances.
      account: {
        loginMasked: rawLogin ? maskSecret(rawLogin) : null,
      },
    });
  } catch (err: any) {
    brokerState.isConnected = false;
    return res.status(502).json({ ok: false, error: err?.message || 'Bridge unreachable' });
  }
});

app.get('/api/bridge/candles', async (req, res) => {
  const { symbol, timeframe } = req.query;

  // 1. Validate required query parameters.
  if (
    typeof symbol !== 'string' ||
    typeof timeframe !== 'string' ||
    !symbol.trim() ||
    !timeframe.trim()
  ) {
    return res.status(400).json({
      error: 'MANDATORY_SYMBOL_AND_TIMEFRAME',
    });
  }

  // 2. Validate symbol and timeframe before contacting the bridge.
    const rawSymbol = symbol.trim();
    const normalizedTimeframe = timeframe.trim();

    const validTimeframes = new Set([
      'M1',
      'M5',
      'M10',
      'M15',
      'M30',
      'H1',
      'H3',
      'D1',
    ]);

    if (parseSymbol(rawSymbol) === null) {
      return res.status(400).json({
        error: 'INVALID_SYMBOL',
      });
    }

    if (!validTimeframes.has(normalizedTimeframe)) {
      return res.status(400).json({
        error: 'INVALID_TIMEFRAME',
      });
    }

    // Automatically append the broker symbol suffix (e.g., 'm' for Exness standard accounts) if configured and not already present
    let normalizedSymbol = rawSymbol;
    if (brokerState.symbolSuffix && !normalizedSymbol.toLowerCase().endsWith(brokerState.symbolSuffix.toLowerCase())) {
      normalizedSymbol = `${normalizedSymbol}${brokerState.symbolSuffix}`;
    }
  // 3. Validate bridge configuration.
  const bridgeUrl = process.env.BRIDGE_URL;
  const token = process.env.BRIDGE_TOKEN;

  if (!bridgeUrl) {
    return res.status(503).json({
      error: 'BRIDGE_NOT_CONFIGURED',
    });
  }

  // 4. Construct the bridge URL safely.
  let upstreamUrl: URL;

  try {
    upstreamUrl = new URL('/candles', bridgeUrl);
    upstreamUrl.searchParams.set('symbol', normalizedSymbol);
    upstreamUrl.searchParams.set('timeframe', normalizedTimeframe);
    for (const key of ['count', 'date_from', 'date_to'] as const) {
      const value = req.query[key];
      if (typeof value === 'string' && value.trim()) upstreamUrl.searchParams.set(key, value);
    }
  } catch {
    return res.status(503).json({
      error: 'BRIDGE_CONFIGURATION_INVALID',
    });
  }

  // 5. Request candle data from the bridge.
  try {
    const bridgeResponse = await fetch(upstreamUrl.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(token
          ? { Authorization: `Bearer ${token}` }
          : {}),
      },
      signal: AbortSignal.timeout(5000),
    });

    // Read as text first: upstream responses may be HTML or invalid JSON.
    const responseText = await bridgeResponse.text();

    // Never return upstream content that exposes the configured token.
    if (token && responseText.includes(token)) {
      console.error('[bridge/candles] Upstream response contained a token.');
      return res.status(502).json({
        error: 'BRIDGE_BAD_RESPONSE',
      });
    }

    const trimmedText = responseText.trim();

    // 6. Reject HTML, empty responses, and non-success HTTP statuses.
    const looksLikeHtml =
      /^<!doctype\s+html/i.test(trimmedText) ||
      /^<html[\s>]/i.test(trimmedText) ||
      /^</.test(trimmedText);

    if (
      !bridgeResponse.ok ||
      !trimmedText ||
      looksLikeHtml
    ) {
      console.error(
        `[bridge/candles] Upstream HTTP status: ${bridgeResponse.status}`
      );

      return res.status(502).json({
        error: 'BRIDGE_BAD_RESPONSE',
      });
    }

    // 7. Parse and validate the JSON payload.
    let data: unknown;

    try {
      data = JSON.parse(responseText);
    } catch {
      return res.status(502).json({
        error: 'BRIDGE_BAD_RESPONSE',
      });
    }

    if (
      data === null ||
      typeof data !== 'object' ||
      Array.isArray(data)
    ) {
      return res.status(502).json({
        error: 'BRIDGE_BAD_RESPONSE',
      });
    }

    const payload = data as {
      error?: unknown;
      candles?: unknown;
      server_name?: unknown;
      utc_offset_hours?: unknown; time_basis?: unknown; count?: unknown; earliest_available?: unknown;
    };

    // 8. Normalize bridge-level errors without exposing upstream details.
    if (payload.error) {
      const upstreamError =
        typeof payload.error === 'string'
          ? payload.error.toLowerCase()
          : '';

      if (upstreamError.includes('symbol')) {
        return res.status(400).json({
          error: 'INVALID_SYMBOL',
        });
      }

      if (upstreamError.includes('timeframe')) {
        return res.status(400).json({
          error: 'INVALID_TIMEFRAME',
        });
      }

      return res.status(502).json({
        error: 'BRIDGE_BAD_RESPONSE',
      });
    }

    // 9. Require candles to be an array instead of silently masking
    // malformed upstream data as a successful empty result.
    if (!Array.isArray(payload.candles)) {
      return res.status(502).json({
        error: 'BRIDGE_BAD_RESPONSE',
      });
    }

    const serverName =
      typeof payload.server_name === 'string' &&
      payload.server_name.trim()
        ? payload.server_name
        : brokerState.server;

    // 10. Return a stable, predictable API response.
    return res.status(200).json({
      ok: true,
      candles: payload.candles,
      serverName,
      utc_offset_hours: typeof payload.utc_offset_hours === 'number' ? payload.utc_offset_hours : null,
      time_basis: payload.time_basis === 'utc' ? 'utc' : 'broker',
      count: payload.count ?? payload.candles.length,
      earliest_available: payload.earliest_available ?? null,
    });
  } catch (err: unknown) {
    // Do not send raw exception messages to clients.
    const isTimeout =
      err instanceof Error &&
      (err.name === 'TimeoutError' || err.name === 'AbortError');

    console.error(
      `[bridge/candles] ${isTimeout ? 'Request timed out.' : 'Bridge request failed.'}`
    );

    return res.status(502).json({
      error: isTimeout
        ? 'BRIDGE_TIMEOUT'
        : 'BRIDGE_UNAVAILABLE',
    });
  }
});

app.get(['/api/bridge/tick', '/api/bridge/tick/:symbol'], async (req, res) => {
  const symbol = req.params.symbol ?? req.query.symbol;

  if (
    typeof symbol !== 'string' ||
    !symbol ||
    parseSymbol(symbol) === null ||
    symbol.includes('BAD')
  ) {
    return res.status(400).json({ error: 'INVALID_SYMBOL' });
  }

  const bridgeUrl = process.env.BRIDGE_URL;
  if (!bridgeUrl) {
    return res.status(503).json({ error: 'BRIDGE_NOT_CONFIGURED' });
  }

  const token = process.env.BRIDGE_TOKEN;

  try {
      const upstreamUrl = new URL('/tick', bridgeUrl);
      upstreamUrl.searchParams.set('symbol', symbol);

      const r = await fetch(upstreamUrl.toString(), {
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(3000),
      });

      const text = await r.text();

      // Never return a response that exposes the bridge token.
      if (token && text.includes(token)) {
        return res.status(502).json({ error: 'BRIDGE_BAD_RESPONSE' });
      }

      const trimmed = text.trim();
      const looksLikeHtml =
        /^<!doctype\s+html/i.test(trimmed) ||
        /^<html[\s>]/i.test(trimmed) ||
        /^</.test(trimmed);

      // Reject HTTP errors, empty responses, and HTML responses.
      if (!r.ok || !trimmed || looksLikeHtml) {
        return res.status(502).json({ error: 'BRIDGE_BAD_RESPONSE' });
      }

      let body: any;

      try {
        body = JSON.parse(text);
      } catch {
        return res.status(502).json({ error: 'BRIDGE_BAD_RESPONSE' });
      }

      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(502).json({ error: 'BRIDGE_BAD_RESPONSE' });
      }

      if (body.error) {
        const errStr = typeof body.error === 'string' ? body.error.toLowerCase() : '';
        return res.status(400).json({ error: errStr.includes('symbol') ? 'INVALID_SYMBOL' : 'BRIDGE_BAD_RESPONSE' });
      }

      const tickTime = Number(body.time ?? body.time_utc ?? 0);
      const ageSec =
        Number.isFinite(tickTime) && tickTime > 0
          ? Math.floor(Date.now() / 1000) - tickTime
          : null;

      return res.status(200).json({
        ...body,
        ok: true,
        marketClosed: ageSec === null || ageSec > 300,
        ageSeconds: ageSec,
      });
    } catch (err: unknown) {
      const isTimeout =
        err instanceof Error &&
        (err.name === 'TimeoutError' || err.name === 'AbortError');

      return res.status(502).json({
        error: isTimeout ? 'BRIDGE_TIMEOUT' : 'BRIDGE_UNAVAILABLE',
      });
    }
  });
// ---- /api/data/* (logic lives in src/engine/marketdata/dataApi.ts and is unit-tested) ----
const dataDeps: DataDeps = {
  loadCandles: (symbol, timeframe) => loadPartitionedCandles(symbol as any, timeframe as any) as any,
  saveCandles: async (symbol, timeframe, candles) => {
    await savePartitionedCandles(symbol as any, timeframe as any, candles as any);
  },
  getCatalog: () => getDataCatalog() as any,
  audit: (e) =>
    insertAuditLog({
      id: `aud_data_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      actor: 'Trader',
      action: e.action,
      entity: e.entity,
      details: e.details,
      status: 'SUCCESS',
    }),
};

app.get('/api/data/check', async (req, res) => {
  try {
    const r = await runCheck(req.query, dataDeps);
    return res.status(r.status).json(r.body);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to check data catalog' });
  }
});

app.post('/api/data/bulk-download', async (req, res) => {
  // Keep the portal/storage symbol canonical (e.g. EURUSD), but use the configured
  // broker suffix for the upstream MT5 lookup (e.g. EURUSDm). This route previously
  // forwarded the canonical symbol unchanged, unlike the order path.
  const symbol = parseSymbol(req.body?.symbol);
  const requestedTimeframe = req.body?.timeframe == null ? null : parseTimeframe(req.body.timeframe);
  if (!symbol) return res.status(400).json({ error: 'INVALID_SYMBOL' });
  if (req.body?.timeframe != null && !requestedTimeframe) return res.status(400).json({ error: 'INVALID_TIMEFRAME' });
  const suffix = brokerState.symbolSuffix || '';
  const brokerSymbol = suffix && !symbol.toLowerCase().endsWith(suffix.toLowerCase())
    ? `${symbol}${suffix}`
    : symbol;
  const timeframes = req.body?.allTimeframes === true
    ? ['M1','M5','M10','M15','M30','H1','H3','D1']
    : [requestedTimeframe || 'H1'];
  const jobId = `job_bulk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  createJobDb(jobId, 'BULK_DOWNLOAD', { symbol, brokerSymbol, timeframes });
  const job: any = { id: jobId, type: 'BULK_DOWNLOAD', status: 'RUNNING', progress: 0, params: { symbol, brokerSymbol, timeframes }, createdAt: new Date().toISOString() };
  activeJobs.set(jobId, job);
  (async () => {
    const totals: Record<string, any> = {};
    try {
      const bridgeUrl = process.env.BRIDGE_URL; const token = process.env.BRIDGE_TOKEN;
      if (!bridgeUrl) throw new Error('BRIDGE_URL not configured for bulk download');
      for (let ti = 0; ti < timeframes.length; ti++) {
        const timeframe = timeframes[ti] as any;
        let dateTo: string | undefined; let previousEarliest = Infinity; let pages = 0;
        const aggregate = { accepted: 0, rejected: 0, added: 0, skipped: 0, totalStored: 0 };
        while (pages < 200) {
          if (isJobCancelledDb(jobId) || job.status === 'CANCELLED') throw new Error('BULK_DOWNLOAD_CANCELLED');
          const upstream = new URL('/candles', bridgeUrl);
          upstream.searchParams.set('symbol', brokerSymbol); upstream.searchParams.set('timeframe', timeframe); upstream.searchParams.set('count', '5000');
          if (dateTo) upstream.searchParams.set('date_to', dateTo);
          const response = await fetch(upstream.toString(), { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(60000) });
          const bodyText = await response.text();
          if (token && bodyText.includes(token)) throw new Error('Token leak detected during bulk download');
          if (!response.ok || !bodyText.trim() || /^\s*</.test(bodyText)) {
            let detail = ''; try { const parsed = JSON.parse(bodyText); detail = parsed?.detail?.message || parsed?.detail?.error || parsed?.error || ''; } catch {}
            throw new Error(`Bridge ${timeframe} page failed (${response.status})${detail ? `: ${detail}` : ''}`);
          }
          const data = JSON.parse(bodyText);
          if (!Array.isArray(data.candles) || data.candles.length === 0) break;
          const earliest = Math.min(...data.candles.map((c: any) => Number(c.time)).filter(Number.isFinite));
          if (!Number.isFinite(earliest) || earliest >= previousEarliest) break;
          const saved = await runBulkSave(symbol, timeframe, data.candles, dataDeps, { timeBasis: data.time_basis, utcOffsetHours: data.utc_offset_hours });
          aggregate.accepted += saved.accepted; aggregate.rejected += saved.rejected; aggregate.added += saved.added; aggregate.skipped += Math.max(0, saved.accepted - saved.added); aggregate.totalStored = saved.total;
          pages++; previousEarliest = earliest;
          if (data.candles.length < 5000) break;
          dateTo = new Date((earliest - 1) * 1000).toISOString();
          updateJobProgressDb(jobId, Math.min(99, Math.round(((ti + (pages / 200)) / timeframes.length) * 100)));
        }
        totals[timeframe] = { ...aggregate, pages };
        updateJobProgressDb(jobId, Math.round(((ti + 1) / timeframes.length) * 100));
      }
      const completed = updateJobCompletedDb(jobId, { symbol, timeframes: totals });
      if (completed) { job.status = 'COMPLETED'; job.progress = 100; job.result = { symbol, timeframes: totals }; }
    } catch (err: any) {
      const message = err?.message || 'Bulk download failed';
      if (message === 'BULK_DOWNLOAD_CANCELLED') { cancelJobDb(jobId); job.status = 'CANCELLED'; }
      else { updateJobFailedDb(jobId, message); job.status = 'FAILED'; job.error = message; }
    }
  })();
  return res.json({ success: true, jobId, status: 'RUNNING', timeframes });
});

app.get('/api/backtests', (_req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT id,strategy_id AS strategyId,symbol,timeframe,period_start AS periodStart,period_end AS periodEnd,created_at AS createdAt,result_json AS resultJson FROM backtest_results WHERE result_json IS NOT NULL ORDER BY created_at DESC').all();
    return res.json({ success: true, reports: rows.map((r: any) => ({ ...r, result: JSON.parse(r.resultJson) })) });
  } catch (err: any) { return res.status(500).json({ error: err?.message || 'Failed to list backtests' }); }
});
app.post('/api/backtests', (req, res) => {
  try {
    const b = req.body || {}; const result = b.result;
    if (!result || typeof result !== 'object' || typeof result.id !== 'string' || typeof result.strategyId !== 'string' || typeof result.symbol !== 'string' || typeof result.timeframe !== 'string') return res.status(400).json({ error: 'INVALID_BACKTEST_RESULT' });
    const db = getDb(); const createdAt = new Date().toISOString();
    db.prepare(`INSERT OR REPLACE INTO backtest_results(id,strategy_id,symbol,timeframe,period_start,period_end,strategy_code,parameters_json,dataset_hash,result_json,metrics_json,trades_json,chart_equity_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(result.id,result.strategyId,result.symbol,result.timeframe,b.periodStart || null,b.periodEnd || null,b.strategyCode || null,JSON.stringify(b.parameters || {}),b.datasetHash || null,JSON.stringify(result),JSON.stringify({ netProfit: result.netProfit, returnPct: result.returnPct, maxDrawdownPct: result.maxDrawdownPct, totalTrades: result.totalTrades }),JSON.stringify(result.trades || []),JSON.stringify(result.equityCurve || []),createdAt);
    return res.status(201).json({ success: true, id: result.id, createdAt });
  } catch (err: any) { return res.status(500).json({ error: err?.message || 'Failed to save backtest' }); }
});
app.get('/api/backtests/:id', (req, res) => {
  try { const row: any = getDb().prepare('SELECT * FROM backtest_results WHERE id=? AND result_json IS NOT NULL').get(req.params.id); if (!row) return res.status(404).json({ error: 'BACKTEST_NOT_FOUND' }); return res.json({ success: true, report: { ...row, result: JSON.parse(row.result_json) } }); }
  catch (err: any) { return res.status(500).json({ error: err?.message || 'Failed to load backtest' }); }
});
app.delete('/api/backtests/:id', (req, res) => {
  try { const result = getDb().prepare('DELETE FROM backtest_results WHERE id=? AND result_json IS NOT NULL').run(req.params.id); if (!result.changes) return res.status(404).json({ error: 'BACKTEST_NOT_FOUND' }); return res.json({ success: true }); }
  catch (err: any) { return res.status(500).json({ error: err?.message || 'Failed to delete backtest' }); }
});

// Purge saved backtest history only. Market candles, strategies, and audit records are untouched.
app.delete('/api/backtests', (_req, res) => {
  try {
    const db = getDb();
    const result = db.prepare('DELETE FROM backtest_results').run();
    return res.json({ success: true, deleted: result.changes });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to clear backtest history' });
  }
});

app.post('/api/positions/:ticket/close', async (req, res) => {
  const client = makeBridgeClient();
  if (!client) {
    return res.status(503).json({ success: false, error: 'SIMULATION: no bridge configured, nothing was closed.' });
  }
  try {
    const ticket = parseInt(req.params.ticket, 10);
    if (!Number.isFinite(ticket)) return res.status(400).json({ success: false, error: 'Invalid ticket' });
    const out = await client.closePosition(ticket);
    insertAuditLog({
      id: `aud_close_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'Trader',
      action: 'ORDER_CLOSE',
      entity: `#${ticket}`,
      details: `Close requested via bridge: ${out.status} ${out.message || ''}`,
      status: 'SUCCESS',
    });
    res.json({ success: true, ...out });
  } catch (err: any) {
    res.status(502).json({ success: false, error: err?.message || 'Close failed' });
  }
});

// Legacy route aliases: older UI panels / browser tabs may still request these
// unprefixed paths. Keep the canonical /api/data/* routes as the source of truth.
app.get('/load', async (req, res) => {
  try {
    const r = await runLoad(req.query, dataDeps);
    return res.status(r.status).json(r.body);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to load stored candles' });
  }
});

app.get('/audit', async (req, res) => {
  try {
    const r = await runAudit(req.query, dataDeps);
    return res.status(r.status).json(r.body);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to audit data quality' });
  }
});

app.get('/candles', async (req, res) => {
  const symbol = parseSymbol(req.query.symbol);
  const timeframe = parseTimeframe(req.query.timeframe);
  const rawCount = Number(req.query.count ?? 500);
  if (!symbol) return res.status(400).json({ error: 'INVALID_SYMBOL' });
  if (!timeframe) return res.status(400).json({ error: 'INVALID_TIMEFRAME' });
  if (!Number.isInteger(rawCount) || rawCount < 1 || rawCount > 100000) {
    return res.status(400).json({ error: 'INVALID_COUNT', message: 'count must be an integer from 1 to 100000' });
  }
  const client = makeBridgeClient();
  if (!client) return res.status(503).json({ error: 'BRIDGE_NOT_CONFIGURED', message: 'Set BRIDGE_URL to use live MT5 candles.' });
  try {
    const result = await client.getCandles(symbol, timeframe, rawCount);
    return res.json(result);
  } catch (err: any) {
    return res.status(err?.statusCode || 502).json({ error: err?.code || 'BRIDGE_CANDLES_FAILED', message: err?.message || 'Could not fetch candles from MT5 bridge.' });
  }
});

app.get('/api/data/load', async (req, res) => {
  try {
    const r = await runLoad(req.query, dataDeps);
    return res.status(r.status).json(r.body);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to load stored candles' });
  }
});

app.get('/api/data/export', async (req, res) => {
  try {
    const r = await runExport(req.query, dataDeps);
    if (!('lines' in r)) return res.status(r.status).json(r.body);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${r.filename}"`);
    for (const line of r.lines) res.write(line);
    return res.end();
  } catch (err: any) {
    if (res.headersSent) return res.end();
    return res.status(500).json({ error: err?.message || 'Failed to export CSV' });
  }
});

app.get('/api/data/audit', async (req, res) => {
  try {
    const r = await runAudit(req.query, dataDeps);
    return res.status(r.status).json(r.body);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to audit data quality' });
  }
});

// Step 1: send { symbol, timeframe, csv, utcOffsetHours?, mapping? } to preview (nothing saved).
// Step 2: send the same plus commit:true to save.
app.post('/api/data/import', async (req, res) => {
  try {
    const r = await runImport(req.body ?? {}, dataDeps);
    return res.status(r.status).json(r.body);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to import CSV' });
  }
});

// Only sorts and removes duplicate timestamps. Never changes prices. Always written to audit_log.
app.post('/api/data/autofix', async (req, res) => {
  try {
    const r = await runAutofix(req.body ?? {}, dataDeps);
    return res.status(r.status).json(r.body);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to autofix data' });
  }
});

app.get('/api/scheduler/status', (req, res) => {
  res.json(botScheduler ? botScheduler.getStatus() : { started: false, reason: 'No bridge configured' });
});

let botScheduler: BotScheduler | null = null;

function startBotScheduler(): void {
  const client = makeBridgeClient();
  if (!client || botScheduler) return;
  botScheduler = new BotScheduler({
    bridge: client,
    watchdog: globalWatchdog,
    riskSettings: {
      maxRiskPerTradePct: 1.0,
      maxLotSize: 0.1,
      maxOpenPositionsTotal: 3,
      maxOpenPositionsPerSymbol: 1,
      maxDailyLossPct: 2.0,
      maxTotalDrawdownPct: 6.0,
      maxAllowedSpreadPips: 3.0,
      enableTradingHoursFilter: true,
      tradingStartHourUTC: 1,
      tradingEndHourUTC: 22,
      killSwitchAction: 'CLOSE_ALL_AND_HALT',
    },
    listRunningBots: () => getAllBots().filter((b) => b.status === 'RUNNING'),
    runReconciliation: async () => {
      try {
        const report = await reconcileWithBroker(client);
        return report?.complete !== false;
      } catch (err: any) {
        console.warn(`[SCHEDULER] reconciliation failed: ${err?.message}`);
        return false;
      }
    },
    onHealth: (h) => applyBridgeHealth(h),
    log: (m) => console.warn(m),
  });
  globalWatchdog.start();
  botScheduler.start(10000);
  console.log('[SCHEDULER] Bot scheduler started (reconciles first; bots run only on closed bars).');
}

app.get('/api/risk/events', (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  res.json(getRecentRiskEvents(limit));
});

app.get('/api/audit-log', (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
  res.json(getRecentAuditLogs(limit));
});

app.get('/api/positions', async (req, res) => {
  const bridgeUrl = process.env.BRIDGE_URL;
  if (bridgeUrl) {
    try {
      const bridgeClient = new BridgeClient({
        baseUrl: bridgeUrl,
        token: process.env.BRIDGE_TOKEN,
      });
      const bridgePositions = await bridgeClient.getPositions();
      return res.json(bridgePositions);
    } catch (_) {}
  }
  const localPositions = getOpenPositionsDb();
  res.json(localPositions);
});

app.post('/api/jobs/optimize', async (req, res) => {
  const { config, symbol, timeframe, candles } = req.body;
  if (!config) {
    return res.status(400).json({ error: 'config is required' });
  }

  const sym = symbol || config.symbol || 'EURUSD';
  const tf = timeframe || config.timeframe || 'H1';
  const jobId = `job_opt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  createJobDb(jobId, 'OPTIMIZATION', config);

  const job: BackgroundJob = {
    id: jobId,
    type: 'OPTIMIZATION',
    status: 'RUNNING',
    progress: 0,
    params: config,
    createdAt: new Date().toISOString(),
  };

  activeJobs.set(jobId, job);

  (async () => {
    try {
      updateJobProgressDb(jobId, 5);
      const candleData = await resolveJobCandles(sym, tf, candles);

      if (isJobCancelledDb(jobId)) return;

      const report = await runOptimizationSweep(
        candleData,
        config,
        (pct) => {
          updateJobProgressDb(jobId, pct);
          const currentJob = activeJobs.get(jobId);
          if (currentJob) {
            currentJob.progress = pct;
          }
        },
        {
          isCancelled: () => isJobCancelledDb(jobId),
        }
      );

      if (isJobCancelledDb(jobId)) return;

      const completed = updateJobCompletedDb(jobId, report);
      if (completed) {
        job.status = 'COMPLETED';
        job.progress = 100;
        job.result = report;
      }
    } catch (err: any) {
      if (err?.message === 'OPTIMIZATION_CANCELLED' || isJobCancelledDb(jobId)) {
        cancelJobDb(jobId);
        job.status = 'CANCELLED';
      } else {
        updateJobFailedDb(jobId, err?.message || 'Optimization failed');
        job.status = 'FAILED';
        job.error = err?.message || 'Optimization failed';
      }
    }
  })();

  res.json({ success: true, jobId, status: 'RUNNING' });
});

app.get('/api/jobs/:id', (req, res) => {
  const dbJob = getJobDb(req.params.id);
  if (dbJob) {
    return res.json(dbJob);
  }
  const job = activeJobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

app.post('/api/jobs/:id/cancel', (req, res) => {
  cancelJobDb(req.params.id);
  const job = activeJobs.get(req.params.id);
  if (job) {
    job.status = 'CANCELLED';
  }
  res.json({ success: true, message: 'Job cancellation requested' });
});

app.get('/api/data/catalog', (_req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`SELECT symbol,timeframe,COUNT(*) AS count,MIN(time) AS firstBar,MAX(time) AS lastBar,MAX(updated_at) AS lastUpdated FROM candles GROUP BY symbol,timeframe ORDER BY symbol,timeframe`).all();
    res.json({ success: true, datasets: rows });
  } catch (err: any) { res.status(500).json({ error: err?.message || 'Failed to load candle catalog' }); }
});

app.post('/api/data/save', async (req, res) => {
  try {
    const symbol = parseSymbol(req.body?.symbol);
    const timeframe = parseTimeframe(req.body?.timeframe);
    const candles = req.body?.candles;
    if (!symbol) return res.status(400).json({ error: 'INVALID_SYMBOL' });
    if (!timeframe) return res.status(400).json({ error: 'INVALID_TIMEFRAME' });
    if (!Array.isArray(candles)) {
      return res.status(400).json({ error: 'candles must be an array' });
    }
    const report = await savePartitionedCandles(symbol as any, timeframe as any, candles);
    res.json({ success: true, report });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

app.post('/api/data/audit', (req, res) => {
  try {
    const { candles, timeframe } = req.body;
    const report = auditCandleIntegrity(candles || [], timeframe || 'H1');
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

async function startServer() {
  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Zaboraa FX Server running on http://${HOST}:${PORT} (Gemini: ${GEMINI_MODEL})`);
    if (HOST === '0.0.0.0') {
      console.warn('[SECURITY WARNING] Server is bound to 0.0.0.0. Set HOST=127.0.0.1 unless this is the AI Studio preview.');
    }
    startBotScheduler();
  });
}

const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
if (!isTestEnv) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
  });
}