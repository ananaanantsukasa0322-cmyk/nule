"use client";

import { useEffect, useState, useCallback } from "react";
import AuthGuard from "@/components/AuthGuard";
import Modal from "@/components/Modal";
import FileImport from "@/components/FileImport";
import { useToast } from "@/components/Toast";

interface Vehicle {
  id: string; kind: string; number: string; head_number: string; trailer_number: string;
  payload: number; note: string;
  shaken_date?: string | null; inspection_3m_date?: string | null;
  repair_note?: string | null; caution?: string | null;
}
interface Driver {
  id: string; name: string; phone?: string; status?: string;
}
interface Notice {
  id: string; title: string; body: string; target: string; department: string;
  due_date?: string | null; created_at: string;
}

const TARGET_LABELS: Record<string, string> = {
  all: "全部署", dispatch: "配車", office: "事務",
};

function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function DateBadge({ date, warnDays }: { date?: string | null; warnDays: number }) {
  const days = daysUntil(date);
  if (days === null) return <span className="text-xs text-muted">未登録</span>;
  const cls = days < 0 ? "bg-red-500/20 text-red-400"
    : days <= warnDays ? "bg-amber-500/20 text-amber-400"
    : "bg-white/5 text-muted";
  const label = days < 0 ? `${-days}日超過` : days === 0 ? "本日" : `あと${days}日`;
  return (
    <span className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${cls}`}>
      {date}（{label}）
    </span>
  );
}

function MaintenanceContent() {
  const { show, node: toastNode } = useToast();
  const [tab, setTab] = useState<"vehicles" | "drivers" | "notices">("vehicles");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);

  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);
  const [vForm, setVForm] = useState({ shaken_date: "", inspection_3m_date: "", repair_note: "", caution: "", payload: "", number: "", head_number: "", trailer_number: "", kind: "" });

  const [editDriver, setEditDriver] = useState<Driver | null>(null);
  const [dForm, setDForm] = useState({ name: "", phone: "", status: "" });

  const [nForm, setNForm] = useState({ title: "", body: "", target: "all", department: "整備", due_date: "" });

  const loadData = useCallback(async () => {
    const [v, d, n] = await Promise.all([
      fetch("/api/vehicles").then(r => r.json()).catch(() => []),
      fetch("/api/drivers").then(r => r.json()).catch(() => []),
      fetch("/api/notices").then(r => r.json()).catch(() => []),
    ]);
    setVehicles(Array.isArray(v) ? v : []);
    setDrivers(Array.isArray(d) ? d : []);
    setNotices(Array.isArray(n) ? n : []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function openVehicleEdit(v: Vehicle) {
    setEditVehicle(v);
    setVForm({
      shaken_date: v.shaken_date || "", inspection_3m_date: v.inspection_3m_date || "",
      repair_note: v.repair_note || "", caution: v.caution || "",
      payload: v.payload ? String(v.payload) : "", number: v.number || "",
      head_number: v.head_number || "", trailer_number: v.trailer_number || "", kind: v.kind || "",
    });
  }

  async function saveVehicle(e: React.FormEvent) {
    e.preventDefault();
    if (!editVehicle) return;
    const res = await fetch(`/api/vehicles/${editVehicle.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: vForm.kind, number: vForm.number, head_number: vForm.head_number,
        trailer_number: vForm.trailer_number, payload: Number(vForm.payload) || 0,
        shaken_date: vForm.shaken_date || null,
        inspection_3m_date: vForm.inspection_3m_date || null,
        repair_note: vForm.repair_note || null,
        caution: vForm.caution || null,
      }),
    });
    if (res.ok) { show("車両情報を保存しました"); setEditVehicle(null); loadData(); }
    else { const d = await res.json().catch(() => ({})); show(d.error || "保存に失敗しました", "error"); }
  }

  function openDriverEdit(d: Driver) {
    setEditDriver(d);
    setDForm({ name: d.name, phone: d.phone || "", status: d.status || "稼働中" });
  }

  async function saveDriver(e: React.FormEvent) {
    e.preventDefault();
    if (!editDriver) return;
    const res = await fetch(`/api/drivers/${editDriver.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...editDriver, name: dForm.name, phone: dForm.phone, status: dForm.status }),
    });
    if (res.ok) { show("ドライバー情報を保存しました"); setEditDriver(null); loadData(); }
    else { const d = await res.json().catch(() => ({})); show(d.error || "保存に失敗しました", "error"); }
  }

  async function addNotice(e: React.FormEvent) {
    e.preventDefault();
    if (!nForm.title.trim()) { show("タイトルを入力してください", "error"); return; }
    const res = await fetch("/api/notices", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...nForm, due_date: nForm.due_date || null }),
    });
    if (res.ok) { show("注意事項を共有しました"); setNForm({ title: "", body: "", target: "all", department: nForm.department, due_date: "" }); loadData(); }
    else { const d = await res.json().catch(() => ({})); show(d.error || "登録に失敗しました（noticesテーブルが必要です）", "error"); }
  }

  async function deleteNotice(id: string) {
    if (!confirm("この注意事項を終了しますか？")) return;
    const res = await fetch("/api/notices", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) show("終了しました"); else show("削除に失敗しました", "error");
    loadData();
  }

  async function handleAiImport(ev: React.ChangeEvent<HTMLInputElement>, type: "vehicles" | "drivers") {
    const f = ev.target.files?.[0]; if (!f) return;
    try {
      setAiLoading(true);
      const fd = new FormData(); fd.append("file", f); fd.append("type", type);
      const res = await fetch("/api/ai-parse", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.entries?.length) {
        show("解析できませんでした: " + (data.error || "データなし"), "error");
        return;
      }
      let ok = 0;
      if (type === "vehicles") {
        for (const ent of data.entries as Record<string, string>[]) {
          const num = (ent.number || "").trim(); const head = (ent.head_number || "").trim();
          if (!num && !head) continue;
          const match = vehicles.find(v =>
            (num && (v.number === num || v.head_number === num)) ||
            (head && (v.head_number === head || v.number === head)));
          const values: Record<string, unknown> = {};
          if (ent.kind) values.kind = ent.kind;
          if (num) values.number = num;
          if (head) values.head_number = head;
          if (ent.trailer_number) values.trailer_number = ent.trailer_number;
          if (ent.payload) values.payload = Number(String(ent.payload).replace(/[,kg]/g, "")) || 0;
          if (ent.shaken_date) values.shaken_date = ent.shaken_date;
          if (ent.inspection_3m_date) values.inspection_3m_date = ent.inspection_3m_date;
          if (ent.repair_note) values.repair_note = ent.repair_note;
          if (ent.caution) values.caution = ent.caution;
          const r = match
            ? await fetch(`/api/vehicles/${match.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...match, ...values }) })
            : await fetch("/api/vehicles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "トラック", ...values }) });
          if (r.ok) ok++;
        }
      } else {
        const norm = (n: string) => n.replace(/[\s　]/g, "");
        for (const ent of data.entries as Record<string, string>[]) {
          const name = (ent.name || "").trim();
          if (!name) continue;
          const match = drivers.find(d => norm(d.name) === norm(name));
          const values = { name, phone: ent.phone || "", status: ent.status || "稼働中" };
          const r = match
            ? await fetch(`/api/drivers/${match.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...match, ...values }) })
            : await fetch("/api/drivers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
          if (r.ok) ok++;
        }
      }
      show(`${ok}件を取り込みました（既存は更新、新規は追加）`);
      loadData();
    } catch (err) {
      show("エラー: " + (err instanceof Error ? err.message : String(err)), "error");
    } finally {
      setAiLoading(false);
      ev.target.value = "";
    }
  }

  const vehicleName = (v: Vehicle) => v.number || v.head_number || v.trailer_number || "（車番未設定）";

  if (loading) return <div className="text-muted text-sm">読み込み中...</div>;

  return (
    <div>
      {toastNode}
      {aiLoading && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-muted border-t-white rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white text-lg font-light">AI解析中...</p>
          </div>
        </div>
      )}

      <h2 className="text-xl font-light mb-6">整備管理</h2>

      <div className="flex gap-1 mb-6 border-b border-border">
        {([["vehicles", "車両管理"], ["drivers", "ドライバー管理"], ["notices", "共有注意事項"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${tab === key ? "border-white text-white" : "border-transparent text-muted hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "vehicles" && (
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <FileImport target="vehicles" label="Excel/CSV取込（車番で照合・更新）" onComplete={loadData} />
            <label className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded cursor-pointer hover:bg-blue-700">
              AI取込（PDF/画像）
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => handleAiImport(e, "vehicles")} />
            </label>
            <span className="text-xs text-muted">列名例: 車番 / ヘッド / 台車 / 積載量 / 車検日 / 3ヶ月点検 / 修理情報 / 注意事項</span>
          </div>
          <div className="overflow-x-auto">
            <table>
              <thead><tr><th>車番</th><th>種別</th><th>積載量</th><th>車検満了日</th><th>3ヶ月点検</th><th>修理情報</th><th>注意事項</th><th>操作</th></tr></thead>
              <tbody>
                {vehicles.length === 0 ? (
                  <tr><td colSpan={8} className="text-center text-muted py-8">車両データがありません</td></tr>
                ) : vehicles.map(v => (
                  <tr key={v.id}>
                    <td className="text-sm whitespace-nowrap">{vehicleName(v)}</td>
                    <td className="text-xs text-muted">{v.kind || "—"}</td>
                    <td className="text-sm whitespace-nowrap">{v.payload ? `${v.payload.toLocaleString()}kg` : "—"}</td>
                    <td><DateBadge date={v.shaken_date} warnDays={30} /></td>
                    <td><DateBadge date={v.inspection_3m_date} warnDays={14} /></td>
                    <td className="text-xs text-muted max-w-[200px] truncate" title={v.repair_note || ""}>{v.repair_note || "—"}</td>
                    <td className="text-xs max-w-[200px] truncate" title={v.caution || ""}>
                      {v.caution ? <span className="text-amber-400">⚠️ {v.caution}</span> : "—"}
                    </td>
                    <td><button onClick={() => openVehicleEdit(v)} className="text-xs text-muted hover:text-white">編集</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "drivers" && (
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <FileImport target="drivers" label="Excel/CSV取込（名前で照合・更新）" onComplete={loadData} />
            <label className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded cursor-pointer hover:bg-blue-700">
              AI取込（PDF/画像）
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => handleAiImport(e, "drivers")} />
            </label>
            <span className="text-xs text-muted">列名例: 名前 / 連絡先 / 状態</span>
          </div>
          <div className="overflow-x-auto">
            <table>
              <thead><tr><th>名前</th><th>連絡先</th><th>状態</th><th>操作</th></tr></thead>
              <tbody>
                {drivers.length === 0 ? (
                  <tr><td colSpan={4} className="text-center text-muted py-8">ドライバーデータがありません</td></tr>
                ) : drivers.map(d => (
                  <tr key={d.id}>
                    <td className="text-sm">{d.name}</td>
                    <td className="text-sm text-muted">{d.phone || "—"}</td>
                    <td className="text-xs">{d.status || "稼働中"}</td>
                    <td><button onClick={() => openDriverEdit(d)} className="text-xs text-muted hover:text-white">編集</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "notices" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#111] border border-border rounded-lg p-5">
            <h3 className="text-sm font-light text-muted mb-4">注意事項を共有する</h3>
            <form onSubmit={addNotice} className="space-y-3">
              <div><label className="block text-xs text-muted mb-1">タイトル *</label>
                <input type="text" value={nForm.title} onChange={e => setNForm({ ...nForm, title: e.target.value })} className="w-full" placeholder="例: 9578は積み置き禁止" /></div>
              <div><label className="block text-xs text-muted mb-1">詳細</label>
                <textarea value={nForm.body} onChange={e => setNForm({ ...nForm, body: e.target.value })} className="w-full h-20" placeholder="例: ブレーキ修理中のため、当面積み置きはしないでください" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-xs text-muted mb-1">表示先</label>
                  <select value={nForm.target} onChange={e => setNForm({ ...nForm, target: e.target.value })} className="w-full">
                    <option value="all">全部署</option>
                    <option value="dispatch">配車のみ</option>
                    <option value="office">事務のみ</option>
                  </select></div>
                <div><label className="block text-xs text-muted mb-1">発信部署</label>
                  <input type="text" value={nForm.department} onChange={e => setNForm({ ...nForm, department: e.target.value })} className="w-full" placeholder="整備" /></div>
                <div><label className="block text-xs text-muted mb-1">期限（任意）</label>
                  <input type="date" value={nForm.due_date} onChange={e => setNForm({ ...nForm, due_date: e.target.value })} className="w-full" /></div>
              </div>
              <button type="submit" className="w-full py-2.5 bg-white text-black text-sm rounded-md hover:bg-gray-200">共有する</button>
            </form>
          </div>
          <div className="bg-[#111] border border-border rounded-lg p-5">
            <h3 className="text-sm font-light text-muted mb-4">共有中の注意事項</h3>
            {notices.length === 0 ? <p className="text-xs text-muted">共有中の注意事項はありません</p> : (
              <div className="space-y-3">
                {notices.map(n => (
                  <div key={n.id} className="border border-border rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs px-1.5 py-0.5 bg-white/5 rounded text-muted">{TARGET_LABELS[n.target] || n.target}</span>
                      {n.department && <span className="text-xs text-muted">発信: {n.department}</span>}
                      {n.due_date && <span className="text-xs text-amber-400">期限 {n.due_date}</span>}
                      <button onClick={() => deleteNotice(n.id)} className="text-xs text-muted hover:text-danger ml-auto">終了</button>
                    </div>
                    <p className="text-sm font-medium">{n.title}</p>
                    {n.body && <p className="text-xs text-muted mt-1 whitespace-pre-wrap">{n.body}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <Modal open={!!editVehicle} onClose={() => setEditVehicle(null)} title={`車両整備情報（${editVehicle ? vehicleName(editVehicle) : ""}）`}>
        <form onSubmit={saveVehicle} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-muted mb-1">車番</label>
              <input type="text" value={vForm.number} onChange={e => setVForm({ ...vForm, number: e.target.value })} className="w-full" /></div>
            <div><label className="block text-xs text-muted mb-1">種別</label>
              <input type="text" value={vForm.kind} onChange={e => setVForm({ ...vForm, kind: e.target.value })} className="w-full" /></div>
            <div><label className="block text-xs text-muted mb-1">ヘッド車番</label>
              <input type="text" value={vForm.head_number} onChange={e => setVForm({ ...vForm, head_number: e.target.value })} className="w-full" /></div>
            <div><label className="block text-xs text-muted mb-1">シャーシ車番</label>
              <input type="text" value={vForm.trailer_number} onChange={e => setVForm({ ...vForm, trailer_number: e.target.value })} className="w-full" /></div>
            <div><label className="block text-xs text-muted mb-1">積載量(kg)</label>
              <input type="number" value={vForm.payload} onChange={e => setVForm({ ...vForm, payload: e.target.value })} className="w-full" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-muted mb-1">車検満了日</label>
              <input type="date" value={vForm.shaken_date} onChange={e => setVForm({ ...vForm, shaken_date: e.target.value })} className="w-full" /></div>
            <div><label className="block text-xs text-muted mb-1">3ヶ月点検実施日</label>
              <input type="date" value={vForm.inspection_3m_date} onChange={e => setVForm({ ...vForm, inspection_3m_date: e.target.value })} className="w-full" /></div>
          </div>
          <div><label className="block text-xs text-muted mb-1">修理情報</label>
            <textarea value={vForm.repair_note} onChange={e => setVForm({ ...vForm, repair_note: e.target.value })} className="w-full h-20" placeholder="例: 7/10 ブレーキパッド交換済み" /></div>
          <div><label className="block text-xs text-muted mb-1">注意事項（配車画面に表示されます）</label>
            <textarea value={vForm.caution} onChange={e => setVForm({ ...vForm, caution: e.target.value })} className="w-full h-16" placeholder="例: 積み置き無し" /></div>
          <button type="submit" className="w-full py-2.5 bg-white text-black text-sm rounded-md hover:bg-gray-200">保存</button>
        </form>
      </Modal>

      <Modal open={!!editDriver} onClose={() => setEditDriver(null)} title="ドライバー情報">
        <form onSubmit={saveDriver} className="space-y-3">
          <div><label className="block text-xs text-muted mb-1">名前</label>
            <input type="text" value={dForm.name} onChange={e => setDForm({ ...dForm, name: e.target.value })} className="w-full" required /></div>
          <div><label className="block text-xs text-muted mb-1">連絡先</label>
            <input type="text" value={dForm.phone} onChange={e => setDForm({ ...dForm, phone: e.target.value })} className="w-full" /></div>
          <div><label className="block text-xs text-muted mb-1">状態</label>
            <select value={dForm.status} onChange={e => setDForm({ ...dForm, status: e.target.value })} className="w-full">
              <option value="稼働中">稼働中</option>
              <option value="休職中">休職中</option>
              <option value="退職">退職</option>
            </select></div>
          <button type="submit" className="w-full py-2.5 bg-white text-black text-sm rounded-md hover:bg-gray-200">保存</button>
        </form>
      </Modal>
    </div>
  );
}

export default function MaintenancePage() {
  return (
    <AuthGuard allowedRoles={["admin", "office"]}>
      <MaintenanceContent />
    </AuthGuard>
  );
}
