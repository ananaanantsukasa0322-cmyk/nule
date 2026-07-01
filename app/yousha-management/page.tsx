"use client";

import { useEffect, useState, useCallback } from "react";
import AuthGuard from "@/components/AuthGuard";
import Modal from "@/components/Modal";

interface Yousha {
  id: string; name: string; display_name: string; company: string;
  phone: string; vehicle_info: string; payment_rate: number; note: string;
}

interface Schedule {
  id: string; load_date: string; unload_date: string; load_place: string;
  unload_place: string; weight: number; driver_id: string | null; done: boolean;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n);
}

function YoushaContent() {
  const [youshas, setYoushas] = useState<Yousha[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedYousha, setSelectedYousha] = useState<Yousha | null>(null);
  const [form, setForm] = useState({
    name: "", display_name: "", company: "", phone: "",
    vehicle_info: "", payment_rate: "", note: "",
  });

  const now = new Date();
  const [dateFrom, setDateFrom] = useState(
    new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]
  );
  const [dateTo, setDateTo] = useState(
    new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0]
  );

  const loadData = useCallback(async () => {
    const [y, s] = await Promise.all([
      fetch("/api/youshas").then(r => r.json()).catch(() => []),
      fetch("/api/schedules").then(r => r.json()).catch(() => []),
    ]);
    setYoushas(Array.isArray(y) ? y : []);
    setSchedules(Array.isArray(s) ? s : []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function resetForm() {
    setForm({ name: "", display_name: "", company: "", phone: "", vehicle_info: "", payment_rate: "", note: "" });
    setEditId(null);
  }

  function openEdit(y: Yousha) {
    setForm({
      name: y.name, display_name: y.display_name || "", company: y.company || "",
      phone: y.phone || "", vehicle_info: y.vehicle_info || "",
      payment_rate: y.payment_rate?.toString() || "0", note: y.note || "",
    });
    setEditId(y.id);
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const body = { ...form, payment_rate: Number(form.payment_rate) || 0 };
    const method = editId ? "PUT" : "POST";
    const url = editId ? `/api/youshas/${editId}` : "/api/youshas";
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setShowModal(false); resetForm(); loadData();
  }

  async function handleDelete(id: string) {
    if (!confirm("この傭車を削除しますか？")) return;
    await fetch(`/api/youshas/${id}`, { method: "DELETE" });
    loadData();
  }

  function openPayment(y: Yousha) {
    setSelectedYousha(y);
    setShowPayment(true);
  }

  function getYoushaSchedules(youshaId: string) {
    return schedules.filter(s => {
      const did = s.driver_id || "";
      return did === `y_${youshaId}` || did === youshaId;
    }).filter(s => (s.unload_date || s.load_date) >= dateFrom && (s.unload_date || s.load_date) <= dateTo);
  }

  if (loading) return <div className="text-muted text-sm">読み込み中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-light">傭車管理</h2>
        <button onClick={() => { resetForm(); setShowModal(true); }}
          className="px-4 py-2 bg-white text-black text-sm rounded-md hover:bg-gray-200">
          + 傭車追加
        </button>
      </div>

      <div className="overflow-x-auto mb-8">
        <table>
          <thead>
            <tr>
              <th>表示名</th><th>会社名</th><th>連絡先</th><th>車両情報</th>
              <th>支払単価</th><th>備考</th><th></th>
            </tr>
          </thead>
          <tbody>
            {youshas.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-muted py-8">傭車データなし</td></tr>
            ) : youshas.map(y => (
              <tr key={y.id}>
                <td className="text-sm font-medium">{y.display_name || y.name}</td>
                <td className="text-sm text-muted">{y.company || "—"}</td>
                <td className="text-sm text-muted">{y.phone || "—"}</td>
                <td className="text-sm text-muted">{y.vehicle_info || "—"}</td>
                <td className="text-sm">{y.payment_rate ? formatCurrency(y.payment_rate) : "—"}</td>
                <td className="text-xs text-muted">{y.note || ""}</td>
                <td>
                  <div className="flex gap-2">
                    <button onClick={() => openPayment(y)} className="text-xs text-blue-400 hover:text-blue-300">支払明細</button>
                    <button onClick={() => openEdit(y)} className="text-xs text-muted hover:text-white">編集</button>
                    <button onClick={() => handleDelete(y.id)} className="text-xs text-muted hover:text-danger">削除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="text-lg font-light mb-4">支払い集計</h3>
      <div className="flex gap-3 mb-4">
        <div>
          <label className="block text-xs text-muted mb-1">開始日</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">終了日</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr><th>傭車名</th><th>配車件数</th><th>合計重量</th><th>支払単価</th><th>支払合計</th></tr>
          </thead>
          <tbody>
            {youshas.map(y => {
              const yScheds = getYoushaSchedules(y.id);
              const totalWeight = yScheds.reduce((s, sc) => s + (sc.weight || 0), 0);
              const totalPayment = yScheds.length * (y.payment_rate || 0);
              return (
                <tr key={y.id}>
                  <td className="text-sm font-medium">{y.display_name || y.name}</td>
                  <td className="text-sm">{yScheds.length}件</td>
                  <td className="text-sm">{totalWeight > 0 ? `${(totalWeight / 1000).toFixed(1)}t` : "—"}</td>
                  <td className="text-sm">{y.payment_rate ? formatCurrency(y.payment_rate) : "—"}</td>
                  <td className="text-sm font-medium">{formatCurrency(totalPayment)}</td>
                </tr>
              );
            })}
            {youshas.length === 0 && (
              <tr><td colSpan={5} className="text-center text-muted py-8">傭車データなし</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editId ? "傭車編集" : "傭車追加"}>
        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-muted mb-1">正式名称</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full" required /></div>
            <div><label className="block text-xs text-muted mb-1">表示名</label>
              <input type="text" value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} className="w-full" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-muted mb-1">会社名</label>
              <input type="text" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} className="w-full" /></div>
            <div><label className="block text-xs text-muted mb-1">連絡先</label>
              <input type="text" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-muted mb-1">車両情報</label>
              <input type="text" value={form.vehicle_info} onChange={e => setForm({ ...form, vehicle_info: e.target.value })} className="w-full" placeholder="車番等" /></div>
            <div><label className="block text-xs text-muted mb-1">支払単価 (円/件)</label>
              <input type="number" value={form.payment_rate} onChange={e => setForm({ ...form, payment_rate: e.target.value })} className="w-full" /></div>
          </div>
          <div><label className="block text-xs text-muted mb-1">備考</label>
            <input type="text" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="w-full" /></div>
          <button type="submit" className="w-full py-2.5 bg-white text-black text-sm rounded-md hover:bg-gray-200 mt-4">{editId ? "更新" : "登録"}</button>
        </form>
      </Modal>

      <Modal open={showPayment} onClose={() => setShowPayment(false)} title={`${selectedYousha?.display_name || ""} 支払明細`}>
        {selectedYousha && (() => {
          const yScheds = getYoushaSchedules(selectedYousha.id);
          return (
            <div>
              <p className="text-xs text-muted mb-3">{dateFrom} 〜 {dateTo}</p>
              <div className="overflow-x-auto">
                <table>
                  <thead><tr><th>積込日</th><th>積込場所</th><th>下ろし場所</th><th>重量</th><th>金額</th></tr></thead>
                  <tbody>
                    {yScheds.length === 0 ? (
                      <tr><td colSpan={5} className="text-center text-muted py-4">該当なし</td></tr>
                    ) : yScheds.map(s => (
                      <tr key={s.id}>
                        <td className="text-xs">{s.load_date}</td>
                        <td className="text-xs">{s.load_place}</td>
                        <td className="text-xs">{s.unload_place}</td>
                        <td className="text-xs">{s.weight ? `${(s.weight / 1000).toFixed(1)}t` : "—"}</td>
                        <td className="text-xs">{formatCurrency(selectedYousha.payment_rate || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between items-center mt-4 pt-3 border-t border-border">
                <span className="text-sm text-muted">{yScheds.length}件</span>
                <span className="text-lg font-light">{formatCurrency(yScheds.length * (selectedYousha.payment_rate || 0))}</span>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

export default function YoushaManagementPage() {
  return (
    <AuthGuard allowedRoles={["admin", "office"]}>
      <YoushaContent />
    </AuthGuard>
  );
}
