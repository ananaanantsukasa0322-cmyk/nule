"use client";

import { useEffect, useState, useCallback } from "react";
import AuthGuard from "@/components/AuthGuard";
import Modal from "@/components/Modal";

interface Vehicle { id: string; kind: string; number: string; head_number: string; trailer_number: string; payload: number; note: string; }
interface Driver { id: string; name: string; phone: string; status: string; haisha_visible: boolean; display_order: number; payment_percentage: number; default_vehicle_id: string | null; }
interface Place { id: string; name: string; caution: string | null; place_type: string; }
interface Schedule {
  id: string; load_date: string; load_place: string; unload_date: string; unload_place: string;
  weight: number; vehicle_id: string | null; driver_id: string | null;
  note: string; done: boolean; load_status: string; cargo_type: string; cargo_items: unknown;
  driver?: Driver; vehicle?: Vehicle;
}

type Tab = "calendar" | "schedules" | "vehicles" | "drivers" | "places" | "haisha";

function DispatchManager() {
  const [tab, setTab] = useState<Tab>("calendar");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    const [v, d, p, s] = await Promise.all([
      fetch("/api/vehicles").then(r => r.json()).catch(() => []),
      fetch("/api/masters/drivers").then(r => r.json()).then(d => d.drivers || []).catch(() => []),
      fetch("/api/places").then(r => r.json()).catch(() => []),
      fetch("/api/schedules").then(r => r.json()).catch(() => []),
    ]);
    setVehicles(Array.isArray(v) ? v : []);
    setDrivers(Array.isArray(d) ? d : []);
    setPlaces(Array.isArray(p) ? p : []);
    setSchedules(Array.isArray(s) ? s : []);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "calendar", label: "カレンダー", icon: "📊" },
    { key: "schedules", label: "配車スケジュール", icon: "📅" },
    { key: "vehicles", label: "車両管理", icon: "🚛" },
    { key: "drivers", label: "ドライバー", icon: "👤" },
    { key: "places", label: "場所・注意", icon: "📍" },
    { key: "haisha", label: "配車予定表", icon: "📋" },
  ];

  if (loading) return <div className="text-muted text-sm">読み込み中...</div>;

  return (
    <div>
      <div className="flex gap-1 mb-6 overflow-x-auto pb-2 border-b border-border">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap rounded-t transition-colors ${
              tab === t.key ? "bg-accent text-white border-b-2 border-white" : "text-muted hover:text-white"
            }`}
          >
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {tab === "calendar" && <CalendarView schedules={schedules} drivers={drivers} />}
      {tab === "schedules" && <SchedulesView schedules={schedules} drivers={drivers} vehicles={vehicles} places={places} reload={loadAll} />}
      {tab === "vehicles" && <VehiclesView vehicles={vehicles} reload={loadAll} />}
      {tab === "drivers" && <DriversView drivers={drivers} reload={loadAll} />}
      {tab === "places" && <PlacesView places={places} schedules={schedules} reload={loadAll} />}
      {tab === "haisha" && <HaishaView schedules={schedules} drivers={drivers} vehicles={vehicles} reload={loadAll} />}
    </div>
  );
}

// ===== カレンダービュー =====
function CalendarView({ schedules, drivers }: { schedules: Schedule[]; drivers: Driver[] }) {
  const [weekOffset, setWeekOffset] = useState(0);

  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + 1 + weekOffset * 7);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  const dayNames = ["月", "火", "水", "木", "金", "土", "日"];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-light">週間カレンダー</h2>
        <div className="flex gap-2">
          <button onClick={() => setWeekOffset(w => w - 1)} className="px-3 py-1 text-xs bg-accent rounded hover:bg-border">◀ 前週</button>
          <button onClick={() => setWeekOffset(0)} className="px-3 py-1 text-xs bg-accent rounded hover:bg-border">今週</button>
          <button onClick={() => setWeekOffset(w => w + 1)} className="px-3 py-1 text-xs bg-accent rounded hover:bg-border">次週 ▶</button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map((day, i) => {
          const dateStr = day.toISOString().split("T")[0];
          const isToday = dateStr === today.toISOString().split("T")[0];
          const daySchedules = schedules.filter(s => s.load_date === dateStr && !s.done);

          return (
            <div key={i} className={`bg-[#111] border rounded-lg p-3 min-h-[140px] ${isToday ? "border-white" : "border-border"}`}>
              <div className="flex justify-between items-center mb-2">
                <span className={`text-xs font-light ${i >= 5 ? "text-muted" : ""}`}>{dayNames[i]}</span>
                <span className={`text-sm ${isToday ? "text-white font-medium" : "text-muted"}`}>
                  {day.getMonth() + 1}/{day.getDate()}
                </span>
              </div>
              <div className="space-y-1">
                {daySchedules.slice(0, 5).map(s => {
                  const driver = drivers.find(d => d.id === s.driver_id);
                  return (
                    <div key={s.id} className="text-xs bg-accent/50 rounded px-1.5 py-0.5 truncate">
                      <span className="text-muted">{driver?.name?.split(/\s+/)[0] || "未割当"}</span>
                      <span className="mx-1">→</span>
                      <span>{s.unload_place || "?"}</span>
                    </div>
                  );
                })}
                {daySchedules.length > 5 && <div className="text-xs text-muted">+{daySchedules.length - 5}件</div>}
                {daySchedules.length === 0 && <div className="text-xs text-muted/40">なし</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===== スケジュール管理 =====
function SchedulesView({ schedules, drivers, vehicles, places, reload }: {
  schedules: Schedule[]; drivers: Driver[]; vehicles: Vehicle[]; places: Place[]; reload: () => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [form, setForm] = useState({
    load_date: new Date().toISOString().split("T")[0],
    load_place: "", unload_date: "", unload_place: "",
    weight: "", note: "", vehicle_id: "", driver_id: "", cargo_type: "",
  });

  const filtered = schedules.filter(s => {
    if (filterDate && s.load_date !== filterDate) return false;
    return showDone ? s.done : !s.done;
  });

  const loadPlaces = [...new Set([...places.filter(p => p.place_type === "load").map(p => p.name), ...schedules.map(s => s.load_place).filter(Boolean)])];
  const unloadPlaces = [...new Set([...places.filter(p => p.place_type === "unload").map(p => p.name), ...schedules.map(s => s.unload_place).filter(Boolean)])];

  function resetForm() {
    setForm({ load_date: new Date().toISOString().split("T")[0], load_place: "", unload_date: "", unload_place: "", weight: "", note: "", vehicle_id: "", driver_id: "", cargo_type: "" });
    setEditId(null);
  }

  function openEdit(s: Schedule) {
    setForm({
      load_date: s.load_date || "", load_place: s.load_place || "",
      unload_date: s.unload_date || "", unload_place: s.unload_place || "",
      weight: s.weight?.toString() || "", note: s.note || "",
      vehicle_id: s.vehicle_id || "", driver_id: s.driver_id || "",
      cargo_type: s.cargo_type || "",
    });
    setEditId(s.id);
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const body = { ...form, weight: Number(form.weight) || 0, vehicle_id: form.vehicle_id || null, driver_id: form.driver_id || null };
    const method = editId ? "PUT" : "POST";
    const payload = editId ? { ...body, id: editId } : body;
    await fetch("/api/schedules", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setShowModal(false);
    resetForm();
    reload();
  }

  async function handleDelete(id: string) {
    if (!confirm("削除しますか？")) return;
    await fetch("/api/schedules", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    reload();
  }

  async function toggleDone(s: Schedule) {
    await fetch("/api/schedules", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, done: !s.done, load_status: !s.done ? "delivered" : "none" }),
    });
    reload();
  }

  async function cycleStatus(s: Schedule) {
    const next = s.load_status === "none" ? "loaded" : s.load_status === "loaded" ? "delivered" : "none";
    await fetch("/api/schedules", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, load_status: next, done: next === "delivered" }),
    });
    reload();
  }

  const statusLabel = (s: string) => s === "delivered" ? "配達済" : s === "loaded" ? "積込済" : "未着手";
  const statusColor = (s: string) => s === "delivered" ? "bg-success/20 text-success" : s === "loaded" ? "bg-blue-500/20 text-blue-400" : "bg-muted/20 text-muted";

  const caution = places.find(p => p.name === form.unload_place && p.caution);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-light">配車スケジュール</h2>
        <button onClick={() => { resetForm(); setShowModal(true); }} className="px-4 py-2 bg-white text-black text-sm rounded-md hover:bg-gray-200">+ 配車追加</button>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="text-sm" />
        <button onClick={() => setFilterDate("")} className="text-xs text-muted hover:text-white">クリア</button>
        <button onClick={() => setFilterDate(new Date().toISOString().split("T")[0])} className="text-xs text-muted hover:text-white">今日</button>
        <button onClick={() => setShowDone(!showDone)} className={`text-xs px-2 py-1 rounded ${showDone ? "bg-success/20 text-success" : "bg-accent text-muted"}`}>
          {showDone ? "✅ 完了済み" : "未完了"}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>状態</th><th>積込日</th><th>積込場所</th><th>下ろし日</th><th>下ろし場所</th>
              <th>重量</th><th>車両</th><th>ドライバー</th><th>メモ</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} className="text-center text-muted py-8">データなし</td></tr>
            ) : filtered.map(s => (
              <tr key={s.id} className={s.done ? "opacity-50" : ""}>
                <td>
                  <button onClick={() => cycleStatus(s)} className={`text-xs px-2 py-0.5 rounded cursor-pointer ${statusColor(s.load_status)}`}>
                    {statusLabel(s.load_status)}
                  </button>
                </td>
                <td className="text-sm">{s.load_date}</td>
                <td className="text-sm">{s.load_place}</td>
                <td className="text-sm">{s.unload_date}</td>
                <td className="text-sm">{s.unload_place}</td>
                <td className="text-sm">{s.weight ? `${(s.weight / 1000).toFixed(1)}t` : "—"}</td>
                <td className="text-sm text-muted">
                  {s.vehicle ? (s.vehicle.kind === "トレーラー" ? s.vehicle.head_number : s.vehicle.number) : "—"}
                </td>
                <td className="text-sm">{s.driver?.name || "—"}</td>
                <td className="text-xs text-muted max-w-[100px] truncate">{s.note || ""}</td>
                <td>
                  <div className="flex gap-2">
                    <button onClick={() => toggleDone(s)} className={`text-xs ${s.done ? "text-success" : "text-muted hover:text-success"}`}>
                      {s.done ? "✅" : "☐"}
                    </button>
                    <button onClick={() => openEdit(s)} className="text-xs text-muted hover:text-white">編集</button>
                    <button onClick={() => handleDelete(s.id)} className="text-xs text-muted hover:text-danger">削除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editId ? "配車編集" : "配車追加"}>
        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-muted mb-1">積込日</label>
              <input type="date" value={form.load_date} onChange={e => setForm({ ...form, load_date: e.target.value })} className="w-full" />
            </div>
            <div><label className="block text-xs text-muted mb-1">積込場所</label>
              <input type="text" list="dl-load" value={form.load_place} onChange={e => setForm({ ...form, load_place: e.target.value })} className="w-full" />
              <datalist id="dl-load">{loadPlaces.map(p => <option key={p} value={p} />)}</datalist>
            </div>
            <div><label className="block text-xs text-muted mb-1">下ろし日</label>
              <input type="date" value={form.unload_date} onChange={e => setForm({ ...form, unload_date: e.target.value })} className="w-full" />
            </div>
            <div><label className="block text-xs text-muted mb-1">下ろし場所</label>
              <input type="text" list="dl-unload" value={form.unload_place} onChange={e => setForm({ ...form, unload_place: e.target.value })} className="w-full" />
              <datalist id="dl-unload">{unloadPlaces.map(p => <option key={p} value={p} />)}</datalist>
            </div>
          </div>
          {caution && (
            <div className="bg-warning/10 border border-warning/30 rounded p-3 text-sm">
              <span className="text-warning text-xs font-medium">⚠️ 注意事項:</span>
              <p className="text-xs mt-1 whitespace-pre-wrap">{caution.caution}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-muted mb-1">重量 (kg)</label>
              <input type="number" value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })} className="w-full" />
            </div>
            <div><label className="block text-xs text-muted mb-1">荷物の種類</label>
              <input type="text" value={form.cargo_type} onChange={e => setForm({ ...form, cargo_type: e.target.value })} className="w-full" placeholder="コイル等" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-muted mb-1">車両</label>
              <select value={form.vehicle_id} onChange={e => setForm({ ...form, vehicle_id: e.target.value })} className="w-full">
                <option value="">-- 選択 --</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.kind === "トレーラー" ? v.head_number : v.number} ({(v.payload / 1000).toFixed(1)}t)</option>)}
              </select>
            </div>
            <div><label className="block text-xs text-muted mb-1">ドライバー</label>
              <select value={form.driver_id} onChange={e => setForm({ ...form, driver_id: e.target.value })} className="w-full">
                <option value="">-- 選択 --</option>
                {drivers.filter(d => d.status === "稼働中" || d.id === form.driver_id).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <div><label className="block text-xs text-muted mb-1">メモ</label>
            <input type="text" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="w-full" />
          </div>
          <button type="submit" className="w-full py-2.5 bg-white text-black text-sm rounded-md hover:bg-gray-200 mt-4">
            {editId ? "更新" : "登録"}
          </button>
        </form>
      </Modal>
    </div>
  );
}

