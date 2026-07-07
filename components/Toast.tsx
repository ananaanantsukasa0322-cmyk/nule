"use client";

import { useState, useCallback, useRef } from "react";

type ToastType = "success" | "error";

export function useToast() {
  const [msg, setMsg] = useState<{ text: string; type: ToastType } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string, type: ToastType = "success") => {
    if (timer.current) clearTimeout(timer.current);
    setMsg({ text, type });
    timer.current = setTimeout(() => setMsg(null), 3200);
  }, []);

  const node = msg ? (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-lg text-sm shadow-lg border ${
        msg.type === "success"
          ? "bg-[#0f1f14] border-green-700 text-green-300"
          : "bg-[#251012] border-red-700 text-red-300"
      }`}
    >
      <span className="mr-2">{msg.type === "success" ? "✓" : "✕"}</span>
      {msg.text}
    </div>
  ) : null;

  return { show, node };
}
