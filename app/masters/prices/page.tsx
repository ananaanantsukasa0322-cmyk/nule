"use client";

import { useEffect, useState, useCallback } from "react";
import AuthGuard from "@/components/AuthGuard";
import Modal from "@/components/Modal";

interface PriceEntry {
  id: string; client_name: string; load_place: string; unload_place: string;
  price_type: string; per_ton_rate: number | null; fixed_amount: number | null;
}

function PricesContent() {
  const [prices, setPrices] = useState<PriceEntry[]>([]);
  const [schedules, setSchedules] = useState<{load_place:string;unload_place:string;client_name?:string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({
    client_name: "", load_place: "", unload_place: "",
    price_type: "per_ton", per_ton_rate: "", fixed_amount: "",
  });

  const loadData = useCallback(async () => {
    const [p, s] = await Promise.all([
      fetch("/api/masters/prices").then(r => r.json()),
      fetch("/api/schedules").then(r => r.json()).catch(() => []),
    ]);
    setPrices((p.prices || []).map((x: Record<string, unknown>) => ({
      id: x.id as string, client_name: (x.client_name || '') as string, load_place: (x.load_place || '') as string,
      unload_place: (x.unload_place || '') as string, price_type: (x.price_type || 'fixed') as string,
      per_ton_rate: x.per_ton_rate as number | null, fixed_amount: x.fixed_amount as number | null,
    })));
    setSchedules(Array.isArray(s) ? s : []);
    setSelected(new Set());
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const knownClients = [...new Set(schedules.map(s => s.client_name).filter(Boolean) as string[])].sort();
  const knownOrigins = [...new Set(schedules.map(s => s.load_place).filter(Boolean))].sort();
  const knownDests = [...new Set(schedules.map(s => s.unload_place).filter(Boolean))].sort();

  function resetForm() {
    setForm({ client_name: "", load_place: "", unload_place: "", price_type: "per_ton", per_ton_rate: "", fixed_amount: "" });
    setEditingId(null);
  }

  function openEdit(p: PriceEntry) {
    setForm({
      client_name: p.client_name, load_place: p.load_place, unload_place: p.unload_place,
      price_type: p.price_type, per_ton_rate: p.per_ton_rate?.toString() || "",
      fixed_amount: p.fixed_amount?.toString() || "",
    });
    setEditingId(p.id);
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      ...form,
      per_ton_rate: form.price_type === "per_ton" ? Number(form.per_ton_rate) || 0 : null,
      fixed_amount: form.price_type === "fixed" ? Number(form.fixed_amount) || 0 : null,
    };
    const method = editingId ? "PUT" : "POST";
    const payload = editingId ? { ...body, id: editingId } : body;
    await fetch("/api/masters/prices", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setShowModal(false); resetForm(); loadData();
  }

  async function handleDelete(id: string) {
    if (!confirm("この単価を削除しますか？")) return;
    await fetch("/api/masters/prices", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    loadData();
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === prices.length) setSelected(new Set());
    else setSelected(new Set(prices.map(p => p.id)));
  }

  async function deleteSelected() {
    if (!selected.size) return;
    if (!confirm(`${selected.size}件の単価を削除しますか？`)) return;
    for (const id of selected) {
      await fetch("/api/masters/prices", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    }
    loadData();
  }

  async function editSelectedField(field: "client_name" | "load_place" | "unload_place") {
    if (!selected.size) return;
    const labels = { client_name: "荷主", load_place: "積み地", unload_place: "下ろし先" };
    const val = prompt(`${labels[field]}を入力してください`);
    if (val === null) return;
    for (const id of selected) {
      await fetch("/api/masters/prices", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, [field]: val }),
      });
    }
    loadData();
  }

  const fmt = (n: number | null) => n != null ? `¥${n.toLocaleString()}` : "—";

  if (loading) return <div className="text-muted text-sm">読み込み中...</div>;

  return (
    <div>
      {aiLoading && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-muted border-t-white rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white text-lg font-light">AI解析中...</p>
            <p className="text-muted text-sm mt-2">しばらくお待ちください</p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-light">単価マスタ</h2>
        <div className="flex items-center gap-3">
          <label className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded cursor-pointer hover:bg-blue-700">
            AI単価取込
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={async (ev) => {
              const f = ev.target.files?.[0]; if (!f) return;
              try {
                setAiLoading(true);
                const fd = new FormData(); fd.append("file", f); fd.append("type", "price_sheet");
                const res = await fetch("/api/ai-parse", { method: "POST", body: fd });
                const data = await res.json();
                if (res.ok && data.entries && data.entries.length > 0) {
                  let ok = 0;
                  for (const ent of data.entries) {
                    if (!ent.rate) continue;
                    await fetch("/api/masters/prices", {
                      method: "POST", headers: {"Content-Type":"application/json"},
                      body: JSON.stringify({
                        client_name: ent.shipper || '', load_place: ent.origin || '', unload_place: ent.destination || '',
                        price_type: ent.price_type || "fixed",
                        fixed_amount: ent.price_type !== "per_ton" ? Number(ent.rate) : null,
                        per_ton_rate: ent.price_type === "per_ton" ? Number(ent.rate) : null,
                      })
                    });
                    ok++;
                  }
                  alert(`${ok}件の単価を取り込みました`); loadData();
                } else { alert("解析結果: " + (data.error || JSON.stringify(data))); }
              } catch(err) { alert("エラー: " + (err instanceof Error ? err.message : String(err))); }
              setAiLoading(false);
              ev.target.value = "";
            }} />
          </label>
          <button onClick={() => { resetForm(); setShowModal(true); }}
            className="px-4 py-2 bg-white text-black text-sm rounded-md hover:bg-gray-200">
            + 新規単価
          </button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-accent/30 rounded">
          <span className="text-sm">{selected.size}件選択中</span>
          <button onClick={() => editSelectedField("client_name")} className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">荷主変更</button>
          <button onClick={() => editSelectedField("load_place")} className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">積み地変更</button>
          <button onClick={() => editSelectedField("unload_place")} className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">下ろし先変更</button>
          <button onClick={async () => {
            if (!selected.size) return;
            const t = prompt("単価タイプを入力\n1: t単価\n2: 固定");
            if (!t) return;
            const pt = t === "1" ? "per_ton" : t === "2" ? "fixed" : null;
            if (!pt) { alert("1か2を入力してください"); return; }
            for (const id of selected) {
              const p = prices.find(x => x.id === id);
              if (!p) continue;
              const currentRate = p.per_ton_rate || p.fixed_amount || 0;
              await fetch("/api/masters/prices", { method: "PUT", headers: {"Content-Type":"application/json"}, body: JSON.stringify({
                id, price_type: pt,
                per_ton_rate: pt === "per_ton" ? currentRate : null,
                fixed_amount: pt === "fixed" ? currentRate : null,
              }) });
            }
            loadData();
          }} className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">タイプ変更</button>
          <button onClick={deleteSelected} className="text-xs px-3 py-1 bg-danger text-white rounded hover:bg-red-600">まとめて削除</button>
          <button onClick={() => setSelected(new Set())} className="text-xs text-muted hover:text-white ml-auto">選択解除</button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table>
          <thead><tr>
            <th><input type="checkbox" checked={selected.size === prices.length && prices.length > 0} onChange={toggleAll} /></th>
            <th>荷主</th><th>積み地</th><th>下ろし先</th><th>タイプ</th><th>単価/金額</th><th>操作</th>
          </tr></thead>
          <tbody>
            {prices.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-muted py-8">単価データがありません</td></tr>
            ) : prices.map(p => (
              <tr key={p.id} className={selected.has(p.id) ? "bg-accent/20" : ""}>
                <td><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} /></td>
                <td className="text-sm">{p.client_name || "—"}</td>
                <td className="text-sm">{p.load_place || "—"}</td>
                <td className="text-sm">{p.unload_place || "—"}</td>
                <td><span className="text-xs px-2 py-0.5 rounded bg-accent">{p.price_type === "per_ton" ? "t単価" : "固定"}</span></td>
                <td className="text-sm">{p.price_type === "per_ton" ? `${fmt(p.per_ton_rate)}/t` : fmt(p.fixed_amount)}</td>
                <td>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(p)} className="text-xs text-muted hover:text-white">編集</button>
                    <button onClick={() => handleDelete(p.id)} className="text-xs text-muted hover:text-danger">削除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editingId ? "単価編集" : "新規単価"}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <datalist id="dl-pc">{knownClients.map(c => <option key={c} value={c} />)}</datalist>
          <datalist id="dl-po">{knownOrigins.map(c => <option key={c} value={c} />)}</datalist>
          <datalist id="dl-pd">{knownDests.map(c => <option key={c} value={c} />)}</datalist>
          <div><label className="block text-xs text-muted mb-1">荷主</label>
            <input type="text" list="dl-pc" value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} className="w-full" required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-muted mb-1">積み地</label>
              <input type="text" list="dl-po" value={form.load_place} onChange={e => setForm({ ...form, load_place: e.target.value })} className="w-full" /></div>
            <div><label className="block text-xs text-muted mb-1">下ろし先</label>
              <input type="text" list="dl-pd" value={form.unload_place} onChange={e => setForm({ ...form, unload_place: e.target.value })} className="w-full" /></div>
          </div>
          <div><label className="block text-xs text-muted mb-1">単価タイプ</label>
            <select value={form.price_type} onChange={e => setForm({ ...form, price_type: e.target.value })} className="w-full">
              <option value="per_ton">t単価（円/t）</option>
              <option value="fixed">固定金額（円/回）</option>
            </select></div>
          {form.price_type === "per_ton" ? (
            <div><label className="block text-xs text-muted mb-1">t単価（円）</label>
              <input type="number" step="1" value={form.per_ton_rate} onChange={e => setForm({ ...form, per_ton_rate: e.target.value })} className="w-full" required /></div>
          ) : (
            <div><label className="block text-xs text-muted mb-1">固定金額（円）</label>
              <input type="number" step="1" value={form.fixed_amount} onChange={e => setForm({ ...form, fixed_amount: e.target.value })} className="w-full" required /></div>
          )}
          <button type="submit" className="w-full py-2.5 bg-white text-black text-sm rounded-md hover:bg-gray-200 mt-4">{editingId ? "更新" : "登録"}</button>
        </form>
      </Modal>
    </div>
  );
}

export default function PricesPage() {
  return (
    <AuthGuard allowedRoles={["admin", "office"]}>
      <PricesContent />
    </AuthGuard>
  );
}
