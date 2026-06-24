"use client";

import { useEffect, useState, useCallback } from "react";
import AuthGuard from "@/components/AuthGuard";
import Modal from "@/components/Modal";
import type { Client, Route, Driver, Price, Dispatch, PriceType } from "@/types/database";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n);
}

function DispatchContent() {
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    dispatch_date: new Date().toISOString().split("T")[0],
    driver_id: "",
    client_id: "",
    route_id: "",
    price_id: "",
    loading_place: "",
    unloading_place: "",
    weight: "",
    price_type: "per_ton" as PriceType,
    spot_amount: "",
  });

  const loadData = useCallback(async () => {
    const [d, c, r, dr, p] = await Promise.all([
      fetch("/api/dispatch").then((r) => r.json()),
      fetch("/api/masters/clients").then((r) => r.json()),
      fetch("/api/masters/routes").then((r) => r.json()),
      fetch("/api/masters/drivers").then((r) => r.json()),
      fetch("/api/masters/prices").then((r) => r.json()),
    ]);
    setDispatches(d.dispatches || []);
    setClients(c.clients || []);
    setRoutes(r.routes || []);
    setDrivers(dr.drivers || []);
    setPrices(p.prices || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredPrices = prices.filter(
    (p) =>
      (!form.client_id || p.client_id === form.client_id) &&
      (!form.route_id || p.route_id === form.route_id)
  );

  function resetForm() {
    setForm({
      dispatch_date: new Date().toISOString().split("T")[0],
      driver_id: "",
      client_id: "",
      route_id: "",
      price_id: "",
      loading_place: "",
      unloading_place: "",
      weight: "",
      price_type: "per_ton",
      spot_amount: "",
    });
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const method = editingId ? "PUT" : "POST";
    const body = editingId ? { ...form, id: editingId } : form;

    const res = await fetch("/api/dispatch", {
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

  function openEdit(d: Dispatch) {
    setForm({
      dispatch_date: d.dispatch_date,
      driver_id: d.driver_id || "",
      client_id: d.client_id || "",
      route_id: d.route_id || "",
      price_id: d.price_id || "",
      loading_place: d.loading_place || "",
      unloading_place: d.unloading_place || "",
      weight: d.weight?.toString() || "",
      price_type: d.price_type,
      spot_amount: d.spot_amount?.toString() || "",
    });
    setEditingId(d.id);
    setShowModal(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("この配車データを削除しますか？")) return;
    await fetch("/api/dispatch", {
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
        <h2 className="text-xl font-light">配車入力</h2>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="px-4 py-2 bg-white text-black text-sm rounded-md hover:bg-gray-200 transition-colors"
        >
          + 新規配車
        </button>
      </div>

      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>日付</th>
              <th>ドライバー</th>
              <th>荷主</th>
              <th>ルート</th>
              <th>重量</th>
              <th>金額</th>
              <th>ステータス</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {dispatches.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-muted py-8">
                  配車データがありません
                </td>
              </tr>
            ) : (
              dispatches.map((d) => (
                <tr key={d.id}>
                  <td>{d.dispatch_date}</td>
                  <td>{d.driver?.name || "—"}</td>
                  <td>{d.client?.company_name || "—"}</td>
                  <td>
                    {d.route
                      ? `${d.route.departure} → ${d.route.destination}`
                      : "—"}
                  </td>
                  <td>{d.weight ? `${d.weight}t` : "—"}</td>
                  <td>{formatCurrency(d.calculated_amount)}</td>
                  <td>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        d.status === "completed"
                          ? "bg-success/20 text-success"
                          : d.status === "confirmed"
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-muted/20 text-muted"
                      }`}
                    >
                      {d.status === "completed"
                        ? "完了"
                        : d.status === "confirmed"
                        ? "確定"
                        : "未確定"}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEdit(d)}
                        className="text-xs text-muted hover:text-white"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDelete(d.id)}
                        className="text-xs text-muted hover:text-danger"
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={showModal}
        onClose={() => { setShowModal(false); resetForm(); }}
        title={editingId ? "配車編集" : "新規配車"}
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-muted mb-1">日付</label>
            <input
              type="date"
              value={form.dispatch_date}
              onChange={(e) => setForm({ ...form, dispatch_date: e.target.value })}
              className="w-full"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">ドライバー</label>
            <select
              value={form.driver_id}
              onChange={(e) => setForm({ ...form, driver_id: e.target.value })}
              className="w-full"
              required
            >
              <option value="">選択...</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">荷主</label>
            <select
              value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value, price_id: "" })}
              className="w-full"
              required
            >
              <option value="">選択...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.company_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">ルート</label>
            <select
              value={form.route_id}
              onChange={(e) => setForm({ ...form, route_id: e.target.value, price_id: "" })}
              className="w-full"
              required
            >
              <option value="">選択...</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.departure} → {r.destination}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">積み地</label>
              <input
                type="text"
                value={form.loading_place}
                onChange={(e) => setForm({ ...form, loading_place: e.target.value })}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">下ろし先</label>
              <input
                type="text"
                value={form.unloading_place}
                onChange={(e) => setForm({ ...form, unloading_place: e.target.value })}
                className="w-full"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">単価パターン</label>
            <select
              value={form.price_type}
              onChange={(e) => setForm({ ...form, price_type: e.target.value as PriceType, price_id: "" })}
              className="w-full"
            >
              <option value="per_ton">t単価型</option>
              <option value="fixed">固定単価型</option>
              <option value="spot">スポット型</option>
            </select>
          </div>
          {form.price_type !== "spot" && (
            <div>
              <label className="block text-xs text-muted mb-1">単価選択</label>
              <select
                value={form.price_id}
                onChange={(e) => setForm({ ...form, price_id: e.target.value })}
                className="w-full"
              >
                <option value="">選択...</option>
                {filteredPrices
                  .filter((p) => p.price_type === form.price_type)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.price_type === "per_ton"
                        ? `${p.per_ton_rate}円/t`
                        : `${p.fixed_amount?.toLocaleString()}円`}
                    </option>
                  ))}
              </select>
            </div>
          )}
          {form.price_type === "per_ton" && (
            <div>
              <label className="block text-xs text-muted mb-1">重量(t)</label>
              <input
                type="number"
                step="0.01"
                value={form.weight}
                onChange={(e) => setForm({ ...form, weight: e.target.value })}
                className="w-full"
              />
            </div>
          )}
          {form.price_type === "spot" && (
            <div>
              <label className="block text-xs text-muted mb-1">スポット金額</label>
              <input
                type="number"
                value={form.spot_amount}
                onChange={(e) => setForm({ ...form, spot_amount: e.target.value })}
                className="w-full"
                required
              />
            </div>
          )}
          <button
            type="submit"
            className="w-full py-2.5 bg-white text-black text-sm rounded-md hover:bg-gray-200 transition-colors mt-4"
          >
            {editingId ? "更新" : "登録"}
          </button>
        </form>
      </Modal>
    </div>
  );
}

export default function DispatchPage() {
  return (
    <AuthGuard>
      <DispatchContent />
    </AuthGuard>
  );
}
