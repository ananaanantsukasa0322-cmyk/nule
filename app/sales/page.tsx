"use client";

import { useEffect, useState, useCallback } from "react";
import AuthGuard from "@/components/AuthGuard";

function formatCurrency(n: number) {
  return `¥${n.toLocaleString()}`;
}

interface Schedule {
  id: string; load_date: string; load_place: string; unload_place: string;
  weight: number; client_name?: string; driver_id?: string; done: boolean;
}
interface PriceEntry {
  client_name: string; load_place: string; unload_place: string;
  price_type: string; per_ton_rate: number | null; fixed_amount: number | null;
  vehicle_type: string | null;
}

function SalesContent() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [prices, setPrices] = useState<PriceEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1;
  const [dateFrom, setDateFrom] = useState(`${y}-${String(m).padStart(2,"0")}-01`);
  const [dateTo, setDateTo] = useState(`${y}-${String(m).padStart(2,"0")}-${new Date(y, m, 0).getDate()}`);
  const [clientFilter, setClientFilter] = useState("");
  const [issuerName, setIssuerName] = useState("サンテツ運輸株式会社");

  const loadData = useCallback(async () => {
    const [s, p] = await Promise.all([
      fetch(`/api/sales?date_from=${dateFrom}&date_to=${dateTo}`).then(r => r.json()),
      fetch("/api/masters/prices").then(r => r.json()),
    ]);
    setSchedules((s.dispatches || []) as Schedule[]);
    setPrices((p.prices || []).map((x: Record<string, unknown>) => ({
      client_name: x.client_name || '', load_place: x.load_place || '', unload_place: x.unload_place || '',
      price_type: x.price_type || 'fixed', per_ton_rate: x.per_ton_rate as number | null, fixed_amount: x.fixed_amount as number | null,
      vehicle_type: (x.vehicle_type || null) as string | null,
    })));
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => { loadData(); }, [loadData]);

  function matchPlace(pricePlace: string, schedPlace: string): boolean {
    if (!pricePlace || !schedPlace) return !pricePlace;
    if (pricePlace === schedPlace) return true;
    if (schedPlace.includes(pricePlace) || pricePlace.includes(schedPlace)) return true;
    return false;
  }

  function findPrice(s: Schedule): { rate: number; type: string } {
    const vt = (s.weight || 0) >= 15000 ? "トレーラー" : "大型";

    function matchVehicle(p: PriceEntry): boolean {
      if (!p.vehicle_type) return true;
      return p.vehicle_type === vt;
    }

    function search(matchFn: (p: PriceEntry) => boolean): PriceEntry | undefined {
      // 車両タイプ一致を優先、なければ「全て」
      return prices.find(p => matchFn(p) && p.vehicle_type === vt)
        || prices.find(p => matchFn(p) && !p.vehicle_type);
    }

    // 1. 完全一致
    let p = search(p => p.client_name === s.client_name && p.load_place === s.load_place && p.unload_place === s.unload_place);
    // 2. 部分一致
    if (!p) p = search(p => p.client_name === s.client_name && matchPlace(p.load_place, s.load_place) && matchPlace(p.unload_place, s.unload_place));
    // 3. 荷主のみ
    if (!p) p = search(p => p.client_name === s.client_name && !p.load_place && !p.unload_place);

    if (p) {
      if (p.price_type === "per_ton" && p.per_ton_rate) return { rate: p.per_ton_rate, type: "per_ton" };
      if (p.fixed_amount) return { rate: p.fixed_amount, type: "fixed" };
    }
    return { rate: 0, type: "none" };
  }

  function calcAmount(s: Schedule): number {
    const p = findPrice(s);
    if (p.type === "per_ton") return Math.round(p.rate * (s.weight || 0) / 1000);
    if (p.type === "fixed") return p.rate;
    return 0;
  }

  const clients = [...new Set(schedules.map(s => s.client_name).filter(Boolean) as string[])].sort();
  const filtered = clientFilter ? schedules.filter(s => s.client_name === clientFilter) : schedules;
  const totalAmount = filtered.reduce((sum, s) => sum + calcAmount(s), 0);

  const clientSummary = clients.map(c => {
    const cs = schedules.filter(s => s.client_name === c);
    const total = cs.reduce((sum, s) => sum + calcAmount(s), 0);
    return { name: c, count: cs.length, total };
  }).sort((a, b) => b.total - a.total);

  function generateInvoice(clientName: string) {
    const items = schedules.filter(s => s.client_name === clientName);
    if (!items.length) { alert("データがありません"); return; }

    let grandTotal = 0;
    const rows = items.map(s => {
      const p = findPrice(s);
      const amount = calcAmount(s);
      grandTotal += amount;
      const weightT = s.weight ? s.weight.toLocaleString() : "-";
      const priceStr = p.rate ? (p.type === "per_ton" ? `¥${p.rate.toLocaleString()}/t` : `¥${p.rate.toLocaleString()}`) : "-";
      return `<tr>
        <td>${s.load_date}</td><td>${s.load_place || ""}</td><td>${s.unload_place || ""}</td>
        <td style="text-align:right">${weightT}</td><td style="text-align:right">${priceStr}</td>
        <td style="text-align:right">${amount ? `¥${amount.toLocaleString()}` : "-"}</td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>請求書 - ${clientName}</title>
      <style>
        @media print { body { margin: 0; } @page { margin: 15mm; } }
        body { font-family: "Hiragino Kaku Gothic Pro", "Yu Gothic", "Meiryo", sans-serif; color: #111; padding: 20px; max-width: 800px; margin: 0 auto; }
        h1 { text-align: center; font-size: 28px; letter-spacing: 0.5em; margin-bottom: 40px; border-bottom: 3px double #333; padding-bottom: 15px; }
        .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
        .header-left { font-size: 14px; }
        .header-right { text-align: right; font-size: 13px; }
        .client-name { font-size: 18px; font-weight: bold; margin-bottom: 5px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 20px; }
        th { background: #f5f5f5; border: 1px solid #ccc; padding: 8px; text-align: left; font-weight: bold; }
        td { border: 1px solid #ccc; padding: 6px 8px; }
        .total-row { background: #f0f0f0; font-weight: bold; font-size: 14px; }
        .print-btn { position: fixed; top: 10px; right: 10px; padding: 10px 20px; background: #333; color: #fff; border: none; border-radius: 5px; cursor: pointer; font-size: 14px; }
        @media print { .print-btn { display: none; } }
      </style>
    </head><body>
      <button class="print-btn" onclick="window.print()">印刷 / PDF保存</button>
      <h1>請 求 書</h1>
      <div class="header">
        <div class="header-left">
          <div class="client-name">${clientName} 御中</div>
          <div>期間: ${dateFrom} ～ ${dateTo}</div>
        </div>
        <div class="header-right">
          <div>発行日: ${new Date().toLocaleDateString('ja-JP')}</div>
          <div style="margin-top:10px;font-weight:bold">${issuerName}</div>
        </div>
      </div>
      <table>
        <thead><tr><th>日付</th><th>積み地</th><th>下ろし先</th><th style="text-align:right">重量(kg)</th><th style="text-align:right">単価</th><th style="text-align:right">金額</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr class="total-row"><td colspan="5" style="text-align:right">合計金額</td><td style="text-align:right">¥${grandTotal.toLocaleString()}</td></tr></tfoot>
      </table>
    </body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }

  if (loading) return <div className="text-muted text-sm">読み込み中...</div>;

  return (
    <div>
      <h2 className="text-xl font-light mb-6">売上・請求管理</h2>

      <div className="flex flex-wrap gap-3 mb-6">
        <div><label className="block text-xs text-muted mb-1">開始日</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
        <div><label className="block text-xs text-muted mb-1">終了日</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
        <div><label className="block text-xs text-muted mb-1">荷主フィルター</label>
          <select value={clientFilter} onChange={e => setClientFilter(e.target.value)}>
            <option value="">全て</option>
            {clients.map(c => <option key={c} value={c}>{c}</option>)}
          </select></div>
        <div><label className="block text-xs text-muted mb-1">請求書発行者名</label>
          <select value={issuerName} onChange={e => setIssuerName(e.target.value)}>
            <option value="サンテツ運輸株式会社">サンテツ運輸株式会社</option>
            <option value="株式会社仲山商事">株式会社仲山商事</option>
          </select></div>
      </div>

      <div className="bg-[#111] border border-border rounded-lg p-5 mb-6">
        <p className="text-xs text-muted mb-1">期間内売上合計</p>
        <p className="text-3xl font-extralight">{formatCurrency(totalAmount)}</p>
      </div>

      <div className="bg-[#111] border border-border rounded-lg p-5 mb-6">
        <h3 className="text-sm font-light text-muted mb-4">荷主別集計・請求書発行</h3>
        <div className="space-y-2">
          {clientSummary.length === 0 ? <p className="text-xs text-muted">データなし</p> :
            clientSummary.map(c => (
              <div key={c.name} className="flex items-center justify-between">
                <span className="text-sm">{c.name} ({c.count}件)</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-light">{formatCurrency(c.total)}</span>
                  <button onClick={() => generateInvoice(c.name)}
                    className="text-xs px-2 py-1 bg-accent rounded hover:bg-border">PDF発行</button>
                </div>
              </div>
            ))
          }
        </div>
      </div>

      <h3 className="text-sm font-light text-muted mb-3">明細一覧</h3>
      <div className="overflow-x-auto">
        <table>
          <thead><tr><th>日付</th><th>荷主</th><th>積み地</th><th>下ろし先</th><th>重量(kg)</th><th>単価</th><th>金額</th></tr></thead>
          <tbody>
            {filtered.map(s => {
              const p = findPrice(s);
              const amount = calcAmount(s);
              return (
                <tr key={s.id}>
                  <td className="text-sm">{s.load_date}</td>
                  <td className="text-sm">{s.client_name || "—"}</td>
                  <td className="text-sm">{s.load_place}</td>
                  <td className="text-sm">{s.unload_place}</td>
                  <td className="text-sm">{s.weight ? `${s.weight.toLocaleString()}kg` : "—"}</td>
                  <td className="text-sm text-muted">{p.rate ? (p.type === "per_ton" ? `¥${p.rate}/t` : formatCurrency(p.rate)) : "—"}</td>
                  <td className="text-sm font-medium">{amount ? formatCurrency(amount) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SalesPage() {
  return (
    <AuthGuard allowedRoles={["admin", "office"]}>
      <SalesContent />
    </AuthGuard>
  );
}
