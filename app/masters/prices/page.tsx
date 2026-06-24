"use client";

import { useEffect, useState, useCallback } from "react";
import AuthGuard from "@/components/AuthGuard";
import Modal from "@/components/Modal";
import type { Client, Route, Price, PriceType } from "@/types/database";

function PricesContent() {
  const [prices, setPrices] = useState<Price[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    client_id: "",
    route_id: "",
    price_type: "per_ton" as PriceType,
    per_ton_rate: "",
    fixed_amount: "",
  });

  const loadData = useCallback(async () => {
    const [p, c, r] = await Promise.all([
      fetch("/api/masters/prices").then((r) => r.json()),
      fetch("/api/masters/clients").then((r) => r.json()),
      fetch("/api/masters/routes").then((r) => r.json()),
    ]);
    setPrices(p.prices || []);
    setClients(c.clients || []);
    setRoutes(r.routes || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function resetForm() {
    setForm({ client_id: "", route_id: "", price_type: "per_ton", per_ton_rate: "", fixed_amount: "" });
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const method = editingId ? "PUT" : "POST";
    const body = editingId ? { ...form, id: editingId } : form;

    const res = await fetch("/api/masters/prices", {
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

  function openEdit(p: Price) {
    setForm({
      client_id: p.client_id,
      route_id: p.route_id,
      price_type: p.price_type,
      per_ton_rate: p.per_ton_rate?.toString() || "",
      fixed_amount: p.fixed_amount?.toString() || "",
    });
    setEditingId(p.id);
    setShowModal(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("この単価を削除しますか？")) return;
    await fetch("/api/masters/prices", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadData();
  }

  const priceTypeLabel = (t: PriceType) =>
    t === "per_ton" ? "t単価型" : t === "fixed" ? "固定単価型" : "スポット型";

  if (loading) return <div className="text-muted text-sm">読み込み中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-light">単価マスタ</h2>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="px-4 py-2 bg-white text-black text-sm rounded-md hover:bg-gray-200 transition-colors"
        >
          + 新規単価
        </button>
      </div>

      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>荷主</th>
              <th>ルート</th>
              <th>タイプ</th>
              <th>単価/金額</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {prices.length === 0 ? (
              <tr><td colSpan={5} className="text-center text-muted py-8">単価データがありません</td></tr>
            ) : (
              prices.map((p) => (
                <tr key={p.id}>
                  <td>{p.client?.company_name || "—"}</td>
                  <td>
                    {p.route ? `${p.route.departure} → ${p.route.destination}` : "—"}
                  </td>
                  <td>
                    <span className="text-xs px-2 py-0.5 rounded bg-accent">
                      {priceTypeLabel(p.price_type)}
                    </span>
                  </td>
                  <td>
                    {p.price_type === "per_ton"
                      ? `${p.per_ton_rate?.toLocaleString()}円/t`
                      : p.price_type === "fixed"
                      ? `${p.fixed_amount?.toLocaleString()}円`
                      : "—"}
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(p)} className="text-xs text-muted hover:text-white">編集</button>
                      <button onClick={() => handleDelete(p.id)} className="text-xs text-muted hover:text-danger">削除</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editingId ? "単価編集" : "新規単価"}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-muted mb-1">荷主</label>
            <select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} className="w-full" required>
              <option value="">選択...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.company_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">ルート</label>
            <select value={form.route_id} onChange={(e) => setForm({ ...form, route_id: e.target.value })} className="w-full" required>
              <option value="">選択...</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>{r.departure} → {r.destination}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">単価タイプ</label>
            <select value={form.price_type} onChange={(e) => setForm({ ...form, price_type: e.target.value as PriceType })} className="w-full">
              <option value="per_ton">t単価型</option>
              <option value="fixed">固定単価型</option>
              <option value="spot">スポット型</option>
            </select>
          </div>
          {form.price_type === "per_ton" && (
            <div>
              <label className="block text-xs text-muted mb-1">t単価（円）</label>
              <input type="number" step="0.01" value={form.per_ton_rate} onChange={(e) => setForm({ ...form, per_ton_rate: e.target.value })} className="w-full" required />
            </div>
          )}
          {form.price_type === "fixed" && (
            <div>
              <label className="block text-xs text-muted mb-1">固定金額（円）</label>
              <input type="number" value={form.fixed_amount} onChange={(e) => setForm({ ...form, fixed_amount: e.target.value })} className="w-full" required />
            </div>
          )}
          {form.price_type === "spot" && (
            <p className="text-xs text-muted">スポット型は配車入力時に個別金額を指定します</p>
          )}
          <button type="submit" className="w-full py-2.5 bg-white text-black text-sm rounded-md hover:bg-gray-200 transition-colors mt-4">
            {editingId ? "更新" : "登録"}
          </button>
        </form>
      </Modal>
    </div>
  );
}

export default function PricesPage() {
  return (
    <AuthGuard requiredRole="admin">
      <PricesContent />
    </AuthGuard>
  );
}
