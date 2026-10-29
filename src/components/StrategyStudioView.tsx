import React, { useState, useEffect } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Edit3,
  FileCode,
  Info,
  Play,
  Plus,
  RotateCcw,
  Save,
  Shield,
  ShieldCheck,
  Sliders,
  Trash2,
} from 'lucide-react';
import {
  BUILT_IN_STRATEGIES,
  executeStrategyBar,
  StrategyDefinition,
  validateStrategySecurity,
} from '../engine/workerSandbox';
import { DatasetRecord } from '../types/forex';

interface StrategyStudioViewProps {
  datasets: DatasetRecord[];
  strategies?: StrategyDefinition[];
  initialStrategyId?: string;
  onSaveStrategy: (strategy: StrategyDefinition) => void;
  onCreateStrategy?: (strategy: StrategyDefinition) => void;
  onDeleteStrategy?: (id: string) => void;
}

export const StrategyStudioView: React.FC<StrategyStudioViewProps> = ({
  datasets,
  strategies = BUILT_IN_STRATEGIES,
  initialStrategyId,
  onSaveStrategy,
  onCreateStrategy,
  onDeleteStrategy,
}) => {
  const [strategyList, setStrategyList] = useState<StrategyDefinition[]>(strategies);
  const initialStrat =
    (initialStrategyId && strategies.find((s) => s.id === initialStrategyId)) ||
    strategies[0] ||
    BUILT_IN_STRATEGIES[0];
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyDefinition>(initialStrat);

  // Editable Form State
  const [editName, setEditName] = useState<string>(selectedStrategy.name);
  const [editDescription, setEditDescription] = useState<string>(selectedStrategy.description);
  const [editAuthor, setEditAuthor] = useState<string>(selectedStrategy.author);
  const [editVersion, setEditVersion] = useState<string>(selectedStrategy.version);
  const [code, setCode] = useState<string>(selectedStrategy.code);
  const [params, setParams] = useState<Record<string, any>>(selectedStrategy.params || {});

  // New parameter draft
  const [newParamKey, setNewParamKey] = useState<string>('');
  const [newParamValue, setNewParamValue] = useState<string>('');
  const [newParamType, setNewParamType] = useState<'number' | 'string' | 'boolean'>('number');

  // Active Editor Sub-tab
  const [activeEditorTab, setActiveEditorTab] = useState<'code' | 'params' | 'meta'>('code');

  // Feedback states
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [smokeOutput, setSmokeOutput] = useState<{
    success: boolean;
    logs: string[];
    signalsCount: number;
    error?: string;
  } | null>(null);

  // Sync when strategy selection changes
  const handleSelectStrategy = (strat: StrategyDefinition) => {
    setSelectedStrategy(strat);
    setEditName(strat.name);
    setEditDescription(strat.description);
    setEditAuthor(strat.author);
    setEditVersion(strat.version);
    setCode(strat.code);
    setParams(strat.params || {});
    setSmokeOutput(null);
    setSaveSuccessMsg(null);
  };

  // Sync when initialStrategyId changes
  useEffect(() => {
    if (initialStrategyId) {
      const match = strategies.find((s) => s.id === initialStrategyId);
      if (match) {
        handleSelectStrategy(match);
      }
    }
  }, [initialStrategyId]);

  // Sync when external strategies prop updates
  useEffect(() => {
    setStrategyList(strategies);
    if (!strategies.some((s) => s.id === selectedStrategy.id)) {
      if (strategies[0]) handleSelectStrategy(strategies[0]);
    }
  }, [strategies]);

  // Handle Save
  const handleSave = async () => {
    // 1. Static AST Security Check
    const sec = validateStrategySecurity(code);
    if (!sec.valid) {
      setSmokeOutput({
        success: false,
        logs: [],
        signalsCount: 0,
        error: sec.error,
      });
      return;
    }

    const updatedStrategy: StrategyDefinition = {
      ...selectedStrategy,
      name: editName.trim() || selectedStrategy.name,
      description: editDescription.trim(),
      author: editAuthor.trim() || 'Custom Trader',
      version: editVersion.trim() || '1.0.0',
      params,
      code,
    };

    // Call prop callback
    onSaveStrategy(updatedStrategy);

    // Save to server SQLite backend
    try {
      await fetch('/api/strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedStrategy),
      });
    } catch {}

    // Update local state list
    setStrategyList((prev) => {
      const idx = prev.findIndex((s) => s.id === updatedStrategy.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = updatedStrategy;
        return copy;
      }
      return [...prev, updatedStrategy];
    });

    setSelectedStrategy(updatedStrategy);
    setSaveSuccessMsg(`Strategy "${updatedStrategy.name}" successfully saved! It is now active in the Backtest Lab and Bots Fleet.`);
    setTimeout(() => setSaveSuccessMsg(null), 5000);
  };

  // Handle Create New Custom Strategy
  const handleCreateNew = () => {
    const newId = `custom-strat-${Date.now()}`;
    const newStrat: StrategyDefinition = {
      id: newId,
      name: 'Custom Breakout Strategy',
      description: 'User-defined algorithmic strategy with customizable stop-loss and take-profit targets.',
      author: 'Trader',
      version: '1.0.0',
      params: {
        riskLots: 1.0,
        stopLossPips: 25,
        takeProfitPips: 50,
      },
      code: `// Custom Trading Strategy Contract
function onBar(ctx, bar) {
  const idx = ctx.currentBarIndex;
  if (idx < 20) return;

  const pipScale = ctx.symbol === 'USDJPY' ? 0.01 : ctx.symbol === 'XAUUSD' ? 1.0 : 0.0001;

  // Simple Momentum Breakout logic
  if (ctx.openPositions.length === 0) {
    const prevBar = ctx.getBar(idx - 1);
    if (bar.close > prevBar.high) {
      const sl = Number((bar.close - 25 * pipScale).toFixed(5));
      const tp1 = Number((bar.close + 40 * pipScale).toFixed(5));
      const tp2 = Number((bar.close + 75 * pipScale).toFixed(5));
      ctx.buy(ctx.symbol, 1.0, sl, tp1, tp2);
      ctx.log('Buy signal generated @ ' + bar.close);
    }
  }
}`,
    };

    if (onCreateStrategy) {
      onCreateStrategy(newStrat);
    }
    setStrategyList((prev) => [...prev, newStrat]);
    handleSelectStrategy(newStrat);
    setActiveEditorTab('code');
  };

  // Handle Duplicate
  const handleDuplicate = () => {
    const dupId = `strat-copy-${Date.now()}`;
    const duplicated: StrategyDefinition = {
      ...selectedStrategy,
      id: dupId,
      name: `${editName} (Copy)`,
      author: `${editAuthor || 'Trader'}`,
      code,
      params: { ...params },
    };

    if (onCreateStrategy) {
      onCreateStrategy(duplicated);
    }
    setStrategyList((prev) => [...prev, duplicated]);
    handleSelectStrategy(duplicated);
    setSaveSuccessMsg(`Strategy duplicated as "${duplicated.name}".`);
    setTimeout(() => setSaveSuccessMsg(null), 4000);
  };

  // Handle Delete
  const handleDelete = async (id: string) => {
    if (confirm(`Are you sure you want to delete strategy "${selectedStrategy.name}"?`)) {
      if (onDeleteStrategy) {
        onDeleteStrategy(id);
      }
      try {
        await fetch(`/api/strategies/${id}`, { method: 'DELETE' });
      } catch {}

      const remaining = strategyList.filter((s) => s.id !== id);
      setStrategyList(remaining);
      if (remaining.length > 0) {
        handleSelectStrategy(remaining[0]);
      }
    }
  };

  // Parameter Editing
  const handleParamChange = (key: string, value: any) => {
    setParams((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleAddParam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newParamKey.trim()) return;

    let parsedVal: any = newParamValue;
    if (newParamType === 'number') {
      parsedVal = parseFloat(newParamValue) || 0;
    } else if (newParamType === 'boolean') {
      parsedVal = newParamValue.toLowerCase() === 'true';
    }

    setParams((prev) => ({
      ...prev,
      [newParamKey.trim()]: parsedVal,
    }));

    setNewParamKey('');
    setNewParamValue('');
  };

  const handleDeleteParam = (key: string) => {
    setParams((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  // Smoke Test Sandbox
  const handleRunSmokeTest = () => {
    const sec = validateStrategySecurity(code);
    if (!sec.valid) {
      setSmokeOutput({
        success: false,
        logs: [],
        signalsCount: 0,
        error: sec.error,
      });
      return;
    }

    const testDataset = datasets[0];
    if (!testDataset || testDataset.candles.length < 30) {
      setSmokeOutput({
        success: false,
        logs: [],
        signalsCount: 0,
        error: 'No valid test candles available for sandbox smoke test.',
      });
      return;
    }

    const testContext = {
      symbol: testDataset.symbol,
      balance: 10000,
      equity: 10000,
      openPositions: [],
    };

    let totalSignals = 0;
    const accumulatedLogs: string[] = [];

    try {
      for (let i = 25; i < 45; i++) {
        const res = executeStrategyBar(code, testDataset.candles, i, testContext);
        if (res.error) {
          throw new Error(res.error);
        }
        totalSignals += res.signals.length;
        accumulatedLogs.push(...res.logs);
      }

      setSmokeOutput({
        success: true,
        logs: accumulatedLogs.slice(0, 10),
        signalsCount: totalSignals,
      });
    } catch (err: any) {
      setSmokeOutput({
        success: false,
        logs: accumulatedLogs,
        signalsCount: totalSignals,
        error: err?.message || 'Sandbox execution failure',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Notice */}
      <div className="flex items-center justify-between px-4 py-2.5 rounded-lg border border-primary/30 bg-primary/10 text-xs text-primary">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-primary shrink-0" />
          <span>
            <strong>Strategy Studio & Parameter Studio:</strong> You can edit logic, add custom parameters, clone presets, and create brand-new algorithmic strategies.
          </span>
        </div>
        <button
          type="button"
          onClick={handleCreateNew}
          className="flex items-center gap-1 px-3 py-1 rounded bg-primary hover:bg-primary text-white font-bold font-mono shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          Create New Strategy
        </button>
      </div>

      {/* Save Success Banner */}
      {saveSuccessMsg && (
        <div className="p-3 rounded-lg border border-success/30 bg-success/10 text-success text-xs flex items-center gap-2 font-mono">
          <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar: Strategy List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Strategy Catalog ({strategyList.length})
            </h3>
            <button
              type="button"
              onClick={handleCreateNew}
              className="text-xs text-primary hover:text-primary font-bold flex items-center gap-0.5"
            >
              <Plus className="w-3 h-3" /> New
            </button>
          </div>

          <div className="space-y-2">
            {strategyList.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSelectStrategy(s)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selectedStrategy.id === s.id
                    ? 'border-primary bg-primary/10 ring-1 ring-primary shadow-sm'
                    : 'border-border bg-bg hover:bg-surface'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-white line-clamp-1">{s.name}</span>
                  {s.id.startsWith('custom') || s.id.startsWith('strat-copy') ? (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-primary/20 text-primary font-mono">
                      Custom
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-text-muted mt-1 line-clamp-2">
                  {s.description}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs font-mono text-text-muted">
                  <span>v{s.version}</span>
                  <span className="text-primary">
                    {Object.keys(s.params || {}).length} params
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Main Editor Area */}
        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-lg border border-border bg-surface p-4 shadow-xl">
            {/* Header with Title and Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-primary" />
                  {editName}
                </h2>
                <span className="text-xs text-text-muted">
                  Author: {editAuthor} · Version: {editVersion} · Contract: onBar(ctx, bar)
                </span>
              </div>

              {/* Action Buttons: Save, Duplicate, Delete, Smoke Test */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleRunSmokeTest}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-surface hover:bg-surface text-text border border-border"
                >
                  <Play className="w-3.5 h-3.5 fill-current text-primary" />
                  Smoke Test
                </button>

                <button
                  type="button"
                  onClick={handleDuplicate}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-surface hover:bg-surface text-text border border-border"
                >
                  <Copy className="w-3.5 h-3.5 text-primary" />
                  Duplicate
                </button>

                {(selectedStrategy.id.startsWith('custom') || selectedStrategy.id.startsWith('strat-copy')) && (
                  <button
                    type="button"
                    onClick={() => handleDelete(selectedStrategy.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-danger/10 hover:bg-danger/20 text-danger border border-danger/30"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-danger" />
                    Delete
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSave}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-bold bg-primary hover:bg-primary text-white shadow-md shadow-primary/30 transition-all"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Strategy
                </button>
              </div>
            </div>

            {/* Navigation Tabs for Editor: Code, Parameters, Details */}
            <div className="flex items-center gap-2 mt-3 pb-2 border-b border-border text-xs font-mono">
              <button
                type="button"
                onClick={() => setActiveEditorTab('code')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-all ${
                  activeEditorTab === 'code'
                    ? 'bg-primary text-white font-bold'
                    : 'text-text-muted hover:text-text hover:bg-surface'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>Code & Logic onBar()</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveEditorTab('params')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-all ${
                  activeEditorTab === 'params'
                    ? 'bg-primary text-white font-bold'
                    : 'text-text-muted hover:text-text hover:bg-surface'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Parameters ({Object.keys(params).length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveEditorTab('meta')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-all ${
                  activeEditorTab === 'meta'
                    ? 'bg-primary text-white font-bold'
                    : 'text-text-muted hover:text-text hover:bg-surface'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Strategy Info</span>
              </button>
            </div>

            {/* TAB 1: CODE EDITOR */}
            {activeEditorTab === 'code' && (
              <div className="mt-3">
                <textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  rows={20}
                  spellCheck={false}
                  className="w-full rounded bg-bg p-3 font-mono text-xs leading-relaxed text-text border border-border focus:outline-none focus:border-primary"
                />
              </div>
            )}

            {/* TAB 2: PARAMETERS EDITOR */}
            {activeEditorTab === 'params' && (
              <div className="mt-3 space-y-4">
                <p className="text-xs text-text-muted">
                  Parameters defined here can be accessed directly in your code via <code className="text-primary font-mono">ctx.params</code> or tuned inside the Parameter Sweep Heatmap matrix.
                </p>

                {/* Parameter List */}
                <div className="space-y-2">
                  {Object.entries(params).map(([key, val]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-3 p-2.5 rounded bg-bg border border-border text-xs font-mono"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-text">{key}:</span>
                        <span className="text-xs text-text-muted font-sans uppercase">
                          ({typeof val})
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {typeof val === 'boolean' ? (
                          <button
                            type="button"
                            onClick={() => handleParamChange(key, !val)}
                            className={`px-3 py-1 rounded font-bold text-xs ${
                              val ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'
                            }`}
                          >
                            {val ? 'TRUE' : 'FALSE'}
                          </button>
                        ) : typeof val === 'number' ? (
                          <input
                            type="number"
                            step="any"
                            value={val}
                            onChange={(e) => handleParamChange(key, parseFloat(e.target.value) || 0)}
                            className="w-32 px-2 py-1 rounded bg-bg border border-border text-text text-right focus:outline-none focus:border-primary"
                          />
                        ) : (
                          <input
                            type="text"
                            value={val}
                            onChange={(e) => handleParamChange(key, e.target.value)}
                            className="w-48 px-2 py-1 rounded bg-bg border border-border text-text focus:outline-none focus:border-primary"
                          />
                        )}

                        <button
                          type="button"
                          onClick={() => handleDeleteParam(key)}
                          title="Remove Parameter"
                          className="p-1 rounded text-text-muted hover:text-danger hover:bg-bg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add Parameter Form */}
                <form
                  onSubmit={handleAddParam}
                  className="p-3 rounded-lg bg-bg border border-border flex flex-wrap items-center gap-3 text-xs"
                >
                  <span className="font-bold text-text-muted">Add Parameter:</span>
                  <input
                    type="text"
                    placeholder="Key (e.g. stopLossPips)"
                    value={newParamKey}
                    onChange={(e) => setNewParamKey(e.target.value)}
                    className="px-2.5 py-1.5 rounded bg-bg border border-border text-text font-mono text-xs focus:outline-none focus:border-primary"
                  />
                  <input
                    type="text"
                    placeholder="Initial Value (e.g. 25)"
                    value={newParamValue}
                    onChange={(e) => setNewParamValue(e.target.value)}
                    className="px-2.5 py-1.5 rounded bg-bg border border-border text-text font-mono text-xs focus:outline-none focus:border-primary"
                  />
                  <select
                    value={newParamType}
                    onChange={(e: any) => setNewParamType(e.target.value)}
                    className="px-2 py-1.5 rounded bg-bg border border-border text-text-muted text-xs font-mono"
                  >
                    <option value="number">Number</option>
                    <option value="string">String</option>
                    <option value="boolean">Boolean</option>
                  </select>
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded bg-primary hover:bg-primary text-white font-bold text-xs"
                  >
                    Add
                  </button>
                </form>
              </div>
            )}

            {/* TAB 3: METADATA & DETAILS */}
            {activeEditorTab === 'meta' && (
              <div className="mt-3 space-y-3 text-xs font-sans">
                <div>
                  <label className="block text-text-muted text-xs mb-1">Strategy Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-bg border border-border text-text font-bold focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-text-muted text-xs mb-1">Author / Source</label>
                    <input
                      type="text"
                      value={editAuthor}
                      onChange={(e) => setEditAuthor(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-bg border border-border text-text focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-text-muted text-xs mb-1">Version</label>
                    <input
                      type="text"
                      value={editVersion}
                      onChange={(e) => setEditVersion(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-bg border border-border text-text font-mono focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-text-muted text-xs mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-bg border border-border text-text focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            )}

            {/* Smoke Test Sandbox Output */}
            {smokeOutput && (
              <div
                className={`mt-3 p-3 rounded-lg border text-xs font-mono ${
                  smokeOutput.success
                    ? 'bg-success/10 border-success/30 text-success'
                    : 'bg-danger/10 border-danger/30 text-danger'
                }`}
              >
                <div className="flex items-center gap-2 font-bold mb-1">
                  {smokeOutput.success ? (
                    <CheckCircle2 className="w-4 h-4 text-success" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-danger" />
                  )}
                  <span>
                    {smokeOutput.success
                      ? `Sandbox Smoke Test Passed: ${smokeOutput.signalsCount} signals generated with zero lookahead violations.`
                      : `Sandbox Execution Failed: ${smokeOutput.error}`}
                  </span>
                </div>
                {smokeOutput.logs.length > 0 && (
                  <div className="mt-2 space-y-0.5 text-xs text-text-muted bg-bg p-2 rounded border border-border">
                    {smokeOutput.logs.map((l, i) => (
                      <div key={i}>{l}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
