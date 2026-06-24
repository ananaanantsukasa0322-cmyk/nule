"use client";

import { useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";

interface DashboardData {
  total_sales: number;
  client_ranking: { id: string; name: string; total: number }[];
  driver_sales: { id: string; name: string; total: number }[];
  pending_reports_count: number;
  total_dispatches: number;
  total_drivers: number;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n);
}

function DashboardContent() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-muted text-sm">読み込み中...</div>;
  }

  if (!data) {
    return <div className="text-muted text-sm">データの取得に失敗しました</div>;
  }

  return (
    <div>
      <h2 className="text-xl font-light mb-8">ダッシュボード</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="今月の売上総額" value={formatCurrency(data.total_sales)} />
        <StatCard label="配車件数" value={`${data.total_dispatches}件`} />
        <StatCard label="稼働ドライバー数" value={`${data.total_drivers}名`} />
        <StatCard
          label="未処理日報"
          value={`${data.pending_reports_count}件`}
          highlight={data.pending_reports_count > 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#111] border border-border rounded-lg p-5">
          <h3 className="text-sm font-light text-muted mb-4">荷主別売上ランキング</h3>
          {data.client_ranking.length === 0 ? (
            <p className="text-xs text-muted">データなし</p>
          ) : (
            <div className="space-y-3">
              {data.client_ranking.slice(0, 10).map((c, i) => (
                <div key={c.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted w-5">{i + 1}.</span>
                    <span className="text-sm">{c.name}</span>
                  </div>
                  <span className="text-sm font-light">{formatCurrency(c.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#111] border border-border rounded-lg p-5">
          <h3 className="text-sm font-light text-muted mb-4">ドライバー別売上一覧</h3>
          {data.driver_sales.length === 0 ? (
            <p className="text-xs text-muted">データなし</p>
          ) : (
            <div className="space-y-3">
              {data.driver_sales.map((d) => (
                <div key={d.id} className="flex items-center justify-between">
                  <span className="text-sm">{d.name}</span>
                  <span className="text-sm font-light">{formatCurrency(d.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-[#111] border border-border rounded-lg p-5">
      <p className="text-xs text-muted mb-2 font-light">{label}</p>
      <p className={`text-2xl font-extralight ${highlight ? "text-warning" : ""}`}>
        {value}
      </p>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard requiredRole="admin">
      <DashboardContent />
    </AuthGuard>
  );
}
