"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function DispatchPage() {
  const [authorized, setAuthorized] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(() => setAuthorized(true))
      .catch(() => router.push("/login"));
  }, [router]);

  if (!authorized) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a" }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: "2rem", fontWeight: 200, letterSpacing: "0.3em", color: "#fff", marginBottom: "1rem" }}>NULE</h1>
          <div style={{ width: 32, height: 32, border: "1px solid #888", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto" }} />
        </div>
      </div>
    );
  }

  return (
    <iframe
      src="/api/dispatch-tool"
      style={{ width: "100vw", height: "100vh", border: "none", position: "fixed", top: 0, left: 0, zIndex: 100 }}
    />
  );
}
