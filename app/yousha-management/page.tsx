"use client";

import { useEffect, useState, useCallback } from "react";
import AuthGuard from "@/components/AuthGuard";
import Modal from "@/components/Modal";

interface YoushaPriceRule {
  load_place: string; unload_place: string; price_type: "per_ton" | "fixed"; rate: number;
}

interface Yousha {
  id: string; name: string; display_name: string; company: string;
  phone: string; vehicle_info: string; payment_rate: number; note: string;
  category?: "steel" | "container";
  price_rules?: YoushaPriceRule[];
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
  const [showPriceRules, setShowPriceRules] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedYousha, setSelectedYousha] = useState<Yousha | null>(null);
  const [priceRuleYousha, setPriceRuleYousha] = useState<Yousha | null>(null);
  const [ruleForm, setRuleForm] = useState<YoushaPriceRule>({ load_place: "", unload_place: "", price_type: "per_ton", rate: 0 });
  const [form, setForm] = useState({
    name: "", display_name: "", company: "", phone: "",
    vehicle_info: "", payment_rate: "", note: "", category: "steel",
  });
  const [categoryFilter, setCategoryFilter] = useState<"all" | "steel" | "container">("all");

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
    setForm({ name: "", display_name: "", company: "", phone: "", vehicle_info: "", payment_rate: "", note: "", category: "steel" });
    setEditId(null);
  }

  function openEdit(y: Yousha) {
    setForm({
      name: y.name, display_name: y.display_name || "", company: y.company || "",
      phone: y.phone || "", vehicle_info: y.vehicle_info || "",
      payment_rate: y.payment_rate?.toString() || "0", note: y.note || "",
      category: y.category || "steel",
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

  function openPriceRules(y: Yousha) {
    setPriceRuleYousha(y);
    setRuleForm({ load_place: "", unload_place: "", price_type: "per_ton", rate: 0 });
    setShowPriceRules(true);
  }

  async function saveRules(rules: YoushaPriceRule[]) {
    if (!priceRuleYousha) return;
    const res = await fetch(`/api/youshas/${priceRuleYousha.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price_rules: rules }),
    });
    if (res.ok) {
      const saved = await res.json();
      setPriceRuleYousha(saved);
      setYoushas(prev => prev.map(x => x.id === saved.id ? saved : x));
    }
  }

  async function addPriceRule() {
    if (!priceRuleYousha || !ruleForm.load_place.trim() || !ruleForm.unload_place.trim() || !ruleForm.rate) return;
    const rules = [...(priceRuleYousha.price_rules || []), { ...ruleForm, load_place: ruleForm.load_place.trim(), unload_place: ruleForm.unload_place.trim() }];
    await saveRules(rules);
    setRuleForm({ load_place: "", unload_place: "", price_type: "per_ton", rate: 0 });
  }

  async function removePriceRule(idx: number) {
    if (!priceRuleYousha) return;
    const rules = (priceRuleYousha.price_rules || []).filter((_, i) => i !== idx);
    await saveRules(rules);
  }

  function getYoushaSchedules(youshaId: string) {
    return schedules.filter(s => {
      const did = s.driver_id || "";
      return did === `y_${youshaId}` || did === youshaId;
    }).filter(s => (s.unload_date || s.load_date) >= dateFrom && (s.unload_date || s.load_date) <= dateTo);
  }

  function matchRoutePlace(rulePlace: string, schedPlace: string): boolean {
    if (!rulePlace || !schedPlace) return !rulePlace;
    if (rulePlace === schedPlace) return true;
    if (schedPlace.includes(rulePlace) || rulePlace.includes(schedPlace)) return true;
    return false;
  }

  // 単価表（ルートごとのt単価/固定単価）が設定されていればそれを使い、
  // 無ければ従来通りの件単位の支払単価にフォールバックする
  function calcYoushaPayment(y: Yousha, s: Schedule): number {
    const rules = y.price_rules || [];
    let rule = rules.find(r => r.load_place === s.load_place && r.unload_place === s.unload_place);
    if (!rule) rule = rules.find(r => matchRoutePlace(r.load_place, s.load_place) && matchRoutePlace(r.unload_place, s.unload_place));
    if (rule) {
      if (rule.price_type === "per_ton") return Math.round((rule.rate || 0) * (s.weight || 0) / 1000);
      return rule.rate || 0;
    }
    return y.payment_rate || 0;
  }

  if (loading) return <div className="text-muted text-sm">読み込み中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-light">傭車管理</h2>
        <button onClick={() => { resetForm(); setShowModal(true); }}
          className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-md hover:opacity-90">
          + 傭車追加
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4">
        {(["all", "steel", "container"] as const).map(c => (
          <button key={c} onClick={() => setCategoryFilter(c)}
            className={`text-xs px-3 py-1.5 rounded-md transition-colors ${categoryFilter === c ? "bg-primary text-primary-foreground" : "bg-accent text-muted hover:text-foreground"}`}>
            {c === "all" ? "全て" : c === "steel" ? "鋼材" : "コンテナ"}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto mb-8">
        <table>
          <thead>
            <tr>
              <th>表示名</th><th>区分</th><th>会社名</th><th>連絡先</th><th>車両情報</th>
              <th>支払単価</th><th>備考</th><th></th>
            </tr>
          </thead>
          <tbody>
            {youshas.filter(y => categoryFilter === "all" || (y.category || "steel") === categoryFilter).length === 0 ? (
              <tr><td colSpan={8} className="text-center text-muted py-8">傭車データなし</td></tr>
            ) : youshas.filter(y => categoryFilter === "all" || (y.category || "steel") === categoryFilter).map(y => (
              <tr key={y.id}>
                <td className="text-sm font-medium">{y.display_name || y.name}</td>
                <td className="text-xs text-muted">{(y.category || "steel") === "steel" ? "鋼材" : "コンテナ"}</td>
                <td className="text-sm text-muted">{y.company || "—"}</td>
                <td className="text-sm text-muted">{y.phone || "—"}</td>
                <td className="text-sm text-muted">{y.vehicle_info || "—"}</td>
                <td className="text-sm">{y.payment_rate ? formatCurrency(y.payment_rate) : "—"}</td>
                <td className="text-xs text-muted">{y.note || ""}</td>
                <td>
                  <div className="flex gap-2">
                    <button onClick={() => openPriceRules(y)} className="text-xs text-blue-600 hover:text-blue-700">単価設定</button>
                    <button onClick={() => openPayment(y)} className="text-xs text-blue-600 hover:text-blue-700">支払明細</button>
                    <button onClick={() => openEdit(y)} className="text-xs text-muted hover:text-foreground">編集</button>
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
            <tr><th>傭車名</th><th>配車件数</th><th>合計重量</th><th>単価設定</th><th>支払合計</th></tr>
          </thead>
          <tbody>
            {youshas.map(y => {
              const yScheds = getYoushaSchedules(y.id);
              const totalWeight = yScheds.reduce((s, sc) => s + (sc.weight || 0), 0);
              const totalPayment = yScheds.reduce((sum, sc) => sum + calcYoushaPayment(y, sc), 0);
              return (
                <tr key={y.id}>
                  <td className="text-sm font-medium">{y.display_name || y.name}</td>
                  <td className="text-sm">{yScheds.length}件</td>
                  <td className="text-sm">{totalWeight > 0 ? `${(totalWeight / 1000).toFixed(1)}t` : "—"}</td>
                  <td className="text-sm text-muted">{(y.price_rules?.length ?? 0) > 0 ? `ルート別${y.price_rules!.length}件` : y.payment_rate ? `件単位 ${formatCurrency(y.payment_rate)}` : "—"}</td>
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
          <div><label className="block text-xs text-muted mb-1">区分</label>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full">
              <option value="steel">鋼材</option>
              <option value="container">コンテナ</option>
            </select></div>
          <button type="submit" className="w-full py-2.5 bg-primary text-primary-foreground text-sm rounded-md hover:opacity-90 mt-4">{editId ? "更新" : "登録"}</button>
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
                        <td className="text-xs">{formatCurrency(calcYoushaPayment(selectedYousha, s))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between items-center mt-4 pt-3 border-t border-border">
                <span className="text-sm text-muted">{yScheds.length}件</span>
                <span className="text-lg font-light">{formatCurrency(yScheds.reduce((sum, s) => sum + calcYoushaPayment(selectedYousha, s), 0))}</span>
              </div>
            </div>
          );
        })()}
      </Modal>

      <Modal open={showPriceRules} onClose={() => setShowPriceRules(false)} title={`${priceRuleYousha?.display_name || ""} 単価設定`}>
        {priceRuleYousha && (
          <div>
            <p className="text-xs text-muted mb-3">積み地・下ろし先ごとの支払単価（t単価 or 固定）。一致するものが無い仕事は「支払単価(円/件)」が使われます。</p>
            <div className="overflow-x-auto mb-4">
              <table>
                <thead><tr><th>積み地</th><th>下ろし先</th><th>種別</th><th>単価</th><th></th></tr></thead>
                <tbody>
                  {(priceRuleYousha.price_rules || []).length === 0 ? (
                    <tr><td colSpan={5} className="text-center text-muted py-4">ルート別単価は未設定です</td></tr>
                  ) : (priceRuleYousha.price_rules || []).map((r, i) => (
                    <tr key={i}>
                      <td className="text-sm">{r.load_place}</td>
                      <td className="text-sm">{r.unload_place}</td>
                      <td className="text-xs text-muted">{r.price_type === "per_ton" ? "t単価" : "固定"}</td>
                      <td className="text-sm">{formatCurrency(r.rate)}{r.price_type === "per_ton" ? "/t" : ""}</td>
                      <td><button onClick={() => removePriceRule(i)} className="text-xs text-muted hover:text-danger">削除</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><label className="block text-xs text-muted mb-1">積み地</label>
                <input type="text" value={ruleForm.load_place} onChange={e => setRuleForm({ ...ruleForm, load_place: e.target.value })} className="w-full" /></div>
              <div><label className="block text-xs text-muted mb-1">下ろし先</label>
                <input type="text" value={ruleForm.unload_place} onChange={e => setRuleForm({ ...ruleForm, unload_place: e.target.value })} className="w-full" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><label className="block text-xs text-muted mb-1">種別</label>
                <select value={ruleForm.price_type} onChange={e => setRuleForm({ ...ruleForm, price_type: e.target.value as "per_ton" | "fixed" })} className="w-full">
                  <option value="per_ton">t単価（円/t）</option>
                  <option value="fixed">固定（円/件）</option>
                </select></div>
              <div><label className="block text-xs text-muted mb-1">単価</label>
                <input type="number" value={ruleForm.rate || ""} onChange={e => setRuleForm({ ...ruleForm, rate: Number(e.target.value) || 0 })} className="w-full" /></div>
            </div>
            <button onClick={addPriceRule} className="w-full py-2.5 bg-primary text-primary-foreground text-sm rounded-md hover:opacity-90">+ ルート単価を追加</button>
          </div>
        )}
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
