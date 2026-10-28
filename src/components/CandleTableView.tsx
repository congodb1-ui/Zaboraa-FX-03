import React, { useEffect, useState } from 'react';
import { Candle, SymbolName, Timeframe } from '../types/forex';

export const CandleTableView: React.FC<{ symbol: SymbolName; timeframe: Timeframe }> = ({ symbol, timeframe }) => {
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolName>(symbol);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>(timeframe);
  const [rows, setRows] = useState<Candle[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true); setError('');
    try {
      const q = new URLSearchParams({ symbol: selectedSymbol, timeframe: selectedTimeframe, limit: '500' });
      if (from) q.set('from', from); if (to) q.set('to', to);
      const r = await fetch(`/api/data/load?${q}`); const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.message || j.error || 'Could not load stored candles');
      setRows(j.candles || []);
    } catch (e: any) { setError(e?.message || 'Could not load stored candles'); setRows([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [selectedSymbol, selectedTimeframe]);
  return <section className="bg-[#0D1322] border border-slate-800 rounded-xl p-4 space-y-3">
    <div className="flex flex-wrap items-end gap-3">
      <div><label className="block text-xs text-slate-400 mb-1">Symbol</label><select value={selectedSymbol} onChange={e=>setSelectedSymbol(e.target.value as SymbolName)} className="bg-slate-900 border border-slate-700 rounded p-2 text-xs text-white"><option>EURUSD</option><option>GBPUSD</option><option>USDJPY</option><option>XAUUSD</option></select></div>
      <div><label className="block text-xs text-slate-400 mb-1">Timeframe</label><select value={selectedTimeframe} onChange={e=>setSelectedTimeframe(e.target.value as Timeframe)} className="bg-slate-900 border border-slate-700 rounded p-2 text-xs text-white">{['M1','M5','M10','M15','M30','H1','H3','D1'].map(tf=><option key={tf}>{tf}</option>)}</select></div>
      <div><label className="block text-xs text-slate-400 mb-1">From (UTC)</label><input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="bg-slate-900 border border-slate-700 rounded p-2 text-xs text-white" /></div>
      <div><label className="block text-xs text-slate-400 mb-1">To (UTC)</label><input type="date" value={to} onChange={e=>setTo(e.target.value)} className="bg-slate-900 border border-slate-700 rounded p-2 text-xs text-white" /></div>
      <button onClick={()=>void load()} className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Load candles</button>
      <a href={`/api/data/export?symbol=${encodeURIComponent(selectedSymbol)}&timeframe=${encodeURIComponent(selectedTimeframe)}${from?`&from=${encodeURIComponent(from)}`:''}${to?`&to=${encodeURIComponent(to)}`:''}`} className="rounded border border-slate-700 px-3 py-2 text-xs text-slate-200">Export CSV</a>
      <span className="text-xs text-slate-400">{loading ? 'Loading…' : `${rows.length} bars shown (latest 500)`}</span>
    </div>
    {error && <p className="text-xs text-amber-300">{error}</p>}
    <div className="overflow-auto max-h-[520px] rounded border border-slate-800"><table className="w-full text-xs font-mono"><thead className="sticky top-0 bg-slate-900 text-slate-300"><tr>{['Time (UTC)','Open','High','Low','Close','Tick volume','Spread'].map(h=><th key={h} className="px-3 py-2 text-right first:text-left">{h}</th>)}</tr></thead><tbody>{rows.map(c=><tr key={c.time} className="border-t border-slate-800/70 hover:bg-slate-800/40"><td className="px-3 py-2 whitespace-nowrap">{new Date(c.time*1000).toISOString().replace('T',' ').replace('.000Z','')}</td>{[c.open,c.high,c.low,c.close,c.tickVolume,c.spread].map((v,i)=><td key={i} className="px-3 py-2 text-right">{Number(v).toLocaleString('en-US',{maximumFractionDigits:8})}</td>)}</tr>)}</tbody></table>{!loading&&rows.length===0&&!error&&<p className="p-5 text-center text-xs text-slate-500">No stored candles for this selection/date range.</p>}</div>
  </section>;
};
