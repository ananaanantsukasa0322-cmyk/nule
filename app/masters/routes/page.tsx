"use client";

import { useEffect, useState, useCallback } from "react";
import AuthGuard from "@/components/AuthGuard";
import Modal from "@/components/Modal";
import type { Route } from "@/types/database";

function RoutesContent() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ departure: "", destination: "" });

  const loadData = useCallback(async () => {
    const res = await fetch("/api/masters/routes");
    const data = await res.json();
    setRoutes(data.routes || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function resetForm() {
    setForm({ departure: "", destination: "" });
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const method = editingId ? "PUT" : "POST";
    const body = editingId ? { ...form, id: editingId } : form;

    const res = await fetch("/api/masters/routes", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      setShowModal(false);
      resetForm();
      loadData();
    }
  }

  function openEdit(r: Route) {
    setForm({ departure: r.departure, destination: r.destination });
    setEditingId(r.id);
    setShowModal(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("このルートを削除しますか？")) return;
    await fetch("/api/masters/routes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadData();
  }

  if (loading) return <div className="text-muted text-sm">読み込み中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-light">ルートマスタ</h2>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="px-4 py-2 bg-white text-black text-sm rounded-md hover:bg-gray-200 transition-colors"
        >
          + 新規ルート
        </button>
      </div>

      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>出発地</th>
              <th>目的地</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {routes.length === 0 ? (
              <tr><td colSpan={3} className="text-center text-muted py-8">ルートデータがありません</td></tr>
            ) : (
              routes.map((r) => (
                <tr key={r.id}>
                  <td>{r.departure}</td>
                  <td>{r.destination}</td>
                  <td>
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(r)} className="text-xs text-muted hover:text-white">編集</button>
                      <button onClick={() => handleDelete(r.id)} className="text-xs text-muted hover:text-danger">削除</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editingId ? "ルート編集" : "新規ルート"}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-muted mb-1">出発地</label>
            <input type="text" value={form.departure} onChange={(e) => setForm({ ...form, departure: e.target.value })} className="w-full" required />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">目的地</label>
            <input type="text" value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} className="w-full" required />
          </div>
          <button type="submit" className="w-full py-2.5 bg-white text-black text-sm rounded-md hover:bg-gray-200 transition-colors mt-4">
            {editingId ? "更新" : "登録"}
          </button>
        </form>
      </Modal>
    </div>
  );
}

export default function RoutesPage() {
  return (
    <AuthGuard allowedRoles={["admin", "office"]}>
      <RoutesContent />
    </AuthGuard>
  );
}
