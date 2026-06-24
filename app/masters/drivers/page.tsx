"use client";

import { useEffect, useState, useCallback } from "react";
import AuthGuard from "@/components/AuthGuard";
import Modal from "@/components/Modal";
import type { Driver } from "@/types/database";

function DriversContent() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", payment_percentage: "" });

  const loadData = useCallback(async () => {
    const res = await fetch("/api/masters/drivers");
    const data = await res.json();
    setDrivers(data.drivers || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function resetForm() {
    setForm({ name: "", payment_percentage: "" });
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const method = editingId ? "PUT" : "POST";
    const body = editingId ? { ...form, id: editingId } : form;

    const res = await fetch("/api/masters/drivers", {
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

  function openEdit(d: Driver) {
    setForm({ name: d.name, payment_percentage: d.payment_percentage.toString() });
    setEditingId(d.id);
    setShowModal(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("このドライバーを削除しますか？")) return;
    await fetch("/api/masters/drivers", {
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
        <h2 className="text-xl font-light">ドライバーマスタ</h2>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="px-4 py-2 bg-white text-black text-sm rounded-md hover:bg-gray-200 transition-colors"
        >
          + 新規ドライバー
        </button>
      </div>

      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>名前</th>
              <th>支払いパーセンテージ</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {drivers.length === 0 ? (
              <tr><td colSpan={3} className="text-center text-muted py-8">ドライバーデータがありません</td></tr>
            ) : (
              drivers.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>{d.payment_percentage}%</td>
                  <td>
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(d)} className="text-xs text-muted hover:text-white">編集</button>
                      <button onClick={() => handleDelete(d.id)} className="text-xs text-muted hover:text-danger">削除</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editingId ? "ドライバー編集" : "新規ドライバー"}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-muted mb-1">名前</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full" required />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">支払いパーセンテージ (%)</label>
            <input type="number" step="0.01" min="0" max="100" value={form.payment_percentage} onChange={(e) => setForm({ ...form, payment_percentage: e.target.value })} className="w-full" required />
          </div>
          <button type="submit" className="w-full py-2.5 bg-white text-black text-sm rounded-md hover:bg-gray-200 transition-colors mt-4">
            {editingId ? "更新" : "登録"}
          </button>
        </form>
      </Modal>
    </div>
  );
}

export default function DriversPage() {
  return (
    <AuthGuard requiredRole="admin">
      <DriversContent />
    </AuthGuard>
  );
}
