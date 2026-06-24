"use client";

import { useEffect, useState, useCallback } from "react";
import AuthGuard from "@/components/AuthGuard";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n);
}

interface DriverSummary {
  driver_name: string;
  payment_percentage: number;
  total_sales: number;
  payment_amount: number;
  count: number;
}

function DriverManagementContent() {
  const [summary, setSummary] = useState<Record<string, DriverSummary>>({});
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const [dateFrom, setDateFrom] = useState(
    new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]
  );
  const [dateTo, setDateTo] = useState(
    new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
    const res = await fetch(`/api/drivers/summary?${params}`);
    const data = await res.json();
    setSummary(data.summary || {});
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => { loadData(); }, [loadData]);

  const totalSales = Object.values(summary).reduce((s, d) => s + d.total_sales, 0);
  const totalPayment = Object.values(summary).reduce((s, d) => s + d.payment_amount, 0);

  if (loading) return <div className="text-muted text-sm">読み込み中...</div>;

  return (
    <div>
      <h2 className="text-xl font-light mb-6">ドライバー管理</h2>

      <div className="flex flex-wrap gap-3 mb-6">
        <div>
          <label className="block text-xs text-muted mb-1">開始日</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">終了日</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-[#111] border border-border rounded-lg p-5">
          <p className="text-xs text-muted mb-1">売上合計</p>
          <p className="text-2xl font-extralight">{formatCurrency(totalSales)}</p>
        </div>
        <div className="bg-[#111] border border-border rounded-lg p-5">
          <p className="text-xs text-muted mb-1">支払い合計</p>
          <p className="text-2xl font-extralight">{formatCurrency(totalPayment)}</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>ドライバー名</th>
              <th>配車件数</th>
              <th>売上</th>
              <th>支払い率</th>
              <th>支払い額</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(summary).length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-muted py-8">
                  データなし
                </td>
              </tr>
            ) : (
              Object.entries(summary).map(([id, d]) => (
                <tr key={id}>
                  <td>{d.driver_name}</td>
                  <td>{d.count}件</td>
                  <td>{formatCurrency(d.total_sales)}</td>
                  <td>{d.payment_percentage}%</td>
                  <td className="font-light">{formatCurrency(d.payment_amount)}</td>
                </tr>
              ))
            )}
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
