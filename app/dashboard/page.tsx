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

interface DashboardByCategory {
  all: DashboardData; steel: DashboardData; container: DashboardData;
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

function Skeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-8 w-48 bg-white/5 rounded mb-6" />
      <div className="h-24 bg-white/5 rounded-xl mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="h-28 bg-white/5 rounded-xl" />
        <div className="h-28 bg-white/5 rounded-xl" />
        <div className="h-28 bg-white/5 rounded-xl" />
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

// 見出しのラベル（装飾なし、英大文字トラッキングで統一）
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11px] text-muted uppercase tracking-[0.12em] font-medium mb-4">{children}</h3>;
}

function DiffBadge({ value }: { value: string }) {
  if (!value) return null;
  const positive = value.startsWith("+");
  return (
    <span className={`text-xs mb-1 px-1.5 py-0.5 rounded ${positive ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
      {value}
    </span>
  );
}

function DashboardContent() {
  const [allData, setAllData] = useState<DashboardByCategory | null>(null);
  const [categoryTab, setCategoryTab] = useState<"all" | "steel" | "container">("all");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [res, nRes] = await Promise.all([
        fetch("/api/dashboard", { cache: "no-store" }),
        fetch("/api/notices", { cache: "no-store" }).catch(() => null),
      ]);
      if (res.ok) {
        setAllData(await res.json());
        setUpdatedAt(new Date());
        setLoadError(null);
      } else {
        const body = await res.json().catch(() => ({}));
        setLoadError(body.error || `更新に失敗しました（${res.status}）`);
      }
      if (nRes?.ok) {
        const n = await nRes.json();
        setNotices((Array.isArray(n) ? n : []).filter((x: Notice) => x.target !== "dispatch"));
      }
    } catch {
      setLoadError("更新に失敗しました（通信エラー）");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Skeleton />;
  if (!allData) return <div className="text-muted text-sm">データの取得に失敗しました</div>;
  const data = allData[categoryTab];

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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-extralight tracking-wide">ダッシュボード</h2>
          <p className="text-xs text-muted mt-1">{monthLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          {loadError && <span className="text-[10px] text-danger">{loadError}</span>}
          {updatedAt && <span className="text-[10px] text-muted">更新 {updatedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</span>}
          <button onClick={() => load(true)} disabled={refreshing}
            className="text-xs px-3 py-1.5 bg-accent rounded-md hover:bg-border disabled:opacity-50 transition-colors">
            {refreshing ? "更新中" : "更新"}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 mb-6 border-b border-border">
        {([["all", "全体"], ["steel", "鋼材"], ["container", "コンテナ"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setCategoryTab(key)}
            className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${categoryTab === key ? "border-white text-white" : "border-transparent text-muted hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* 共有注意事項（整備管理などから） */}
      {notices.length > 0 && (
        <div className="mb-4 px-4 py-3 bg-card border border-border rounded-lg space-y-1.5">
          {notices.map(n => (
            <p key={n.id} className="text-sm text-foreground/90" title={n.body}>
              <span className="text-muted">{n.department ? `[${n.department}] ` : "[お知らせ] "}</span>{n.title}
              {n.due_date ? <span className="text-xs text-muted ml-2">期限 {n.due_date}</span> : null}
            </p>
          ))}
        </div>
      )}

      {/* 未割当アラート */}
      {data.today.unassigned > 0 && (
        <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-warning/10 border border-warning/30 rounded-lg">
          <span className="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0" />
          <p className="text-sm text-warning">本日 {data.today.unassigned} 件の配車が未割当です</p>
          <a href="/dispatch" className="ml-auto text-xs px-3 py-1 bg-warning/15 text-warning rounded hover:bg-warning/25 transition-colors">配車管理へ →</a>
        </div>
      )}

      {/* 本日の状況 */}
      <div className="bg-card border border-border rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-5">
          <SectionLabel>本日の状況</SectionLabel>
          <span className="text-[10px] text-muted">{now.getMonth() + 1}/{now.getDate()}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div>
            <p className="text-3xl font-light leading-none tabular-nums">{data.today.count}<span className="text-sm text-muted ml-1">件</span></p>
            <p className="text-xs text-muted mt-1.5">配車</p>
          </div>
          <div>
            <p className="text-3xl font-light leading-none tabular-nums">{data.today.drivers}<span className="text-sm text-muted ml-1">名</span></p>
            <p className="text-xs text-muted mt-1.5">稼働ドライバー</p>
          </div>
          <div>
            <p className="text-3xl font-light leading-none tabular-nums">{ton(data.today.weight)}</p>
            <p className="text-xs text-muted mt-1.5">総積載量</p>
          </div>
          <div>
            <p className={`text-3xl font-light leading-none tabular-nums ${data.today.unassigned > 0 ? "text-warning" : ""}`}>{data.today.unassigned}<span className="text-sm text-muted ml-1">件</span></p>
            <p className="text-xs text-muted mt-1.5">未割当</p>
          </div>
        </div>
      </div>

      {/* 今月の実績 + 前月比 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-xs text-muted mb-2">配車件数</p>
          <div className="flex items-end gap-2">
            <p className="text-4xl font-light tracking-tight tabular-nums">{data.thisMonth.count}</p>
            <DiffBadge value={countDiff} />
          </div>
          <p className="text-xs text-muted mt-2">前月 {data.prevMonth.count}件</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-xs text-muted mb-2">総重量</p>
          <div className="flex items-end gap-2">
            <p className="text-4xl font-light tracking-tight tabular-nums">{ton(data.thisMonth.weight)}</p>
            <DiffBadge value={weightDiff} />
          </div>
          <p className="text-xs text-muted mt-2">前月 {ton(data.prevMonth.weight)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-xs text-muted mb-2">売上</p>
          <div className="flex items-end gap-2">
            <p className="text-4xl font-light tracking-tight tabular-nums">{fmt(data.thisMonth.revenue)}</p>
            <DiffBadge value={revenueDiff} />
          </div>
          <p className="text-xs text-muted mt-2">前月 {fmt(data.prevMonth.revenue)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* 月次売上推移（直近6ヶ月） */}
        {monthly.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5">
            <SectionLabel>月次売上推移（6ヶ月）</SectionLabel>
            <div className="flex items-end gap-3 h-36">
              {monthly.map((m, i) => {
                const isCurrent = i === monthly.length - 1;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group">
                    <span className={`text-[11px] tabular-nums ${isCurrent ? "text-foreground font-medium" : "text-muted"}`}>¥{fmtCompact(m.revenue)}</span>
                    <div className={`w-full rounded-t-sm transition-all group-hover:opacity-80 ${isCurrent ? "bg-foreground" : "bg-white/15"}`}
                      style={{ height: `${Math.max((m.revenue / maxMonthly) * 96, 4)}px` }} />
                    <span className={`text-[10px] ${isCurrent ? "text-foreground font-medium" : "text-muted"}`}>{m.month}</span>
                    <span className="text-[9px] text-muted tabular-nums">{m.count}件</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 週間推移 */}
        <div className="bg-card border border-border rounded-xl p-5">
          <SectionLabel>直近7日間の配車数</SectionLabel>
          <div className="flex items-end gap-3 h-36">
            {data.weekly.map((w, i) => {
              const isToday = i === todayIdx;
              const isWeekend = w.day === "土" || w.day === "日";
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group">
                  <span className={`text-xs tabular-nums ${isToday ? "text-foreground font-medium" : "text-muted"}`}>{w.count}</span>
                  <div className={`w-full rounded-t-sm transition-all group-hover:opacity-80 ${isToday ? "bg-foreground" : "bg-white/15"}`}
                    style={{ height: `${Math.max((w.count / maxWeekly) * 96, 4)}px` }} />
                  <span className={`text-[10px] ${isToday ? "text-foreground font-medium" : "text-muted"}`}>{w.date}</span>
                  {w.day && <span className={`text-[9px] ${isWeekend ? "text-danger/70" : "text-muted"}`}>{w.day}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 荷主別売上ランキング */}
        <div className="bg-card border border-border rounded-xl p-5">
          <SectionLabel>荷主別売上</SectionLabel>
          {ranking.length === 0 ? <p className="text-xs text-muted">データなし</p> : (
            <div className="space-y-1">
              {ranking.map((c, i) => (
                <div key={i} className="relative flex items-center justify-between py-2 px-2 rounded-lg hover:bg-white/[0.03] transition-colors overflow-hidden">
                  <div className="absolute inset-y-0 left-0 bg-white/[0.05] rounded-lg"
                    style={{ width: `${(c.revenue / maxClientRevenue) * 100}%` }} />
                  <div className="relative flex items-center gap-2.5">
                    <span className="text-xs text-muted w-4 tabular-nums">{i + 1}</span>
                    <span className="text-sm">{c.name}</span>
                    <span className="text-[10px] text-muted bg-white/5 px-1.5 py-0.5 rounded tabular-nums">{c.count}件</span>
                    <span className="text-[10px] text-muted tabular-nums">{ton(c.weight)}</span>
                  </div>
                  <span className={`relative text-sm font-medium tabular-nums ${c.revenue ? "" : "text-muted"}`}>{c.revenue ? fmt(c.revenue) : "—"}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ドライバー別稼働 */}
        <div className="bg-card border border-border rounded-xl p-5">
          <SectionLabel>ドライバー別稼働</SectionLabel>
          {data.driver_stats.length === 0 ? <p className="text-xs text-muted">データなし</p> : (
            <div className="space-y-2.5">
              {data.driver_stats.map((d, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs w-16 truncate text-muted">{d.name}</span>
                  <div className="flex-1 bg-white/5 rounded-full h-5 overflow-hidden relative">
                    <div className="h-full rounded-full bg-white/25 transition-all"
                      style={{ width: `${Math.max((d.count / maxDriver) * 100, 6)}%` }} />
                  </div>
                  <span className="text-xs text-muted w-10 text-right tabular-nums">{d.count}件</span>
                  <span className="text-xs text-muted w-12 text-right tabular-nums">{ton(d.weight)}</span>
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
