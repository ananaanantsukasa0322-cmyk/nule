"use client";

import { useEffect, useState, useCallback } from "react";
import AuthGuard from "@/components/AuthGuard";
import Modal from "@/components/Modal";
import type { DailyReport, Driver } from "@/types/database";

interface ParsedEntry {
  shipper: string; origin: string; destination: string; product: string; weight: string;
}

function DailyReportsContent() {
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [showParse, setShowParse] = useState(false);
  const [schedules, setSchedules] = useState<{id:string;load_date:string;weight:number;driver_id:string;load_place:string;unload_place:string;client_name?:string;note?:string}[]>([]);

  const [parseFile, setParseFile] = useState<File | null>(null);
  const [parseDate, setParseDate] = useState(new Date().toISOString().split("T")[0]);
  const [parseDriver, setParseDriver] = useState("");
  const [parsedEntries, setParsedEntries] = useState<ParsedEntry[]>([]);
  const [parsing, setParsing] = useState(false);
  const [rawText, setRawText] = useState("");

  // 候補リスト（スケジュールから自動生成）
  const knownShippers = [...new Set(schedules.map(s => (s as unknown as {client_name?:string}).client_name).filter(Boolean) as string[])].sort();
  const knownOrigins = [...new Set(schedules.map(s => s.load_place).filter(Boolean))].sort();
  const knownDestinations = [...new Set(schedules.map(s => s.unload_place).filter(Boolean))].sort();

  const loadData = useCallback(async () => {
    const [r, d, s] = await Promise.all([
      fetch("/api/daily-reports").then(r => r.json()),
      fetch("/api/masters/drivers").then(r => r.json()),
      fetch("/api/schedules").then(r => r.json()).catch(() => []),
    ]);
    setReports(r.reports || []);
    setDrivers(d.drivers || []);
    setSchedules(Array.isArray(s) ? s : []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleParse() {
    if (!parseFile) return;
    setParsing(true);
    const formData = new FormData();
    formData.append("file", parseFile);
    formData.append("type", "daily_report");
    try {
      const res = await fetch("/api/ai-parse", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        setParsedEntries(data.entries || []);
        setRawText(data.raw || "");
      } else { alert(data.error || "AI解析に失敗しました"); }
    } catch { alert("通信エラー"); }
    setParsing(false);
  }

  function updateEntry(idx: number, field: keyof ParsedEntry, value: string) {
    setParsedEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  }
  function addEntry() {
    setParsedEntries(prev => [...prev, { shipper: "", origin: "", destination: "", product: "", weight: "" }]);
  }
  function removeEntry(idx: number) {
    setParsedEntries(prev => prev.filter((_, i) => i !== idx));
  }

  async function confirmImport() {
    const driverId = parseDriver;
    let ok = 0;
    for (const entry of parsedEntries) {
      if (!entry.destination || !entry.destination.trim()) continue;
      const res = await fetch("/api/schedules", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: entry.shipper || null, load_date: parseDate, load_place: entry.origin,
          unload_date: parseDate, unload_place: entry.destination, weight: entry.weight || "0",
          cargo_note: entry.product, driver_id: driverId || null, note: "日報取込",
        }),
      });
      if (res.ok) ok++;
      // 荷主を同じルートの未設定スケジュールにも自動反映
      if (entry.shipper && entry.origin && entry.destination) {
        const toUpdate = schedules.filter(s =>
          !(s as unknown as {client_name?:string}).client_name &&
          s.load_place === entry.origin && s.unload_place === entry.destination
        );
        for (const s of toUpdate) {
          await fetch(`/api/schedules/${s.id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ client_name: entry.shipper }),
          });
        }
      }
    }
    alert(`${ok}件をスケジュールに登録しました`);
    setShowParse(false); setParsedEntries([]); setParseFile(null); loadData();
  }

  async function deleteReport(id: string) {
    if (!confirm("この日報を削除しますか？")) return;
    await fetch("/api/daily-reports", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadData();
  }

  if (loading) return <div className="text-muted text-sm">読み込み中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-light">日報管理</h2>
        <button onClick={() => setShowParse(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
          日報取り込み
        </button>
      </div>

      <h3 className="text-sm font-light text-muted mb-3 mt-6">取り込み済みスケジュール（日報取込分）</h3>
      <div className="overflow-x-auto">
        <table>
          <thead><tr><th>日付</th><th>荷主</th><th>ドライバー</th><th>発地→納入先</th><th>重量</th><th>操作</th></tr></thead>
          <tbody>
            {schedules.filter(s => (s as unknown as {note?:string}).note === '日報取込').length === 0 ? (
              <tr><td colSpan={6} className="text-center text-muted py-8">日報取込データなし</td></tr>
            ) : schedules.filter(s => (s as unknown as {note?:string}).note === '日報取込').map((s: unknown) => {
              const sc = s as {id:string;load_date:string;client_name?:string;driver_id:string;load_place:string;unload_place:string;weight:number;note?:string};
              const driver = drivers.find(d => d.id === sc.driver_id);
              return (
                <tr key={sc.id}>
                  <td className="text-sm">{sc.load_date}</td>
                  <td className="text-sm">
                    <input type="text" defaultValue={sc.client_name || ""} placeholder="荷主"
                      className="bg-transparent border-b border-border text-sm w-24 outline-none focus:border-white"
                      onBlur={e => { const v=e.target.value.trim(); if(v!==(sc.client_name||'')) fetch(`/api/schedules/${sc.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:v})}); }} />
                  </td>
                  <td className="text-sm">{driver?.name || "—"}</td>
                  <td className="text-sm">{sc.load_place} → {sc.unload_place}</td>
                  <td className="text-sm">{sc.weight ? `${sc.weight}kg` : "—"}</td>
                  <td>
                    <div className="flex gap-2">
                      <button onClick={async () => { if(!confirm('削除しますか？')) return; await fetch(`/api/schedules/${sc.id}`,{method:'DELETE'}); loadData(); }}
                        className="text-xs text-muted hover:text-danger">削除</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={showParse} onClose={() => setShowParse(false)} title="日報取り込み">
        <datalist id="dl-shippers">{knownShippers.map(s => <option key={s} value={s} />)}</datalist>
        <datalist id="dl-origins">{knownOrigins.map(s => <option key={s} value={s} />)}</datalist>
        <datalist id="dl-dests">{knownDestinations.map(s => <option key={s} value={s} />)}</datalist>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-muted mb-1">日付</label>
              <input type="date" value={parseDate} onChange={e => setParseDate(e.target.value)} className="w-full" />
            </div>
            <div><label className="block text-xs text-muted mb-1">ドライバー</label>
              <select value={parseDriver} onChange={e => setParseDriver(e.target.value)} className="w-full">
                <option value="">選択...</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>

          <div><label className="block text-xs text-muted mb-1">日報PDF</label>
            <input type="file" accept=".pdf" onChange={e => setParseFile(e.target.files?.[0] || null)}
              className="w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-accent file:text-foreground file:text-xs" />
          </div>

          <div className="flex gap-2">
            <button onClick={handleParse} disabled={!parseFile || parsing}
              className="flex-1 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50">
              {parsing ? "AI解析中..." : "AI解析（手書き対応）"}
            </button>
            <button onClick={() => { if (parsedEntries.length === 0) { for(let i=0;i<5;i++) addEntry(); } }}
              className="px-4 py-2 bg-accent text-white text-sm rounded-md hover:bg-border">
              手入力
            </button>
          </div>
          <p className="text-xs text-muted">手書きPDFは自動解析が難しい場合があります。「手入力」で直接入力できます。</p>

          {rawText && (
            <details className="text-xs">
              <summary className="text-muted cursor-pointer">読み取りテキスト表示</summary>
              <pre className="mt-2 p-2 bg-accent rounded text-xs max-h-32 overflow-y-auto whitespace-pre-wrap">{rawText}</pre>
            </details>
          )}

          {parsedEntries.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2">解析結果（修正可能）</h3>
              <div className="space-y-2">
                {parsedEntries.map((entry, idx) => (
                  <div key={idx} className="bg-accent/50 rounded p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted">#{idx + 1}</span>
                      <button onClick={() => removeEntry(idx)} className="text-xs text-danger">削除</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="block text-[10px] text-muted">荷主</label>
                        <input type="text" list="dl-shippers" value={entry.shipper} onChange={e => updateEntry(idx, "shipper", e.target.value)} className="w-full text-sm" placeholder="荷主名" /></div>
                      <div><label className="block text-[10px] text-muted">品名</label>
                        <input type="text" value={entry.product} onChange={e => updateEntry(idx, "product", e.target.value)} className="w-full text-sm" placeholder="品名" /></div>
                      <div><label className="block text-[10px] text-muted">発地（積み地）</label>
                        <input type="text" list="dl-origins" value={entry.origin} onChange={e => updateEntry(idx, "origin", e.target.value)} className="w-full text-sm" placeholder="発地" /></div>
                      <div><label className="block text-[10px] text-muted">納入先（下ろし先）</label>
                        <input type="text" list="dl-dests" value={entry.destination} onChange={e => updateEntry(idx, "destination", e.target.value)} className="w-full text-sm" placeholder="納入先" /></div>
                      <div><label className="block text-[10px] text-muted">重量 (kg)</label>
                        <input type="text" value={entry.weight} onChange={e => updateEntry(idx, "weight", e.target.value)} className="w-full text-sm" placeholder="kg" /></div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={addEntry} className="mt-2 text-xs text-muted hover:text-white">+ 行を追加</button>
              <button onClick={confirmImport}
                className="w-full py-2.5 bg-success text-white text-sm rounded-md hover:bg-green-600 mt-4">
                NULEに取り込む（{parsedEntries.length}件）
              </button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

export default function DailyReportsPage() {
  return (
    <AuthGuard allowedRoles={["admin", "office"]}>
      <DailyReportsContent />
    </AuthGuard>
  );
}
