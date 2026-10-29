"use client";

import { useState } from "react";

interface FileImportProps {
  target: string;
  label: string;
  onComplete: () => void;
  category?: string;
  allowFullSync?: boolean;
}

export default function FileImport({ target, label, onComplete, category, allowFullSync }: FileImportProps) {
  const [uploading, setUploading] = useState(false);
  const [fullSync, setFullSync] = useState(false);
  const [result, setResult] = useState<{ inserted: number; errors: number; total: number; errorDetails?: string[]; deactivated?: number } | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (fullSync && !confirm(
      "完全同期モードがONです。このExcelの内容で全項目を上書きし、Excelに載っていない既存データは無効化（削除扱い）されます。\n\n本当に実行しますか？"
    )) {
      e.target.value = "";
      return;
    }

    setUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("target", target);
    if (category) formData.append("category", category);
    if (fullSync) formData.append("fullSync", "true");

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
      <div className="flex flex-col gap-1.5">
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
        {allowFullSync && (
          <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer">
            <input type="checkbox" checked={fullSync} onChange={e => setFullSync(e.target.checked)} />
            完全同期（空欄も上書き・Excelに無いものは削除）
          </label>
        )}
      </div>
      {result && (
        <div className="text-xs text-muted">
          <p>
            {result.inserted}件追加・更新
            {result.errors > 0 && ` / ${result.errors}件エラー`}
            {!!result.deactivated && ` / ${result.deactivated}件を削除扱いに`}
          </p>
          {result.errorDetails && result.errorDetails.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-red-600 max-w-md">
              {result.errorDetails.map((d, i) => <li key={i}>{d}</li>)}
              {result.errors > result.errorDetails.length && <li>…他{result.errors - result.errorDetails.length}件</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
