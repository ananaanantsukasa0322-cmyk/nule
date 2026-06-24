"use client";

import { useEffect, useState, useCallback } from "react";
import AuthGuard from "@/components/AuthGuard";
import Modal from "@/components/Modal";
import FileImport from "@/components/FileImport";
import type { DailyReport, Driver } from "@/types/database";

function DailyReportsContent() {
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editingReport, setEditingReport] = useState<DailyReport | null>(null);
  const [uploadForm, setUploadForm] = useState({
    report_date: new Date().toISOString().split("T")[0],
    driver_id: "",
  });
  const [editForm, setEditForm] = useState({
    ocr_text: "",
    status: "pending" as string,
    notes: "",
  });
  const [file, setFile] = useState<File | null>(null);

  const loadData = useCallback(async () => {
    const [r, d] = await Promise.all([
      fetch("/api/daily-reports").then((r) => r.json()),
      fetch("/api/masters/drivers").then((r) => r.json()),
    ]);
    setReports(r.reports || []);
    setDrivers(d.drivers || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData();
    formData.append("report_date", uploadForm.report_date);
    formData.append("driver_id", uploadForm.driver_id);
    if (file) formData.append("file", file);

    const res = await fetch("/api/daily-reports", {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      setShowUpload(false);
      setFile(null);
      loadData();
    }
  }

  function openEdit(report: DailyReport) {
    setEditingReport(report);
    setEditForm({
      ocr_text: report.ocr_text || "",
      status: report.status,
      notes: report.notes || "",
    });
    setShowEdit(true);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingReport) return;

    const res = await fetch("/api/daily-reports", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingReport.id,
        ...editForm,
        driver_id: editingReport.driver_id,
      }),
    });

    if (res.ok) {
      setShowEdit(false);
      setEditingReport(null);
      loadData();
    }
  }

  if (loading) return <div className="text-muted text-sm">読み込み中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-light">日報管理</h2>
        <div className="flex items-center gap-3">
          <FileImport target="daily_reports" label="Excel" onComplete={loadData} />
          <button
            onClick={() => setShowUpload(true)}
            className="px-4 py-2 bg-white text-black text-sm rounded-md hover:bg-gray-200 transition-colors"
          >
            + PDFアップロード
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>日付</th>
              <th>ドライバー</th>
              <th>ステータス</th>
              <th>OCRテキスト</th>
              <th>備考</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-muted py-8">
                  日報データがありません
                </td>
              </tr>
            ) : (
              reports.map((r) => (
                <tr key={r.id}>
                  <td>{r.report_date}</td>
                  <td>{r.driver?.name || "—"}</td>
                  <td>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        r.status === "confirmed"
                          ? "bg-success/20 text-success"
                          : r.status === "reviewed"
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-warning/20 text-warning"
                      }`}
                    >
                      {r.status === "confirmed"
                        ? "確定"
                        : r.status === "reviewed"
                        ? "確認済"
                        : "未処理"}
                    </span>
                  </td>
                  <td className="max-w-xs truncate text-xs text-muted">
                    {r.ocr_text || "—"}
                  </td>
                  <td className="text-xs text-muted">{r.notes || "—"}</td>
                  <td>
                    <button
                      onClick={() => openEdit(r)}
                      className="text-xs text-muted hover:text-white"
                    >
                      確認・修正
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        title="日報PDFアップロード"
      >
        <form onSubmit={handleUpload} className="space-y-3">
          <div>
            <label className="block text-xs text-muted mb-1">日付</label>
            <input
              type="date"
              value={uploadForm.report_date}
              onChange={(e) =>
                setUploadForm({ ...uploadForm, report_date: e.target.value })
              }
              className="w-full"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">ドライバー</label>
            <select
              value={uploadForm.driver_id}
              onChange={(e) =>
                setUploadForm({ ...uploadForm, driver_id: e.target.value })
              }
              className="w-full"
            >
              <option value="">選択...</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">ファイル (PDF / Excel)</label>
            <input
              type="file"
              accept=".pdf,.xlsx,.xls,.csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-accent file:text-foreground file:text-xs"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2.5 bg-white text-black text-sm rounded-md hover:bg-gray-200 transition-colors mt-4"
          >
            アップロード
          </button>
        </form>
      </Modal>

      <Modal
        open={showEdit}
        onClose={() => { setShowEdit(false); setEditingReport(null); }}
        title="日報確認・修正"
      >
        <form onSubmit={handleUpdate} className="space-y-3">
          <div>
            <label className="block text-xs text-muted mb-1">
              OCR読み取りテキスト（修正可能）
            </label>
            <textarea
              value={editForm.ocr_text}
              onChange={(e) =>
                setEditForm({ ...editForm, ocr_text: e.target.value })
              }
              className="w-full h-32 resize-y"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">ステータス</label>
            <select
              value={editForm.status}
              onChange={(e) =>
                setEditForm({ ...editForm, status: e.target.value })
              }
              className="w-full"
            >
              <option value="pending">未処理</option>
              <option value="reviewed">確認済</option>
              <option value="confirmed">確定</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">備考</label>
            <textarea
              value={editForm.notes}
              onChange={(e) =>
                setEditForm({ ...editForm, notes: e.target.value })
              }
              className="w-full h-20 resize-y"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2.5 bg-white text-black text-sm rounded-md hover:bg-gray-200 transition-colors mt-4"
          >
            更新
          </button>
        </form>
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
