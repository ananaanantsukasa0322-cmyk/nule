"use client";

import { useEffect, useState, useCallback } from "react";
import AuthGuard from "@/components/AuthGuard";
import type { Client, Dispatch } from "@/types/database";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n);
}

function SalesContent() {
  const [clients, setClients] = useState<Client[]>([]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [summary, setSummary] = useState<Record<string, { client_name: string; total: number; count: number }>>({});
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const [dateFrom, setDateFrom] = useState(
    new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]
  );
  const [dateTo, setDateTo] = useState(
    new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0]
  );
  const [clientFilter, setClientFilter] = useState("");
  const [invoiceClient, setInvoiceClient] = useState("");

  const loadClients = useCallback(async () => {
    const res = await fetch("/api/masters/clients");
    const data = await res.json();
    setClients(data.clients || []);
  }, []);

  const loadSales = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
    if (clientFilter) params.set("client_id", clientFilter);

    const res = await fetch(`/api/sales?${params}`);
    const data = await res.json();
    setDispatches(data.dispatches || []);
    setSummary(data.summary || {});
    setTotalAmount(data.total_amount || 0);
    setLoading(false);
  }, [dateFrom, dateTo, clientFilter]);

  useEffect(() => { loadClients(); }, [loadClients]);
  useEffect(() => { loadSales(); }, [loadSales]);

  async function updateClientName(schedId: string, newName: string) {
    await fetch(`/api/schedules/${schedId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: newName }),
    });
    loadSales();
  }

  async function generateInvoice() {
    if (!invoiceClient) return;
    const params = new URLSearchParams({
      client_id: invoiceClient,
      date_from: dateFrom,
      date_to: dateTo,
    });

    const res = await fetch(`/api/invoice?${params}`);
    const data = await res.json();

    if (!res.ok) {
      alert(data.error);
      return;
    }

    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();

    doc.setFontSize(20);
    doc.text("INVOICE", 105, 25, { align: "center" });

    doc.setFontSize(10);
    doc.text(`To: ${data.client.company_name}`, 20, 45);
    if (data.client.address) doc.text(data.client.address, 20, 52);
    doc.text(`Period: ${data.date_from} - ${data.date_to}`, 20, 62);
    doc.text(`Date: ${new Date().toISOString().split("T")[0]}`, 140, 45);

    let y = 80;
    doc.setFontSize(9);
    doc.text("Date", 20, y);
    doc.text("Route", 55, y);
    doc.text("Weight", 120, y);
    doc.text("Amount", 155, y);
    y += 2;
    doc.line(20, y, 190, y);
    y += 8;

    for (const d of data.dispatches) {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.text(d.dispatch_date, 20, y);
      const routeText = d.route ? `${d.route.departure} - ${d.route.destination}` : "-";
      doc.text(routeText.substring(0, 30), 55, y);
      doc.text(d.weight ? `${d.weight}t` : "-", 120, y);
      doc.text(`${Number(d.calculated_amount).toLocaleString()}`, 155, y);
      y += 7;
    }

    y += 5;
    doc.line(20, y, 190, y);
    y += 10;
    doc.setFontSize(12);
    doc.text(`Total: ${Number(data.total_amount).toLocaleString()} JPY`, 155, y, { align: "right" });

    doc.save(`invoice_${data.client.company_name}_${dateFrom}_${dateTo}.pdf`);
  }

  if (loading) return <div className="text-muted text-sm">読み込み中...</div>;

  return (
    <div>
      <h2 className="text-xl font-light mb-6">売上・請求管理</h2>

      <div className="flex flex-wrap gap-3 mb-6">
        <div>
          <label className="block text-xs text-muted mb-1">開始日</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">終了日</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">荷主フィルター</label>
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
          >
            <option value="">全て</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.company_name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-[#111] border border-border rounded-lg p-5 mb-6">
        <p className="text-xs text-muted mb-1">期間内売上合計</p>
        <p className="text-3xl font-extralight">{formatCurrency(totalAmount)}</p>
      </div>

      <div className="bg-[#111] border border-border rounded-lg p-5 mb-6">
        <h3 className="text-sm font-light text-muted mb-4">荷主別集計</h3>
        <div className="space-y-2">
          {Object.entries(summary).map(([id, s]) => (
            <div key={id} className="flex items-center justify-between">
              <span className="text-sm">{s.client_name} ({s.count}件)</span>
              <span className="text-sm">{formatCurrency(s.total)}</span>
            </div>
          ))}
          {Object.keys(summary).length === 0 && (
            <p className="text-xs text-muted">データなし</p>
          )}
        </div>
      </div>

      <div className="bg-[#111] border border-border rounded-lg p-5 mb-6">
        <h3 className="text-sm font-light text-muted mb-4">請求書PDF生成</h3>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs text-muted mb-1">荷主選択</label>
            <select
              value={invoiceClient}
              onChange={(e) => setInvoiceClient(e.target.value)}
              className="w-full"
            >
              <option value="">選択...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.company_name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={generateInvoice}
            disabled={!invoiceClient}
            className="px-4 py-2 bg-white text-black text-sm rounded-md hover:bg-gray-200 transition-colors disabled:opacity-30"
          >
            PDF生成
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <h3 className="text-sm font-light text-muted mb-3">明細一覧</h3>
        <table>
          <thead>
            <tr>
              <th>日付</th>
              <th>荷主</th>
              <th>ドライバー</th>
              <th>ルート</th>
              <th>金額</th>
            </tr>
          </thead>
          <tbody>
            {dispatches.map((d) => (
              <tr key={d.id}>
                <td>{d.dispatch_date}</td>
                <td>
                  <input
                    type="text"
                    defaultValue={(d as unknown as {client_name?:string}).client_name || ""}
                    placeholder="荷主名"
                    className="bg-transparent border-b border-border text-sm w-full outline-none focus:border-white"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      const current = (d as unknown as {client_name?:string}).client_name || "";
                      if (v !== current) updateClientName(d.id, v);
                    }}
                  />
                </td>
                <td>{d.driver?.name || "—"}</td>
                <td>
                  {d.route
                    ? `${d.route.departure} → ${d.route.destination}`
                    : "—"}
                </td>
                <td>{formatCurrency(d.calculated_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SalesPage() {
  return (
    <AuthGuard allowedRoles={["admin", "office"]}>
      <SalesContent />
    </AuthGuard>
  );
}
