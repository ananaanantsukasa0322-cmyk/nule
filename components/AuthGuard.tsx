"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { User, UserRole } from "@/types/database";
import Sidebar from "./Sidebar";

interface AuthGuardProps {
  children: ReactNode;
  allowedRoles?: UserRole[];
}

const defaultRedirect: Record<UserRole, string> = {
  admin: "/dashboard",
  office: "/dashboard",
  dispatcher: "/dispatch",
};

export default function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [connError, setConnError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // 401（未認証）は即ログイン画面へ。それ以外（通信エラー・一時的な5xx等）は
    // セッション自体は生きている可能性が高いので、即ログアウト扱いにせず数回リトライする
    async function checkAuth() {
      let lastWasUnauthorized = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await sleep(500 * attempt);
        try {
          const res = await fetch("/api/auth/me", { cache: "no-store" });
          if (res.status === 401) { lastWasUnauthorized = true; break; }
          if (!res.ok) continue; // 5xx等はリトライ
          const data = await res.json();
          return data.user as User;
        } catch {
          // 通信エラーはリトライ
        }
      }
      if (cancelled) return null;
      if (!lastWasUnauthorized) {
        // 未認証と確定できないまま諦めた場合はログイン画面に飛ばさず、そのまま表示を諦める
        return undefined;
      }
      return null;
    }

    checkAuth().then((u) => {
      if (cancelled) return;
      if (u === undefined) { setConnError(true); setLoading(false); return; }
      if (!u) { router.push("/login"); return; }
      if (allowedRoles && !allowedRoles.includes(u.role) && u.role !== "admin") {
        router.push(defaultRedirect[u.role]);
        return;
      }
      setConnError(false);
      setUser(u);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [router, allowedRoles, retryTick]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-3xl font-extralight tracking-[0.3em] text-white mb-4">
            NULE
          </h1>
          <div className="w-8 h-8 border border-muted border-t-white rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  if (connError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-3xl font-extralight tracking-[0.3em] text-white mb-4">NULE</h1>
          <p className="text-sm text-muted mb-4">通信状態を確認できませんでした。ネットワークをご確認ください。</p>
          <button
            onClick={() => setRetryTick((t) => t + 1)}
            className="text-xs px-4 py-2 bg-accent rounded-md hover:bg-border transition-colors"
          >
            再試行
          </button>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar userRole={user.role} userName={user.name} userEmail={user.email} />
      <main className="flex-1 p-6 md:p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
