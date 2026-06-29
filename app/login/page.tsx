"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [name] = useState("");
  const [role] = useState<"admin" | "office" | "dispatcher">("dispatcher");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint = "/api/auth/login";
      const body = { email, password };
      void name; void role;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "エラーが発生しました");
        return;
      }

      if (data.user.role === "dispatcher") {
        router.push("/dispatch");
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extralight tracking-[0.4em] text-white mb-2">
            NULE
          </h1>
          <p className="text-sm text-muted font-light">
            運送業務管理システム
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-muted mb-1.5 font-light">
              メールアドレス
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-muted mb-1.5 font-light">
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full"
              required
            />
          </div>

          {error && (
            <p className="text-danger text-xs">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-white text-black text-sm font-light rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50 mt-6"
          >
            {loading ? "..." : "ログイン"}
          </button>
        </form>

      </div>
    </div>
  );
}
