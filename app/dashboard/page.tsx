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
  recent_schedules: { id: string; load_date: string; load_place: string; unload_place: string; client_name: string; driver_name: string; weight: number }[];
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

  if (loading) return <div className="text-muted text-sm">読み込み中...</div>;
  if (!data) return <div className="text-muted text-sm">データの取得に失敗しました</div>;

  const now = new Date();
  const monthLabel = `${now.getFullYear()}年${now.getMonth() + 1}月`;
  const maxDriver = Math.max(...data.driver_sales.map(d => d.total), 1);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-extralight tracking-wide">ダッシュボード</h2>
          <p className="text-xs text-muted mt-1">{monthLabel}の概況</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">最終更新</p>
          <p className="text-xs text-muted">{now.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</p>
        </div>
      </div>

      {/* 統計カード */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-gradient-to-br from-[#1a1a2e] to-[#111] border border-border rounded-xl p-5">
          <p className="text-xs text-muted mb-1 uppercase tracking-wider">配車件数</p>
          <p className="text-3xl font-light">{data.total_dispatches}<span className="text-sm text-muted ml-1">件</span></p>
        </div>
        <div className="bg-gradient-to-br from-[#1a2e1a] to-[#111] border border-border rounded-xl p-5">
          <p className="text-xs text-muted mb-1 uppercase tracking-wider">稼働ドライバー</p>
          <p className="text-3xl font-light">{data.total_drivers}<span className="text-sm text-muted ml-1">名</span></p>
        </div>
        <div className="bg-gradient-to-br from-[#2e1a1a] to-[#111] border border-border rounded-xl p-5">
          <p className="text-xs text-muted mb-1 uppercase tracking-wider">荷主数</p>
          <p className="text-3xl font-light">{data.client_ranking.length}<span className="text-sm text-muted ml-1">社</span></p>
        </div>
        <div className={`bg-gradient-to-br ${data.pending_reports_count > 0 ? 'from-[#2e2e1a]' : 'from-[#1a1a1a]'} to-[#111] border border-border rounded-xl p-5`}>
          <p className="text-xs text-muted mb-1 uppercase tracking-wider">未処理日報</p>
          <p className={`text-3xl font-light ${data.pending_reports_count > 0 ? 'text-warning' : ''}`}>
            {data.pending_reports_count}<span className="text-sm text-muted ml-1">件</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* ドライバー別配車件数（バーグラフ） */}
        <div className="bg-[#111] border border-border rounded-xl p-6">
          <h3 className="text-sm font-medium text-muted mb-5 uppercase tracking-wider">ドライバー別配車件数</h3>
          {data.driver_sales.length === 0 ? (
            <p className="text-xs text-muted">データなし</p>
          ) : (
            <div className="space-y-3">
              {data.driver_sales.map((d) => (
                <div key={d.id} className="flex items-center gap-3">
                  <span className="text-xs w-20 truncate">{d.name}</span>
                  <div className="flex-1 bg-[#1a1a1a] rounded-full h-5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 flex items-center justify-end pr-2"
                      style={{ width: `${Math.max((d.total / maxDriver) * 100, 8)}%` }}
                    >
                      <span className="text-[10px] font-bold text-white">{d.total}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 荷主別配車件数 */}
        <div className="bg-[#111] border border-border rounded-xl p-6">
          <h3 className="text-sm font-medium text-muted mb-5 uppercase tracking-wider">荷主別配車件数</h3>
          {data.client_ranking.length === 0 ? (
            <p className="text-xs text-muted">データなし</p>
          ) : (
            <div className="space-y-2">
              {data.client_ranking.slice(0, 10).map((c, i) => (
                <div key={c.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                      i === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                      i === 1 ? 'bg-gray-400/20 text-gray-300' :
                      i === 2 ? 'bg-orange-500/20 text-orange-400' :
                      'bg-accent text-muted'
                    }`}>{i + 1}</span>
                    <span className="text-sm">{c.name}</span>
                  </div>
                  <span className="text-sm font-light">{c.total}件</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 直近の配車 */}
      <div className="bg-[#111] border border-border rounded-xl p-6">
        <h3 className="text-sm font-medium text-muted mb-5 uppercase tracking-wider">直近の配車</h3>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>日付</th><th>荷主</th><th>積み地</th><th>下ろし先</th><th>ドライバー</th><th>重量</th>
              </tr>
            </thead>
            <tbody>
              {(data.recent_schedules || []).length === 0 ? (
                <tr><td colSpan={6} className="text-center text-muted py-6">データなし</td></tr>
              ) : (data.recent_schedules || []).slice(0, 10).map(s => (
                <tr key={s.id}>
                  <td className="text-sm">{s.load_date}</td>
                  <td className="text-sm">{s.client_name || '—'}</td>
                  <td className="text-sm">{s.load_place}</td>
                  <td className="text-sm">{s.unload_place}</td>
                  <td className="text-sm">{s.driver_name || '—'}</td>
                  <td className="text-sm">{s.weight ? `${s.weight.toLocaleString()}kg` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard allowedRoles={["admin", "office"]}>
      <DashboardContent />
    </AuthGuard>
  );
}
