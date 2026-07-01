"use client";

import { useEffect, useState, useCallback } from "react";
import AuthGuard from "@/components/AuthGuard";

function formatCurrency(n: number) {
  return `¥${n.toLocaleString()}`;
}

interface DriverSummary {
  driver_name: string;
  payment_percentage: number;
  total_sales: number;
  payment_amount: number;
  count: number;
  is_yousha?: boolean;
}

function DriverManagementContent() {
  const [summary, setSummary] = useState<Record<string, DriverSummary>>({});
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1;
  const [dateFrom, setDateFrom] = useState(`${y}-${String(m).padStart(2,"0")}-01`);
  const [dateTo, setDateTo] = useState(`${y}-${String(m).padStart(2,"0")}-${new Date(y, m, 0).getDate()}`);

  const loadData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
    const res = await fetch(`/api/drivers/summary?${params}`);
    const data = await res.json();
    setSummary(data.summary || {});
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => { loadData(); }, [loadData]);

  async function updatePaymentRate(driverId: string, rate: string) {
    const pct = Number(rate);
    if (isNaN(pct)) return;
    if (driverId.startsWith("y_")) {
      const yid = driverId.slice(2);
      await fetch(`/api/youshas/${yid}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_rate: pct }),
      });
    } else {
      await fetch(`/api/masters/drivers`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: driverId, payment_percentage: pct }),
      });
    }
    loadData();
  }

  const entries = Object.entries(summary).sort((a, b) => b[1].count - a[1].count);
  const totalCount = entries.reduce((s, [, d]) => s + d.count, 0);
  const totalSales = entries.reduce((s, [, d]) => s + d.total_sales, 0);
  const totalPayment = entries.reduce((s, [, d]) => s + d.payment_amount, 0);

  if (loading) return <div className="text-muted text-sm">読み込み中...</div>;

  return (
    <div>
      <h2 className="text-xl font-light mb-6">ドライバー支払い</h2>

      <div className="flex flex-wrap gap-3 mb-6">
        <div><label className="block text-xs text-muted mb-1">開始日</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
        <div><label className="block text-xs text-muted mb-1">終了日</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-[#111] border border-border rounded-lg p-5">
          <p className="text-xs text-muted mb-1">期間内配車件数</p>
          <p className="text-2xl font-extralight">{totalCount}件</p>
        </div>
        <div className="bg-[#111] border border-border rounded-lg p-5">
          <p className="text-xs text-muted mb-1">期間内売上合計</p>
          <p className="text-2xl font-extralight">{formatCurrency(totalSales)}</p>
        </div>
        <div className="bg-[#111] border border-border rounded-lg p-5">
          <p className="text-xs text-muted mb-1">支払合計</p>
          <p className="text-2xl font-extralight">{formatCurrency(totalPayment)}</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table>
          <thead><tr><th>ドライバー名</th><th>種別</th><th>配車件数</th><th>売上</th><th>支払い率</th><th>支払金額</th></tr></thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={6} className="text-center text-muted py-8">データなし</td></tr>
            ) : entries.map(([id, d]) => (
              <tr key={id}>
                <td className="text-sm font-medium">{d.driver_name}</td>
                <td className="text-xs text-muted">{id.startsWith("y_") ? "傭車" : "自社"}</td>
                <td className="text-sm">{d.count}件</td>
                <td className="text-sm">{d.total_sales ? formatCurrency(d.total_sales) : <span className="text-muted">—</span>}</td>
                <td>
                  <div className="flex items-center gap-1">
                    <input type="number" step="0.1" min="0" max="100"
                      defaultValue={d.payment_percentage}
                      className="bg-transparent border-b border-border text-sm w-16 outline-none focus:border-white text-right"
                      onBlur={e => updatePaymentRate(id, e.target.value)} />
                    <span className="text-xs text-muted">%</span>
                  </div>
                </td>
                <td className="text-sm font-medium">{d.payment_amount ? formatCurrency(d.payment_amount) : <span className="text-muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DriverManagementPage() {
  return (
    <AuthGuard allowedRoles={["admin", "office"]}>
      <DriverManagementContent />
    </AuthGuard>
  );
}
