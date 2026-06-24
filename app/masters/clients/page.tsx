"use client";

import { useEffect, useState, useCallback } from "react";
import AuthGuard from "@/components/AuthGuard";
import Modal from "@/components/Modal";
import type { Client } from "@/types/database";

function ClientsContent() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ company_name: "", address: "", contact: "" });

  const loadData = useCallback(async () => {
    const res = await fetch("/api/masters/clients");
    const data = await res.json();
    setClients(data.clients || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function resetForm() {
    setForm({ company_name: "", address: "", contact: "" });
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const method = editingId ? "PUT" : "POST";
    const body = editingId ? { ...form, id: editingId } : form;

    const res = await fetch("/api/masters/clients", {
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

  function openEdit(c: Client) {
    setForm({ company_name: c.company_name, address: c.address || "", contact: c.contact || "" });
    setEditingId(c.id);
    setShowModal(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("この荷主を削除しますか？")) return;
    await fetch("/api/masters/clients", {
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
        <h2 className="text-xl font-light">荷主マスタ</h2>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="px-4 py-2 bg-white text-black text-sm rounded-md hover:bg-gray-200 transition-colors"
        >
          + 新規荷主
        </button>
      </div>

      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>会社名</th>
              <th>住所</th>
              <th>連絡先</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr><td colSpan={4} className="text-center text-muted py-8">荷主データがありません</td></tr>
            ) : (
              clients.map((c) => (
                <tr key={c.id}>
                  <td>{c.company_name}</td>
                  <td className="text-muted">{c.address || "—"}</td>
                  <td className="text-muted">{c.contact || "—"}</td>
                  <td>
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(c)} className="text-xs text-muted hover:text-white">編集</button>
                      <button onClick={() => handleDelete(c.id)} className="text-xs text-muted hover:text-danger">削除</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editingId ? "荷主編集" : "新規荷主"}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-muted mb-1">会社名</label>
            <input type="text" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} className="w-full" required />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">住所</label>
            <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full" />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">連絡先</label>
            <input type="text" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} className="w-full" />
          </div>
          <button type="submit" className="w-full py-2.5 bg-white text-black text-sm rounded-md hover:bg-gray-200 transition-colors mt-4">
            {editingId ? "更新" : "登録"}
          </button>
        </form>
      </Modal>
    </div>
  );
}

export default function ClientsPage() {
  return (
    <AuthGuard requiredRole="admin">
      <ClientsContent />
    </AuthGuard>
  );
}
