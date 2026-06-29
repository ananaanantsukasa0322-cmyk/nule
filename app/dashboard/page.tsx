"use client";

import { useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";

interface DashboardData {
  today: { count: number; drivers: number; weight: number; unassigned: number };
  thisMonth: { count: number; weight: number; revenue: number };
  prevMonth: { count: number; weight: number; revenue: number };
  client_ranking: { name: string; count: number; revenue: number; weight: number }[];
  driver_stats: { name: string; count: number; weight: number }[];
  weekly: { date: string; count: number }[];
}

function fmt(n: number) { return `¥${n.toLocaleString()}`; }
function ton(kg: number) { return `${(kg / 1000).toFixed(1)}t`; }
function diff(curr: number, prev: number) {
  if (!prev) return "";
  const pct = Math.round(((curr - prev) / prev) * 100);
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

function DashboardContent() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard").then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-muted text-sm">読み込み中...</div>;
  if (!data) return <div className="text-muted text-sm">データの取得に失敗しました</div>;

  const now = new Date();
  const monthLabel = `${now.getFullYear()}年${now.getMonth() + 1}月`;
  const maxWeekly = Math.max(...data.weekly.map(w => w.count), 1);
  const maxDriver = Math.max(...data.driver_stats.map(d => d.count), 1);
  const countDiff = diff(data.thisMonth.count, data.prevMonth.count);
  const weightDiff = diff(data.thisMonth.weight, data.prevMonth.weight);
  const revenueDiff = diff(data.thisMonth.revenue, data.prevMonth.revenue);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-extralight tracking-wide">ダッシュボード</h2>
          <p className="text-xs text-muted mt-1">{monthLabel}</p>
        </div>
      </div>

      {/* 今日の状況 */}
      <div className="bg-gradient-to-r from-[#0f1a2e] to-[#111] border border-border rounded-xl p-5 mb-6">
        <h3 className="text-xs text-muted uppercase tracking-wider mb-3">本日の状況</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-2xl font-light">{data.today.count}<span className="text-sm text-muted ml-1">件</span></p>
            <p className="text-xs text-muted">配車</p>
          </div>
          <div>
            <p className="text-2xl font-light">{data.today.drivers}<span className="text-sm text-muted ml-1">名</span></p>
            <p className="text-xs text-muted">稼働ドライバー</p>
          </div>
          <div>
            <p className="text-2xl font-light">{ton(data.today.weight)}</p>
            <p className="text-xs text-muted">総積載量</p>
          </div>
          <div>
            <p className={`text-2xl font-light ${data.today.unassigned > 0 ? 'text-warning' : ''}`}>{data.today.unassigned}<span className="text-sm text-muted ml-1">件</span></p>
            <p className="text-xs text-muted">未割当</p>
          </div>
        </div>
      </div>

      {/* 今月の実績 + 前月比 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-[#111] border border-border rounded-xl p-5">
          <p className="text-xs text-muted mb-1">配車件数</p>
          <div className="flex items-end gap-2">
            <p className="text-3xl font-light">{data.thisMonth.count}</p>
            {countDiff && <span className={`text-xs mb-1 ${countDiff.startsWith('+') ? 'text-success' : 'text-danger'}`}>{countDiff}</span>}
          </div>
          <p className="text-xs text-muted mt-1">前月 {data.prevMonth.count}件</p>
        </div>
        <div className="bg-[#111] border border-border rounded-xl p-5">
          <p className="text-xs text-muted mb-1">総重量</p>
          <div className="flex items-end gap-2">
            <p className="text-3xl font-light">{ton(data.thisMonth.weight)}</p>
            {weightDiff && <span className={`text-xs mb-1 ${weightDiff.startsWith('+') ? 'text-success' : 'text-danger'}`}>{weightDiff}</span>}
          </div>
          <p className="text-xs text-muted mt-1">前月 {ton(data.prevMonth.weight)}</p>
        </div>
        <div className="bg-[#111] border border-border rounded-xl p-5">
          <p className="text-xs text-muted mb-1">売上</p>
          <div className="flex items-end gap-2">
            <p className="text-3xl font-light">{fmt(data.thisMonth.revenue)}</p>
            {revenueDiff && <span className={`text-xs mb-1 ${revenueDiff.startsWith('+') ? 'text-success' : 'text-danger'}`}>{revenueDiff}</span>}
          </div>
          <p className="text-xs text-muted mt-1">前月 {fmt(data.prevMonth.revenue)}</p>
        </div>
      </div>

      {/* 週間推移 */}
      <div className="bg-[#111] border border-border rounded-xl p-5 mb-6">
        <h3 className="text-xs text-muted uppercase tracking-wider mb-4">直近7日間の配車数</h3>
        <div className="flex items-end gap-2 h-24">
          {data.weekly.map((w, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] text-muted">{w.count}</span>
              <div className="w-full bg-blue-600 rounded-t" style={{ height: `${Math.max((w.count / maxWeekly) * 80, 4)}px` }} />
              <span className="text-[10px] text-muted">{w.date}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 荷主別売上ランキング */}
        <div className="bg-[#111] border border-border rounded-xl p-5">
          <h3 className="text-xs text-muted uppercase tracking-wider mb-4">荷主別売上</h3>
          {data.client_ranking.length === 0 ? <p className="text-xs text-muted">データなし</p> : (
            <div className="space-y-2">
              {data.client_ranking.filter(c => c.name !== '未設定').slice(0, 8).map((c, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center ${
                      i === 0 ? 'bg-yellow-500/20 text-yellow-400' : i === 1 ? 'bg-gray-400/20 text-gray-300' : i === 2 ? 'bg-orange-500/20 text-orange-400' : 'text-muted'
                    }`}>{i + 1}</span>
                    <span className="text-sm">{c.name}</span>
                    <span className="text-xs text-muted">{c.count}件</span>
                  </div>
                  <span className="text-sm font-medium">{c.revenue ? fmt(c.revenue) : '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ドライバー別稼働 */}
        <div className="bg-[#111] border border-border rounded-xl p-5">
          <h3 className="text-xs text-muted uppercase tracking-wider mb-4">ドライバー別稼働</h3>
          {data.driver_stats.length === 0 ? <p className="text-xs text-muted">データなし</p> : (
            <div className="space-y-2">
              {data.driver_stats.map((d, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs w-16 truncate">{d.name}</span>
                  <div className="flex-1 bg-[#1a1a1a] rounded-full h-4 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400"
                      style={{ width: `${Math.max((d.count / maxDriver) * 100, 5)}%` }} />
                  </div>
                  <span className="text-xs text-muted w-12 text-right">{d.count}件</span>
                  <span className="text-xs text-muted w-14 text-right">{ton(d.weight)}</span>
                </div>
              ))}
            </div>
          )}
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
