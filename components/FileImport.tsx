"use client";

import { useState } from "react";

interface FileImportProps {
  target: string;
  label: string;
  onComplete: () => void;
  category?: string;
}

export default function FileImport({ target, label, onComplete, category }: FileImportProps) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ inserted: number; errors: number; total: number; errorDetails?: string[] } | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("target", target);
    if (category) formData.append("category", category);

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
    <div className="flex items-start gap-3">
      <label className="px-3 py-1.5 bg-accent border border-border text-sm rounded cursor-pointer hover:bg-border transition-colors whitespace-nowrap">
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
        <div className="text-xs text-muted">
          <p>{result.inserted}件追加 {result.errors > 0 && `/ ${result.errors}件エラー`}</p>
          {result.errorDetails && result.errorDetails.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-red-400/90 max-w-md">
              {result.errorDetails.map((d, i) => <li key={i}>{d}</li>)}
              {result.errors > result.errorDetails.length && <li>…他{result.errors - result.errorDetails.length}件</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
