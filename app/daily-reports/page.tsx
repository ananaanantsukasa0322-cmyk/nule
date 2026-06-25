"use client";

import { useEffect, useState, useCallback } from "react";
import AuthGuard from "@/components/AuthGuard";
import Modal from "@/components/Modal";
import type { DailyReport, Driver } from "@/types/database";

interface ParsedEntry {
  shipper: string;
  origin: string;
  destination: string;
  product: string;
  weight: string;
}

function DailyReportsContent() {
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showParse, setShowParse] = useState(false);
  const [editingReport, setEditingReport] = useState<DailyReport | null>(null);
  const [uploadForm, setUploadForm] = useState({
    report_date: new Date().toISOString().split("T")[0],
    driver_id: "",
  });
  const [editForm, setEditForm] = useState({
    ocr_text: "", status: "pending" as string, notes: "", report_weight: "",
  });
  const [schedules, setSchedules] = useState<{id:string;load_date:string;weight:number;driver_id:string}[]>([]);
  const [weightWarning, setWeightWarning] = useState("");
  const [file, setFile] = useState<File | null>(null);

  // PDF解析結果
  const [parseFile, setParseFile] = useState<File | null>(null);
  const [parseDate, setParseDate] = useState(new Date().toISOString().split("T")[0]);
  const [parseDriver, setParseDriver] = useState("");
  const [parsedEntries, setParsedEntries] = useState<ParsedEntry[]>([]);
  const [parsing, setParsing] = useState(false);
  const [rawText, setRawText] = useState("");

  const loadData = useCallback(async () => {
    const [r, d, s] = await Promise.all([
      fetch("/api/daily-reports").then((r) => r.json()),
      fetch("/api/masters/drivers").then((r) => r.json()),
      fetch("/api/schedules").then((r) => r.json()).catch(() => []),
    ]);
    setReports(r.reports || []);
    setDrivers(d.drivers || []);
    setSchedules(Array.isArray(s) ? s : []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData();
    formData.append("report_date", uploadForm.report_date);
    formData.append("driver_id", uploadForm.driver_id);
    if (file) formData.append("file", file);
    const res = await fetch("/api/daily-reports", { method: "POST", body: formData });
    if (res.ok) { setShowUpload(false); setFile(null); loadData(); }
  }

  function openEdit(report: DailyReport) {
    setEditingReport(report);
    setEditForm({ ocr_text: report.ocr_text || "", status: report.status, notes: report.notes || "", report_weight: "" });
    setWeightWarning("");
    setShowEdit(true);
  }

  function checkWeightDiscrepancy(reportWeight: string, report: DailyReport) {
    setEditForm(f => ({ ...f, report_weight: reportWeight }));
    const rw = Number(reportWeight);
    if (!rw || !report.driver_id || !report.report_date) { setWeightWarning(""); return; }
    const matched = schedules.filter(s => s.driver_id === report.driver_id && s.load_date === report.report_date);
    const dispatchTotal = matched.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);
    if (dispatchTotal > 0 && Math.abs(rw - dispatchTotal) > 100) {
      setWeightWarning(`⚠️ 配車係入力: ${dispatchTotal.toLocaleString()}kg / 日報入力: ${rw.toLocaleString()}kg（差: ${Math.abs(rw - dispatchTotal).toLocaleString()}kg）`);
    } else { setWeightWarning(""); }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingReport) return;
    const res = await fetch("/api/daily-reports", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingReport.id, ...editForm, driver_id: editingReport.driver_id }),
    });
    if (res.ok) { setShowEdit(false); setEditingReport(null); loadData(); }
  }

  async function handleParse() {
    if (!parseFile) return;
    setParsing(true);
    const formData = new FormData();
    formData.append("file", parseFile);
    formData.append("report_date", parseDate);
    formData.append("driver_name", parseDriver);
    try {
      const res = await fetch("/api/daily-reports/parse", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        setParsedEntries(data.entries || []);
        setRawText(data.raw_text || "");
      } else {
        alert(data.error || "解析に失敗しました");
      }
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
    let successCount = 0;
    for (const entry of parsedEntries) {
      if (!entry.origin && !entry.destination) continue;
      const res = await fetch("/api/schedules", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: entry.shipper || null,
          load_date: parseDate,
          load_place: entry.origin,
          unload_date: parseDate,
          unload_place: entry.destination,
          weight: entry.weight || "0",
          cargo_note: entry.product,
          driver_id: driverId || null,
          note: "日報取込",
        }),
      });
      if (res.ok) successCount++;
    }
    alert(`${successCount}件をスケジュールに登録しました`);
    setShowParse(false);
    setParsedEntries([]);
    setParseFile(null);
    loadData();
  }

  if (loading) return <div className="text-muted text-sm">読み込み中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-light">日報管理</h2>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowParse(true)}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
            日報取り込み
          </button>
          <button onClick={() => setShowUpload(true)}
            className="px-4 py-2 bg-white text-black text-sm rounded-md hover:bg-gray-200">
            + PDFアップロード
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr><th>日付</th><th>ドライバー</th><th>ステータス</th><th>内容</th><th>備考</th><th>操作</th></tr>
          </thead>
          <tbody>
            {reports.length === 0 ? (
              <tr><td colSpan={6} className="text-center text-muted py-8">日報データがありません</td></tr>
            ) : reports.map((r) => (
              <tr key={r.id}>
                <td>{r.report_date}</td>
                <td>{r.driver?.name || "—"}</td>
                <td>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    r.status === "confirmed" ? "bg-success/20 text-success"
                    : r.status === "reviewed" ? "bg-blue-500/20 text-blue-400"
                    : "bg-warning/20 text-warning"
                  }`}>
                    {r.status === "confirmed" ? "確定" : r.status === "reviewed" ? "確認済" : "未処理"}
                  </span>
                </td>
                <td className="max-w-xs truncate text-xs text-muted">{r.ocr_text || "—"}</td>
                <td className="text-xs text-muted">{r.notes || "—"}</td>
                <td>
                  <button onClick={() => openEdit(r)} className="text-xs text-muted hover:text-white">確認・修正</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* PDFアップロードモーダル */}
      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="日報PDFアップロード">
        <form onSubmit={handleUpload} className="space-y-3">
          <div><label className="block text-xs text-muted mb-1">日付</label>
            <input type="date" value={uploadForm.report_date} onChange={(e) => setUploadForm({ ...uploadForm, report_date: e.target.value })} className="w-full" required />
          </div>
          <div><label className="block text-xs text-muted mb-1">ドライバー</label>
            <select value={uploadForm.driver_id} onChange={(e) => setUploadForm({ ...uploadForm, driver_id: e.target.value })} className="w-full">
              <option value="">選択...</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div><label className="block text-xs text-muted mb-1">ファイル</label>
            <input type="file" accept=".pdf,.xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-accent file:text-foreground file:text-xs" />
          </div>
          <button type="submit" className="w-full py-2.5 bg-white text-black text-sm rounded-md hover:bg-gray-200 mt-4">アップロード</button>
        </form>
      </Modal>

      {/* 確認・修正モーダル */}
      <Modal open={showEdit} onClose={() => { setShowEdit(false); setEditingReport(null); }} title="日報確認・修正">
        <form onSubmit={handleUpdate} className="space-y-3">
          <div><label className="block text-xs text-muted mb-1">OCR読み取りテキスト（修正可能）</label>
            <textarea value={editForm.ocr_text} onChange={(e) => setEditForm({ ...editForm, ocr_text: e.target.value })} className="w-full h-32 resize-y" />
          </div>
          <div><label className="block text-xs text-muted mb-1">ステータス</label>
            <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className="w-full">
              <option value="pending">未処理</option><option value="reviewed">確認済</option><option value="confirmed">確定</option>
            </select>
          </div>
          <div><label className="block text-xs text-muted mb-1">日報重量 (kg)</label>
            <input type="number" value={editForm.report_weight} onChange={(e) => editingReport && checkWeightDiscrepancy(e.target.value, editingReport)}
              className="w-full" placeholder="日報の重量を入力" />
          </div>
          {weightWarning && <div className="bg-warning/10 border border-warning/30 rounded p-3"><p className="text-warning text-xs font-medium">{weightWarning}</p></div>}
          <div><label className="block text-xs text-muted mb-1">備考</label>
            <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className="w-full h-20 resize-y" />
          </div>
          <button type="submit" className="w-full py-2.5 bg-white text-black text-sm rounded-md hover:bg-gray-200 mt-4">更新</button>
        </form>
      </Modal>

      {/* 日報取り込みモーダル */}
      <Modal open={showParse} onClose={() => setShowParse(false)} title="日報取り込み">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-muted mb-1">日付</label>
              <input type="date" value={parseDate} onChange={(e) => setParseDate(e.target.value)} className="w-full" />
            </div>
            <div><label className="block text-xs text-muted mb-1">ドライバー</label>
              <select value={parseDriver} onChange={(e) => setParseDriver(e.target.value)} className="w-full">
                <option value="">選択...</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>

          <div><label className="block text-xs text-muted mb-1">日報PDF</label>
            <input type="file" accept=".pdf" onChange={(e) => setParseFile(e.target.files?.[0] || null)}
              className="w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-accent file:text-foreground file:text-xs" />
          </div>

          <button onClick={handleParse} disabled={!parseFile || parsing}
            className="w-full py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50">
            {parsing ? "解析中..." : "PDF解析"}
          </button>

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
                        <input type="text" value={entry.shipper} onChange={(e) => updateEntry(idx, "shipper", e.target.value)}
                          className="w-full text-sm" placeholder="荷主名" />
                      </div>
                      <div><label className="block text-[10px] text-muted">品名</label>
                        <input type="text" value={entry.product} onChange={(e) => updateEntry(idx, "product", e.target.value)}
                          className="w-full text-sm" placeholder="品名" />
                      </div>
                      <div><label className="block text-[10px] text-muted">発地（積み地）</label>
                        <input type="text" value={entry.origin} onChange={(e) => updateEntry(idx, "origin", e.target.value)}
                          className="w-full text-sm" placeholder="発地" />
                      </div>
                      <div><label className="block text-[10px] text-muted">納入先（下ろし先）</label>
                        <input type="text" value={entry.destination} onChange={(e) => updateEntry(idx, "destination", e.target.value)}
                          className="w-full text-sm" placeholder="納入先" />
                      </div>
                      <div><label className="block text-[10px] text-muted">重量 (kg)</label>
                        <input type="text" value={entry.weight} onChange={(e) => updateEntry(idx, "weight", e.target.value)}
                          className="w-full text-sm" placeholder="kg" />
                      </div>
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
