"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SetupPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!token) { setError("招待リンクが無効です"); return; }
    if (password.length < 4) { setError("パスワードは4文字以上で設定してください"); return; }
    if (password !== confirm) { setError("パスワードが一致しません"); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/setup-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();

      if (!res.ok) { setError(data.error || "設定に失敗しました"); return; }

      router.push(data.user.role === "dispatcher" ? "/dispatch" : "/dashboard");
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center">
          <h1 className="text-4xl font-extralight tracking-[0.4em] text-white mb-4">NULE</h1>
          <p className="text-danger">無効な招待リンクです</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extralight tracking-[0.4em] text-white mb-2">NULE</h1>
          <p className="text-sm text-muted font-light">パスワード設定</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-muted mb-1.5 font-light">パスワード</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full" required placeholder="4文字以上" />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5 font-light">パスワード確認</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              className="w-full" required placeholder="もう一度入力" />
          </div>

          {error && <p className="text-danger text-xs">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-white text-black text-sm font-light rounded-md hover:bg-gray-200 disabled:opacity-50 mt-6">
            {loading ? "..." : "パスワードを設定してログイン"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function SetupPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 border border-muted border-t-white rounded-full animate-spin" />
    </div>}>
      <SetupPasswordForm />
    </Suspense>
  );
}