// ===== 車両管理 =====
function VehiclesView({ vehicles, reload }: { vehicles: Vehicle[]; reload: () => void }) {
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ kind: "トラック", number: "", head_number: "", trailer_number: "", payload: "", note: "" });

  function resetForm() { setForm({ kind: "トラック", number: "", head_number: "", trailer_number: "", payload: "", note: "" }); setEditId(null); }

  function openEdit(v: Vehicle) {
    setForm({ kind: v.kind, number: v.number || "", head_number: v.head_number || "", trailer_number: v.trailer_number || "", payload: v.payload?.toString() || "", note: v.note || "" });
    setEditId(v.id); setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const body = { ...form, payload: Number(form.payload) || 0 };
    const method = editId ? "PUT" : "POST";
    const payload = editId ? { ...body, id: editId } : body;
    await fetch("/api/vehicles", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setShowModal(false); resetForm(); reload();
  }

  async function handleDelete(id: string) {
    if (!confirm("削除しますか？")) return;
    await fetch("/api/vehicles", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    reload();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-light">車両管理</h2>
        <button onClick={() => { resetForm(); setShowModal(true); }} className="px-4 py-2 bg-white text-black text-sm rounded-md hover:bg-gray-200">+ 車両追加</button>
      </div>
      <div className="overflow-x-auto">
        <table>
          <thead><tr><th>種別</th><th>ナンバー</th><th>台車</th><th>最大積載量</th><th>メモ</th><th></th></tr></thead>
          <tbody>
            {vehicles.length === 0 ? <tr><td colSpan={6} className="text-center text-muted py-8">データなし</td></tr> :
              vehicles.map(v => (
                <tr key={v.id}>
                  <td><span className="text-xs px-2 py-0.5 rounded bg-accent">{v.kind}</span></td>
                  <td className="text-sm">{v.kind === "トレーラー" ? v.head_number : v.number}</td>
                  <td className="text-sm text-muted">{v.kind === "トレーラー" ? v.trailer_number : "—"}</td>
                  <td className="text-sm">{(v.payload / 1000).toFixed(1)}t</td>
                  <td className="text-xs text-muted">{v.note || ""}</td>
                  <td>
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(v)} className="text-xs text-muted hover:text-white">編集</button>
                      <button onClick={() => handleDelete(v.id)} className="text-xs text-muted hover:text-danger">削除</button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editId ? "車両編集" : "車両追加"}>
        <form onSubmit={handleSave} className="space-y-3">
          <div><label className="block text-xs text-muted mb-1">種別</label>
            <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })} className="w-full">
              <option value="トラック">トラック</option><option value="トレーラー">トレーラー</option>
            </select>
          </div>
          {form.kind === "トラック" ? (
            <div><label className="block text-xs text-muted mb-1">ナンバー</label>
              <input type="text" value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} className="w-full" /></div>
          ) : (<>
            <div><label className="block text-xs text-muted mb-1">ヘッドナンバー</label>
              <input type="text" value={form.head_number} onChange={e => setForm({ ...form, head_number: e.target.value })} className="w-full" /></div>
            <div><label className="block text-xs text-muted mb-1">台車ナンバー</label>
              <input type="text" value={form.trailer_number} onChange={e => setForm({ ...form, trailer_number: e.target.value })} className="w-full" /></div>
          </>)}
          <div><label className="block text-xs text-muted mb-1">最大積載量 (kg)</label>
            <input type="number" value={form.payload} onChange={e => setForm({ ...form, payload: e.target.value })} className="w-full" /></div>
          <div><label className="block text-xs text-muted mb-1">メモ</label>
            <input type="text" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="w-full" /></div>
          <button type="submit" className="w-full py-2.5 bg-white text-black text-sm rounded-md hover:bg-gray-200 mt-4">{editId ? "更新" : "登録"}</button>
        </form>
      </Modal>
    </div>
  );
}

