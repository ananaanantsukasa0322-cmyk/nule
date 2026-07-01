"use client";

import { useEffect, useState, useCallback } from "react";
import AuthGuard from "@/components/AuthGuard";
import Modal from "@/components/Modal";

interface ParsedEntry {
  shipper: string; origin: string; destination: string; product: string; weight: string;
}

interface Schedule {
  id: string; load_date: string; unload_date: string; load_place: string; unload_place: string;
  weight: number; client_name?: string; driver_id?: string; note?: string;
}

interface Driver { id: string; name: string; }

function DailyReportsContent() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);

  // 取り込みモーダル
  const [showParse, setShowParse] = useState(false);
  const [parseFile, setParseFile] = useState<File | null>(null);
  const [parseDate, setParseDate] = useState(new Date().toISOString().split("T")[0]);
  const [parseDriver, setParseDriver] = useState("");
  const [parsedEntries, setParsedEntries] = useState<ParsedEntry[]>([]);
  const [parsing, setParsing] = useState(false);

  // 照合モーダル
  const [showVerify, setShowVerify] = useState(false);
  const [verifyDate, setVerifyDate] = useState(new Date().toISOString().split("T")[0]);
  const [verifyDriver, setVerifyDriver] = useState("");
  const [matchedSchedules, setMatchedSchedules] = useState<(Schedule & { report_weight?: string; status?: string })[]>([]);

  const knownShippers = [...new Set(schedules.map(s => s.client_name).filter(Boolean) as string[])].sort();
  const knownOrigins = [...new Set(schedules.map(s => s.load_place).filter(Boolean))].sort();
  const knownDests = [...new Set(schedules.map(s => s.unload_place).filter(Boolean))].sort();

  const loadData = useCallback(async () => {
    const [d, s] = await Promise.all([
      fetch("/api/masters/drivers").then(r => r.json()),
      fetch("/api/schedules").then(r => r.json()).catch(() => []),
    ]);
    setDrivers(d.drivers || []);
    setSchedules(Array.isArray(s) ? s : []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // AI解析
  async function handleParse() {
    if (!parseFile) return;
    setParsing(true);
    const fd = new FormData();
    fd.append("file", parseFile);
    fd.append("type", "daily_report");
    try {
      const res = await fetch("/api/ai-parse", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) setParsedEntries(data.entries || []);
      else alert(data.error || "AI解析に失敗しました");
    } catch { alert("通信エラー"); }
    setParsing(false);
  }

  function updateEntry(idx: number, field: keyof ParsedEntry, value: string) {
    setParsedEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  }
  function addEntry() { setParsedEntries(prev => [...prev, { shipper: "", origin: "", destination: "", product: "", weight: "" }]); }
  function removeEntry(idx: number) { setParsedEntries(prev => prev.filter((_, i) => i !== idx)); }

  async function confirmImport() {
    const driverId = parseDriver;
    let clientUpdated = 0, weightUpdated = 0, clientAdded = 0;

    for (const entry of parsedEntries) {
      if (!entry.destination?.trim()) continue;

      // 1. 荷主マスタに未登録なら追加
      if (entry.shipper) {
        await fetch("/api/masters/clients", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company_name: entry.shipper }),
        }).catch(() => {}); // 重複は無視
        clientAdded++;
      }

      // 2. 配車スケジュールの既存データに荷主を反映（未設定のもののみ）
      if (entry.shipper && entry.origin && entry.destination) {
        const toUpdate = schedules.filter(s =>
          !s.client_name && s.load_place === entry.origin && s.unload_place === entry.destination
        );
        for (const s of toUpdate) {
          await fetch(`/api/schedules/${s.id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ client_name: entry.shipper }),
          });
          clientUpdated++;
        }
      }

      // 3. 同じ日・ドライバー・下ろし先のスケジュールに日報重量を反映
      if (entry.weight && driverId) {
        const matched = schedules.filter(s =>
          s.unload_date === parseDate && s.driver_id === driverId && s.unload_place === entry.destination
        );
        for (const s of matched) {
          await fetch(`/api/schedules/${s.id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ report_weight: Number(entry.weight) || 0 }),
          });
          weightUpdated++;
        }
      }
    }

    const msgs = [];
    if (clientUpdated) msgs.push(`荷主${clientUpdated}件反映`);
    if (weightUpdated) msgs.push(`重量${weightUpdated}件反映`);
    if (clientAdded) msgs.push(`荷主マスタ確認`);
    alert(msgs.length ? msgs.join('、') : '処理完了');

    setShowParse(false); setParsedEntries([]); setParseFile(null); loadData();
  }

  // 照合
  function openVerify() {
    setShowVerify(true);
    loadVerifyData(verifyDate, verifyDriver);
  }

  function loadVerifyData(date: string, driverId: string) {
    if (!date || !driverId) { setMatchedSchedules([]); return; }
    const matched = schedules.filter(s => s.unload_date === date && s.driver_id === driverId);
    setMatchedSchedules(matched.map(s => ({ ...s, report_weight: "", status: s.weight ? "未確認" : "重量未入力" })));
  }

  function updateReportWeight(idx: number, weight: string) {
    setMatchedSchedules(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      const rw = Number(weight);
      const dw = s.weight || 0;
      let status = "未確認";
      if (weight && !isNaN(rw)) {
        if (rw === dw) status = "一致";
        else if (Math.abs(rw - dw) <= 100) status = "誤差少";
        else status = `差異 ${Math.abs(rw - dw).toLocaleString()}kg`;
      }
      return { ...s, report_weight: weight, status };
    }));
  }

  async function confirmVerify() {
    let updated = 0;
    for (const s of matchedSchedules) {
      if (s.report_weight && Number(s.report_weight) !== s.weight) {
        await fetch(`/api/schedules/${s.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weight: Number(s.report_weight) }),
        });
        updated++;
      }
    }
    alert(`${updated}件の重量を更新しました`);
    setShowVerify(false);
    loadData();
  }

  if (loading) return <div className="text-muted text-sm">読み込み中...</div>;

  return (
    <div>
      {parsing && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-muted border-t-white rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white text-lg font-light">AI解析中...</p>
            <p className="text-muted text-sm mt-2">手書き日報を読み取っています</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-light">日報管理</h2>
        <div className="flex items-center gap-3">
          <button onClick={openVerify} className="px-4 py-2 bg-accent text-white text-sm rounded-md hover:bg-border">
            配車照合
          </button>
          <button onClick={() => setShowParse(true)} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
            日報取り込み
          </button>
        </div>
      </div>

      {/* 日報重量が反映されたスケジュール */}
      <h3 className="text-sm font-light text-muted mb-3">日報重量反映済みスケジュール</h3>
      <div className="overflow-x-auto">
        <table>
          <thead><tr><th>日付</th><th>荷主</th><th>積み地→下ろし先</th><th>配車重量</th><th>日報重量</th><th>状態</th></tr></thead>
          <tbody>
            {schedules.filter(s => (s as unknown as {report_weight?:number}).report_weight).length === 0 ? (
              <tr><td colSpan={6} className="text-center text-muted py-8">日報重量反映データなし</td></tr>
            ) : schedules.filter(s => (s as unknown as {report_weight?:number}).report_weight).map(s => {
              const rw = (s as unknown as {report_weight?:number}).report_weight || 0;
              const diff = Math.abs(rw - (s.weight || 0));
              const status = diff === 0 ? "一致" : diff <= 100 ? "誤差少" : `差異 ${diff.toLocaleString()}kg`;
              return (
                <tr key={s.id}>
                  <td className="text-sm">{s.unload_date || s.load_date}</td>
                  <td className="text-sm">{s.client_name || "—"}</td>
                  <td className="text-sm">{s.load_place} → {s.unload_place}</td>
                  <td className="text-sm">{s.weight ? `${s.weight.toLocaleString()}kg` : "—"}</td>
                  <td className="text-sm">{rw ? `${rw.toLocaleString()}kg` : "—"}</td>
                  <td><span className={`text-xs px-2 py-0.5 rounded ${
                    status === '一致' ? 'bg-success/20 text-success' :
                    status === '誤差少' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-warning/20 text-warning'
                  }`}>{status}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 日報取り込みモーダル */}
      <Modal open={showParse} onClose={() => setShowParse(false)} title="日報取り込み">
        <datalist id="dl-shippers">{knownShippers.map(s => <option key={s} value={s} />)}</datalist>
        <datalist id="dl-origins">{knownOrigins.map(s => <option key={s} value={s} />)}</datalist>
        <datalist id="dl-dests">{knownDests.map(s => <option key={s} value={s} />)}</datalist>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-muted mb-1">日付</label>
              <input type="date" value={parseDate} onChange={e => setParseDate(e.target.value)} className="w-full" /></div>
            <div><label className="block text-xs text-muted mb-1">ドライバー</label>
              <select value={parseDriver} onChange={e => setParseDriver(e.target.value)} className="w-full">
                <option value="">選択...</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select></div>
          </div>
          <div><label className="block text-xs text-muted mb-1">日報PDF</label>
            <input type="file" accept=".pdf" onChange={e => setParseFile(e.target.files?.[0] || null)}
              className="w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-accent file:text-foreground file:text-xs" /></div>
          <div className="flex gap-2">
            <button onClick={handleParse} disabled={!parseFile || parsing}
              className="flex-1 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50">
              {parsing ? "AI解析中..." : "AI解析（手書き対応）"}</button>
            <button onClick={() => { if (!parsedEntries.length) for (let i = 0; i < 5; i++) addEntry(); }}
              className="px-4 py-2 bg-accent text-white text-sm rounded-md hover:bg-border">手入力</button>
          </div>

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
                NULEに取り込む（{parsedEntries.filter(e => e.destination?.trim()).length}件）
              </button>
            </div>
          )}
        </div>
      </Modal>

      {/* 配車照合モーダル */}
      <Modal open={showVerify} onClose={() => setShowVerify(false)} title="配車照合（配車係 vs 日報）">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-muted mb-1">日付</label>
              <input type="date" value={verifyDate} onChange={e => { setVerifyDate(e.target.value); loadVerifyData(e.target.value, verifyDriver); }} className="w-full" /></div>
            <div><label className="block text-xs text-muted mb-1">ドライバー</label>
              <select value={verifyDriver} onChange={e => { setVerifyDriver(e.target.value); loadVerifyData(verifyDate, e.target.value); }} className="w-full">
                <option value="">選択...</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select></div>
          </div>

          {matchedSchedules.length > 0 && (
            <div>
              <div className="overflow-x-auto">
                <table>
                  <thead><tr><th>下ろし先</th><th>配車重量</th><th>日報重量</th><th>状態</th></tr></thead>
                  <tbody>
                    {matchedSchedules.map((s, i) => (
                      <tr key={s.id}>
                        <td className="text-sm">{s.unload_place}</td>
                        <td className="text-sm">{s.weight ? `${s.weight.toLocaleString()}kg` : "—"}</td>
                        <td>
                          <input type="number" value={s.report_weight || ""} onChange={e => updateReportWeight(i, e.target.value)}
                            className="w-24 text-sm bg-transparent border-b border-border outline-none focus:border-white" placeholder="kg" />
                        </td>
                        <td>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            s.status === '一致' ? 'bg-success/20 text-success' :
                            s.status === '誤差少' ? 'bg-blue-500/20 text-blue-400' :
                            s.status?.startsWith('差異') ? 'bg-warning/20 text-warning' :
                            'bg-accent text-muted'
                          }`}>{s.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={confirmVerify}
                className="w-full py-2.5 bg-white text-black text-sm rounded-md hover:bg-gray-200 mt-4">
                日報の重量で更新（差異があるもののみ）
              </button>
            </div>
          )}

          {verifyDate && verifyDriver && matchedSchedules.length === 0 && (
            <p className="text-xs text-muted text-center py-4">この日のこのドライバーの配車データがありません</p>
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
