"use client";

import { useState } from "react";

interface FileImportProps {
  target: string;
  label: string;
  onComplete: () => void;
}

export default function FileImport({ target, label, onComplete }: FileImportProps) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ inserted: number; errors: number; total: number } | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("target", target);

    try {
      const res = await fetch("/api/import", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
        onComplete();
      } else {
        alert(data.error || "インポートに失敗しました");
      }
    } catch {
      alert("通信エラー");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      <label className="px-3 py-1.5 bg-accent border border-border text-sm rounded cursor-pointer hover:bg-border transition-colors">
        {uploading ? "..." : `${label}をインポート`}
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleFile}
          disabled={uploading}
          className="hidden"
        />
      </label>
      {result && (
        <span className="text-xs text-muted">
          {result.inserted}件追加 {result.errors > 0 && `/ ${result.errors}件エラー`}
        </span>
      )}
    </div>
  );
}
