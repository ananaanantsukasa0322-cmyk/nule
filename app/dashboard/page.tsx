"use client";

import { useEffect, useState, useCallback } from "react";
import AuthGuard from "@/components/AuthGuard";

interface DashboardData {
  today: { count: number; drivers: number; weight: number; unassigned: number };
  thisMonth: { count: number; weight: number; revenue: number };
  prevMonth: { count: number; weight: number; revenue: number };
  client_ranking: { name: string; count: number; revenue: number; weight: number }[];
  driver_stats: { name: string; count: number; weight: number }[];
  weekly: { date: string; day?: string; count: number }[];
  monthly?: { month: string; count: number; revenue: number }[];
}

function fmt(n: number) { return `¥${n.toLocaleString()}`; }
function fmtCompact(n: number) {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}億`;
  if (n >= 10000) return `${Math.round(n / 10000)}万`;
  return `${n}`;
}
function ton(kg: number) { return `${(kg / 1000).toFixed(1)}t`; }
function diff(curr: number, prev: number) {
  if (!prev) return "";
  const pct = Math.round(((curr - prev) / prev) * 100);
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

const BAR_COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#ef4444"];

function Skeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-8 w-48 bg-white/5 rounded mb-6" />
      <div className="h-36 bg-white/5 rounded-2xl mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="h-32 bg-white/5 rounded-xl" />
        <div className="h-32 bg-white/5 rounded-xl" />
        <div className="h-32 bg-white/5 rounded-xl" />
      </div>
      <div className="h-44 bg-white/5 rounded-xl mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-64 bg-white/5 rounded-xl" />
        <div className="h-64 bg-white/5 rounded-xl" />
      </div>
    </div>
  );
}

interface Notice {
  id: string; title: string; body: string; target: string; department: string;
  due_date?: string | null;
}

function DashboardContent() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [res, nRes] = await Promise.all([
        fetch("/api/dashboard"),
        fetch("/api/notices").catch(() => null),
      ]);
      if (res.ok) {
        setData(await res.json());
        setUpdatedAt(new Date());
      }
      if (nRes?.ok) {
        const n = await nRes.json();
        setNotices((Array.isArray(n) ? n : []).filter((x: Notice) => x.target !== "dispatch"));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Skeleton />;
  if (!data) return <div className="text-muted text-sm">データの取得に失敗しました</div>;

  const now = new Date();
  const monthLabel = `${now.getFullYear()}年${now.getMonth() + 1}月`;
  const maxWeekly = Math.max(...data.weekly.map(w => w.count), 1);
  const maxDriver = Math.max(...data.driver_stats.map(d => d.count), 1);
  const monthly = data.monthly || [];
  const maxMonthly = Math.max(...monthly.map(m => m.revenue), 1);
  const ranking = data.client_ranking.filter(c => c.name !== "未設定").slice(0, 8);
  const maxClientRevenue = Math.max(...ranking.map(c => c.revenue), 1);
  const countDiff = diff(data.thisMonth.count, data.prevMonth.count);
  const weightDiff = diff(data.thisMonth.weight, data.prevMonth.weight);
  const revenueDiff = diff(data.thisMonth.revenue, data.prevMonth.revenue);
  const todayIdx = data.weekly.length - 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-extralight tracking-wide">ダッシュボード</h2>
          <p className="text-xs text-muted mt-1">{monthLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          {updatedAt && <span className="text-[10px] text-muted">更新 {updatedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</span>}
          <button onClick={() => load(true)} disabled={refreshing}
            className="text-xs px-3 py-1.5 bg-accent rounded-md hover:bg-border disabled:opacity-50 transition-colors">
            {refreshing ? "更新中..." : "↻ 更新"}
          </button>
        </div>
      </div>

      {/* 共有注意事項（整備管理などから） */}
      {notices.length > 0 && (
        <div className="mb-4 px-4 py-3 bg-blue-500/10 border border-blue-800/50 rounded-lg space-y-1">
          {notices.map(n => (
            <p key={n.id} className="text-sm text-blue-300" title={n.body}>
              📢 {n.department ? `[${n.department}] ` : ""}{n.title}
              {n.due_date ? <span className="text-xs text-muted ml-2">期限 {n.due_date}</span> : null}
            </p>
          ))}
        </div>
      )}

      {/* 未割当アラート */}
      {data.today.unassigned > 0 && (
        <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-amber-500/10 border border-amber-700/50 rounded-lg">
          <span>⚠️</span>
          <p className="text-sm text-amber-300">本日 {data.today.unassigned} 件の配車が未割当です</p>
          <a href="/dispatch" className="ml-auto text-xs px-3 py-1 bg-amber-500/20 text-amber-300 rounded hover:bg-amber-500/30 transition-colors">配車管理へ →</a>
        </div>
      )}

      {/* 今日の状況 - ヒーローバナー */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-950 via-[#0f1a2e] to-[#0a0a0a] border border-blue-900/50 rounded-2xl p-6 mb-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-20 -mt-20" />
        <div className="relative flex items-center justify-between mb-5">
          <h3 className="text-xs text-blue-300 uppercase tracking-[0.2em] font-semibold">本日の状況</h3>
          <span className="text-[10px] text-muted">{now.getMonth()+1}/{now.getDate()}</span>
        </div>
        <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-500/20 flex items-center justify-center text-xl">🚚</div>
            <div>
              <p className="text-3xl font-light leading-none">{data.today.count}<span className="text-sm text-muted ml-1">件</span></p>
              <p className="text-xs text-muted mt-1">配車</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/20 flex items-center justify-center text-xl">👤</div>
            <div>
              <p className="text-3xl font-light leading-none">{data.today.drivers}<span className="text-sm text-muted ml-1">名</span></p>
              <p className="text-xs text-muted mt-1">稼働ドライバー</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-500/20 flex items-center justify-center text-xl">⚖️</div>
            <div>
              <p className="text-3xl font-light leading-none">{ton(data.today.weight)}</p>
              <p className="text-xs text-muted mt-1">総積載量</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl ${data.today.unassigned > 0 ? 'bg-amber-500/20' : 'bg-gray-500/10'}`}>
              {data.today.unassigned > 0 ? '⚠️' : '✓'}
            </div>
            <div>
              <p className={`text-3xl font-light leading-none ${data.today.unassigned > 0 ? 'text-amber-400' : ''}`}>{data.today.unassigned}<span className="text-sm text-muted ml-1">件</span></p>
              <p className="text-xs text-muted mt-1">未割当</p>
            </div>
          </div>
        </div>
      </div>

      {/* 今月の実績 + 前月比 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="relative overflow-hidden bg-[#0d0d0d] border border-border rounded-xl p-5">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />
          <p className="text-xs text-muted mb-2 flex items-center gap-1.5"><span>📦</span>配車件数</p>
          <div className="flex items-end gap-2">
            <p className="text-4xl font-light tracking-tight">{data.thisMonth.count}</p>
            {countDiff && <span className={`text-xs mb-1.5 px-1.5 py-0.5 rounded ${countDiff.startsWith('+') ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>{countDiff}</span>}
          </div>
          <p className="text-xs text-muted mt-2">前月 {data.prevMonth.count}件</p>
        </div>
        <div className="relative overflow-hidden bg-[#0d0d0d] border border-border rounded-xl p-5">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-purple-500" />
          <p className="text-xs text-muted mb-2 flex items-center gap-1.5"><span>⚖️</span>総重量</p>
          <div className="flex items-end gap-2">
            <p className="text-4xl font-light tracking-tight">{ton(data.thisMonth.weight)}</p>
            {weightDiff && <span className={`text-xs mb-1.5 px-1.5 py-0.5 rounded ${weightDiff.startsWith('+') ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>{weightDiff}</span>}
          </div>
          <p className="text-xs text-muted mt-2">前月 {ton(data.prevMonth.weight)}</p>
        </div>
        <div className="relative overflow-hidden bg-[#0d0d0d] border border-border rounded-xl p-5">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />
          <p className="text-xs text-muted mb-2 flex items-center gap-1.5"><span>💰</span>売上</p>
          <div className="flex items-end gap-2">
            <p className="text-4xl font-light tracking-tight">{fmt(data.thisMonth.revenue)}</p>
            {revenueDiff && <span className={`text-xs mb-1.5 px-1.5 py-0.5 rounded ${revenueDiff.startsWith('+') ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>{revenueDiff}</span>}
          </div>
          <p className="text-xs text-muted mt-2">前月 {fmt(data.prevMonth.revenue)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* 月次売上推移（直近6ヶ月） */}
        {monthly.length > 0 && (
          <div className="bg-[#0d0d0d] border border-border rounded-xl p-5">
            <h3 className="text-xs text-muted uppercase tracking-wider mb-5 flex items-center gap-1.5"><span>📊</span>月次売上推移（6ヶ月）</h3>
            <div className="flex items-end gap-3 h-36">
              {monthly.map((m, i) => {
                const isCurrent = i === monthly.length - 1;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group">
                    <span className={`text-[11px] font-medium ${isCurrent ? 'text-emerald-300' : 'text-muted'}`}>¥{fmtCompact(m.revenue)}</span>
                    <div className="w-full rounded-t-md transition-all group-hover:opacity-80"
                      style={{
                        height: `${Math.max((m.revenue / maxMonthly) * 96, 4)}px`,
                        background: isCurrent
                          ? 'linear-gradient(180deg, #34d399, #059669)'
                          : 'linear-gradient(180deg, #065f4699, #064e3b99)',
                      }} />
                    <span className={`text-[10px] ${isCurrent ? 'text-emerald-400 font-medium' : 'text-muted'}`}>{m.month}</span>
                    <span className="text-[9px] text-muted">{m.count}件</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 週間推移 */}
        <div className="bg-[#0d0d0d] border border-border rounded-xl p-5">
          <h3 className="text-xs text-muted uppercase tracking-wider mb-5 flex items-center gap-1.5"><span>📈</span>直近7日間の配車数</h3>
          <div className="flex items-end gap-3 h-36">
            {data.weekly.map((w, i) => {
              const isToday = i === todayIdx;
              const isWeekend = w.day === "土" || w.day === "日";
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group">
                  <span className={`text-xs font-medium ${isToday ? 'text-white' : 'text-muted'}`}>{w.count}</span>
                  <div className="w-full rounded-t-md transition-all group-hover:opacity-80"
                    style={{
                      height: `${Math.max((w.count / maxWeekly) * 96, 4)}px`,
                      background: isToday
                        ? 'linear-gradient(180deg, #60a5fa, #2563eb)'
                        : 'linear-gradient(180deg, #3730a3aa, #1e1b4baa)',
                    }} />
                  <span className={`text-[10px] ${isToday ? 'text-blue-400 font-medium' : 'text-muted'}`}>{w.date}</span>
                  {w.day && <span className={`text-[9px] ${isWeekend ? 'text-red-400/70' : 'text-muted'}`}>{w.day}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 荷主別売上ランキング */}
        <div className="bg-[#0d0d0d] border border-border rounded-xl p-5">
          <h3 className="text-xs text-muted uppercase tracking-wider mb-4 flex items-center gap-1.5"><span>🏆</span>荷主別売上</h3>
          {ranking.length === 0 ? <p className="text-xs text-muted">データなし</p> : (
            <div className="space-y-1">
              {ranking.map((c, i) => (
                <div key={i} className="relative flex items-center justify-between py-2 px-2 rounded-lg hover:bg-white/[0.03] transition-colors overflow-hidden">
                  <div className="absolute inset-y-0 left-0 bg-blue-500/[0.07] rounded-lg"
                    style={{ width: `${(c.revenue / maxClientRevenue) * 100}%` }} />
                  <div className="relative flex items-center gap-2.5">
                    <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                      i === 0 ? 'bg-yellow-500/20 text-yellow-400' : i === 1 ? 'bg-gray-400/20 text-gray-300' : i === 2 ? 'bg-orange-500/20 text-orange-400' : 'bg-white/5 text-muted'
                    }`}>{i + 1}</span>
                    <span className="text-sm">{c.name}</span>
                    <span className="text-[10px] text-muted bg-white/5 px-1.5 py-0.5 rounded">{c.count}件</span>
                    <span className="text-[10px] text-muted">{ton(c.weight)}</span>
                  </div>
                  <span className={`relative text-sm font-medium ${c.revenue ? '' : 'text-muted'}`}>{c.revenue ? fmt(c.revenue) : '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ドライバー別稼働 */}
        <div className="bg-[#0d0d0d] border border-border rounded-xl p-5">
          <h3 className="text-xs text-muted uppercase tracking-wider mb-4 flex items-center gap-1.5"><span>🚛</span>ドライバー別稼働</h3>
          {data.driver_stats.length === 0 ? <p className="text-xs text-muted">データなし</p> : (
            <div className="space-y-2.5">
              {data.driver_stats.map((d, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs w-16 truncate text-muted">{d.name}</span>
                  <div className="flex-1 bg-white/5 rounded-full h-5 overflow-hidden relative">
                    <div className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.max((d.count / maxDriver) * 100, 6)}%`,
                        background: `linear-gradient(90deg, ${BAR_COLORS[i % BAR_COLORS.length]}99, ${BAR_COLORS[i % BAR_COLORS.length]})`,
                      }} />
                  </div>
                  <span className="text-xs text-muted w-10 text-right">{d.count}件</span>
                  <span className="text-xs text-muted w-12 text-right">{ton(d.weight)}</span>
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