// ===== ドライバー管理 =====
function DriversView({ drivers, reload }: { drivers: Driver[]; reload: () => void }) {
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", status: "稼働中", payment_percentage: "0", haisha_visible: true });

  function resetForm() { setForm({ name: "", phone: "", status: "稼働中", payment_percentage: "0", haisha_visible: true }); setEditId(null); }

  function openEdit(d: Driver) {
    setForm({ name: d.name, phone: d.phone || "", status: d.status || "稼働中", payment_percentage: d.payment_percentage?.toString() || "0", haisha_visible: d.haisha_visible !== false });
    setEditId(d.id); setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const body = { ...form, payment_percentage: Number(form.payment_percentage) || 0 };
    const method = editId ? "PUT" : "POST";
    const payload = editId ? { ...body, id: editId } : body;
    await fetch("/api/masters/drivers", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setShowModal(false); resetForm(); reload();
  }

  async function handleDelete(id: string) {
    if (!confirm("削除しますか？")) return;
    await fetch("/api/masters/drivers", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    reload();
  }

  const statusColor = (s: string) => s === "稼働中" ? "text-success" : s === "休暇中" ? "text-warning" : "text-danger";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-light">ドライバー管理</h2>
        <button onClick={() => { resetForm(); setShowModal(true); }} className="px-4 py-2 bg-white text-black text-sm rounded-md hover:bg-gray-200">+ ドライバー追加</button>
      </div>
      <div className="overflow-x-auto">
        <table>
          <thead><tr><th>氏名</th><th>連絡先</th><th>稼働状況</th><th>配車表示</th><th>支払率</th><th></th></tr></thead>
          <tbody>
            {drivers.length === 0 ? <tr><td colSpan={6} className="text-center text-muted py-8">データなし</td></tr> :
              drivers.map(d => (
                <tr key={d.id}>
                  <td className="text-sm font-medium">{d.name}</td>
                  <td className="text-sm text-muted">{d.phone || "—"}</td>
                  <td><span className={`text-xs ${statusColor(d.status)}`}>{d.status || "稼働中"}</span></td>
                  <td className="text-xs text-muted">{d.haisha_visible !== false ? "表示" : "非表示"}</td>
                  <td className="text-sm text-muted">{d.payment_percentage}%</td>
                  <td>
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(d)} className="text-xs text-muted hover:text-white">編集</button>
                      <button onClick={() => handleDelete(d.id)} className="text-xs text-muted hover:text-danger">削除</button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editId ? "ドライバー編集" : "ドライバー追加"}>
        <form onSubmit={handleSave} className="space-y-3">
          <div><label className="block text-xs text-muted mb-1">氏名</label>
            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full" required /></div>
          <div><label className="block text-xs text-muted mb-1">連絡先</label>
            <input type="text" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-muted mb-1">稼働状況</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full">
                <option value="稼働中">稼働中</option><option value="休暇中">休暇中</option><option value="退職">退職</option>
              </select>
            </div>
            <div><label className="block text-xs text-muted mb-1">支払率 (%)</label>
              <input type="number" value={form.payment_percentage} onChange={e => setForm({ ...form, payment_percentage: e.target.value })} className="w-full" /></div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={form.haisha_visible} onChange={e => setForm({ ...form, haisha_visible: e.target.checked })} />
            <label className="text-xs text-muted">配車予定表に表示</label>
          </div>
          <button type="submit" className="w-full py-2.5 bg-white text-black text-sm rounded-md hover:bg-gray-200 mt-4">{editId ? "更新" : "登録"}</button>
        </form>
      </Modal>
    </div>
  );
}

// ===== 場所・注意事項 =====
function PlacesView({ places, schedules, reload }: { places: Place[]; schedules: Schedule[]; reload: () => void }) {
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", caution: "", place_type: "unload" });

  function resetForm() { setForm({ name: "", caution: "", place_type: "unload" }); setEditId(null); }

  function openEdit(p: Place) {
    setForm({ name: p.name, caution: p.caution || "", place_type: p.place_type }); setEditId(p.id); setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const method = editId ? "PUT" : "POST";
    const payload = editId ? { ...form, id: editId } : form;
    await fetch("/api/places", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setShowModal(false); resetForm(); reload();
  }

  async function handleDelete(id: string) {
    if (!confirm("削除しますか？")) return;
    await fetch("/api/places", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    reload();
  }

  const loadPlaces = places.filter(p => p.place_type === "load");
  const unloadPlaces = places.filter(p => p.place_type === "unload");
  const registeredNames = new Set(places.map(p => p.name));
  const schedPlaces = [...new Set([...schedules.map(s => s.unload_place), ...schedules.map(s => s.load_place)].filter(p => p && !registeredNames.has(p)))];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-light">場所・注意事項</h2>
        <button onClick={() => { resetForm(); setShowModal(true); }} className="px-4 py-2 bg-white text-black text-sm rounded-md hover:bg-gray-200">+ 場所追加</button>
      </div>

      <div className="bg-[#111] border border-border rounded-lg p-4 mb-4">
        <h3 className="text-sm text-muted mb-3">積み地</h3>
        <div className="flex flex-wrap gap-2">
          {loadPlaces.length === 0 ? <span className="text-xs text-muted">なし</span> :
            loadPlaces.map(p => (
              <button key={p.id} onClick={() => openEdit(p)} className="text-xs bg-accent px-2 py-1 rounded hover:bg-border">{p.name}</button>
            ))}
        </div>
      </div>

      <div className="bg-[#111] border border-border rounded-lg p-4 mb-4">
        <h3 className="text-sm text-muted mb-3">下ろし先（注意事項あり）</h3>
        <table>
          <thead><tr><th>場所名</th><th>注意事項</th><th></th></tr></thead>
          <tbody>
            {unloadPlaces.length === 0 ? <tr><td colSpan={3} className="text-center text-muted py-4">なし</td></tr> :
              unloadPlaces.map(p => (
                <tr key={p.id}>
                  <td className="text-sm">{p.name}</td>
                  <td className="text-xs text-warning whitespace-pre-wrap">{p.caution || "—"}</td>
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

      {schedPlaces.length > 0 && (
        <div className="bg-[#111] border border-border rounded-lg p-4">
          <h3 className="text-sm text-muted mb-3">スケジュール登録済み（注意事項なし）</h3>
          <div className="flex flex-wrap gap-2">
            {schedPlaces.map(name => (
              <button key={name} onClick={() => { setForm({ name, caution: "", place_type: "unload" }); setShowModal(true); }}
                className="text-xs bg-accent/50 px-2 py-1 rounded hover:bg-accent cursor-pointer">{name}</button>
            ))}
          </div>
        </div>
      )}

      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editId ? "場所編集" : "場所追加"}>
        <form onSubmit={handleSave} className="space-y-3">
          <div><label className="block text-xs text-muted mb-1">場所名</label>
            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full" required readOnly={!!editId} /></div>
          <div><label className="block text-xs text-muted mb-1">種別</label>
            <select value={form.place_type} onChange={e => setForm({ ...form, place_type: e.target.value })} className="w-full">
              <option value="load">積み地</option><option value="unload">下ろし先</option>
            </select></div>
          <div><label className="block text-xs text-muted mb-1">注意事項</label>
            <textarea value={form.caution} onChange={e => setForm({ ...form, caution: e.target.value })} className="w-full h-24 resize-y" placeholder="例: 8時以降入場不可" /></div>
          <button type="submit" className="w-full py-2.5 bg-white text-black text-sm rounded-md hover:bg-gray-200 mt-4">{editId ? "更新" : "登録"}</button>
        </form>
      </Modal>
    </div>
  );
}

// ===== 配車予定表 =====
function HaishaView({ schedules, drivers, vehicles, reload }: {
  schedules: Schedule[]; drivers: Driver[]; vehicles: Vehicle[]; reload: () => void;
}) {
  const [haishaDate, setHaishaDate] = useState(new Date().toISOString().split("T")[0]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [dragId, setDragId] = useState<string | null>(null);

  const visibleDrivers = drivers.filter(d => d.haisha_visible !== false && d.status === "稼働中");
  const daySchedules = schedules.filter(s => s.load_date === haishaDate && !s.done);
  const assignedIds = new Set(Object.values(assignments).flat());
  const unassigned = daySchedules.filter(s => !assignedIds.has(s.id));

  useEffect(() => {
    const map: Record<string, string[]> = {};
    for (const s of daySchedules) {
      if (s.driver_id) {
        if (!map[s.driver_id]) map[s.driver_id] = [];
        map[s.driver_id].push(s.id);
      }
    }
    setAssignments(map);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [haishaDate, schedules]);

  function handleDrop(driverId: string, e: React.DragEvent) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.remove("outline-dashed", "outline-white");
    if (!dragId) return;
    setAssignments(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next)) { next[key] = next[key].filter(id => id !== dragId); }
      if (!next[driverId]) next[driverId] = [];
      next[driverId].push(dragId);
      return next;
    });
    setDragId(null);
  }

  function handleDropToPool(e: React.DragEvent) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.remove("outline-dashed", "outline-white");
    if (!dragId) return;
    setAssignments(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next)) { next[key] = next[key].filter(id => id !== dragId); }
      return next;
    });
    setDragId(null);
  }

  async function autoAssign() {
    const map: Record<string, string[]> = {};
    const sorted = [...unassigned, ...daySchedules.filter(s => assignedIds.has(s.id))];
    let dIdx = 0;
    for (const s of sorted) {
      if (visibleDrivers.length === 0) break;
      const d = visibleDrivers[dIdx % visibleDrivers.length];
      if (!map[d.id]) map[d.id] = [];
      map[d.id].push(s.id);
      dIdx++;
    }
    setAssignments(map);
  }

  async function saveAssignments() {
    for (const [driverId, schedIds] of Object.entries(assignments)) {
      for (const sid of schedIds) {
        await fetch("/api/schedules", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: sid, driver_id: driverId }),
        });
      }
    }
    for (const s of unassigned) {
      await fetch("/api/schedules", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: s.id, driver_id: null }),
      });
    }
    await fetch("/api/dispatch-plans", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_date: haishaDate, plan_data: assignments }),
    });
    alert("保存しました");
    reload();
  }

  function dragOver(e: React.DragEvent) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.add("outline-dashed", "outline-white");
  }
  function dragLeave(e: React.DragEvent) {
    (e.currentTarget as HTMLElement).classList.remove("outline-dashed", "outline-white");
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-light">配車予定表</h2>
        <div className="flex items-center gap-3">
          <input type="date" value={haishaDate} onChange={e => setHaishaDate(e.target.value)} />
          <button onClick={autoAssign} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">⚡ 自動振り分け</button>
          <button onClick={saveAssignments} className="px-3 py-1.5 bg-success text-white text-xs rounded hover:bg-green-600">💾 保存</button>
        </div>
      </div>

      {unassigned.length > 0 && (
        <div className="bg-[#111] border border-warning/30 rounded-lg p-4 mb-4"
          onDragOver={dragOver} onDragLeave={dragLeave} onDrop={handleDropToPool}>
          <h3 className="text-sm text-warning mb-2">⚠️ 未割当 ({unassigned.length}件)</h3>
          <div className="flex flex-wrap gap-2">
            {unassigned.map(s => (
              <div key={s.id} draggable onDragStart={() => setDragId(s.id)}
                className="bg-accent border border-border rounded px-2 py-1 text-xs cursor-grab active:cursor-grabbing">
                {s.load_place}→{s.unload_place} <span className="text-muted">{s.weight ? `${(s.weight/1000).toFixed(1)}t` : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr><th>運転手</th><th>配達①</th><th>配達②</th><th>配達③</th><th>配達④</th><th>配達⑤</th></tr>
          </thead>
          <tbody>
            {visibleDrivers.length === 0 ? <tr><td colSpan={6} className="text-center text-muted py-8">表示ドライバーなし</td></tr> :
              visibleDrivers.map(d => {
                const driverScheds = (assignments[d.id] || []).map(sid => daySchedules.find(s => s.id === sid)).filter(Boolean) as Schedule[];
                const slots = Array.from({ length: 5 }, (_, i) => driverScheds[i] || null);
                return (
                  <tr key={d.id}>
                    <td className="text-sm font-medium whitespace-nowrap">{d.name}</td>
                    {slots.map((s, i) => (
                      <td key={i} className="min-w-[120px] p-1" onDragOver={dragOver} onDragLeave={dragLeave} onDrop={e => handleDrop(d.id, e)}>
                        {s ? (
                          <div draggable onDragStart={() => setDragId(s.id)}
                            className="bg-blue-500/20 border border-blue-500/30 rounded px-2 py-1.5 text-xs cursor-grab active:cursor-grabbing">
                            <div className="font-medium">{s.unload_place}</div>
                            <div className="text-muted text-[10px]">{s.load_place} {s.weight ? `${(s.weight/1000).toFixed(1)}t` : ""}</div>
                          </div>
                        ) : (
                          <div className="h-10 border border-dashed border-border/50 rounded flex items-center justify-center text-muted/30 text-xs">
                            ドロップ
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DispatchPage() {
  return (
    <AuthGuard>
      <DispatchManager />
    </AuthGuard>
  );
}
