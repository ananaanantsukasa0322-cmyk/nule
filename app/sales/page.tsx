"use client";

import { useEffect, useState, useCallback } from "react";
import AuthGuard from "@/components/AuthGuard";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";

function formatCurrency(n: number) {
  return `¥${n.toLocaleString()}`;
}

interface IssuerInfo {
  address: string; tel: string; invoiceNo: string; bank: string; dueText: string;
}
const EMPTY_ISSUER: IssuerInfo = { address: "", tel: "", invoiceNo: "", bank: "", dueText: "翌月末日" };

function loadIssuerInfo(name: string): IssuerInfo {
  if (typeof window === "undefined") return { ...EMPTY_ISSUER };
  try {
    const raw = localStorage.getItem(`nule-issuer-${name}`);
    if (raw) return { ...EMPTY_ISSUER, ...JSON.parse(raw) };
  } catch { /* 破損データは無視してデフォルトを使う */ }
  return { ...EMPTY_ISSUER };
}

interface Schedule {
  id: string; load_date: string; unload_date: string; load_place: string; unload_place: string;
  weight: number; client_name?: string; driver_id?: string; vehicle_id?: string; done: boolean; manual_amount?: number;
  tax_included?: boolean;
}
interface PriceEntry {
  client_name: string; load_place: string; unload_place: string;
  price_type: string; per_ton_rate: number | null; fixed_amount: number | null;
  vehicle_type: string | null;
}

interface ClientEntry {
  company_name: string; formal_name: string | null;
}

function SalesContent() {
  const { show, node: toastNode } = useToast();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [prices, setPrices] = useState<PriceEntry[]>([]);
  const [clientMap, setClientMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1;
  const [dateFrom, setDateFrom] = useState(`${y}-${String(m).padStart(2,"0")}-01`);
  const [dateTo, setDateTo] = useState(`${y}-${String(m).padStart(2,"0")}-${new Date(y, m, 0).getDate()}`);
  const [clientFilter, setClientFilter] = useState("");
  const [issuerName, setIssuerName] = useState("サンテツ運輸株式会社");
  const [taxEnabled, setTaxEnabled] = useState(true);
  const [showIssuerModal, setShowIssuerModal] = useState(false);
  const [issuerForm, setIssuerForm] = useState<IssuerInfo>({ ...EMPTY_ISSUER });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [invoiceSuffix, setInvoiceSuffix] = useState("");
  const [showVehicleNo, setShowVehicleNo] = useState(false);
  const [vehicleMap, setVehicleMap] = useState<Record<string, string>>({});

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function openIssuerModal() {
    setIssuerForm(loadIssuerInfo(issuerName));
    setShowIssuerModal(true);
  }

  function saveIssuerInfo(e: React.FormEvent) {
    e.preventDefault();
    localStorage.setItem(`nule-issuer-${issuerName}`, JSON.stringify(issuerForm));
    setShowIssuerModal(false);
    show("発行者情報を保存しました");
  }

  const loadData = useCallback(async () => {
    const [s, p, c, v] = await Promise.all([
      fetch(`/api/sales?date_from=${dateFrom}&date_to=${dateTo}`).then(r => r.json()),
      fetch("/api/masters/prices").then(r => r.json()),
      fetch("/api/masters/clients").then(r => r.json()),
      fetch("/api/vehicles").then(r => r.json()).catch(() => []),
    ]);
    const vmap: Record<string, string> = {};
    for (const veh of (Array.isArray(v) ? v : []) as { id: string; number?: string; head_number?: string; trailer_number?: string }[]) {
      const num = veh.number || veh.head_number || veh.trailer_number || "";
      if (num) vmap[veh.id] = num;
    }
    setVehicleMap(vmap);
    setSchedules((s.dispatches || []) as Schedule[]);
    setPrices((p.prices || []).map((x: Record<string, unknown>) => ({
      client_name: x.client_name || '', load_place: x.load_place || '', unload_place: x.unload_place || '',
      price_type: x.price_type || 'fixed', per_ton_rate: x.per_ton_rate as number | null, fixed_amount: x.fixed_amount as number | null,
      vehicle_type: (x.vehicle_type || null) as string | null,
    })));
    const map: Record<string, string> = {};
    for (const cl of (c.clients || []) as ClientEntry[]) {
      if (cl.formal_name) map[cl.company_name] = cl.formal_name;
    }
    setClientMap(map);
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => { loadData(); }, [loadData]);

  function matchPlace(pricePlace: string, schedPlace: string): boolean {
    if (!pricePlace || !schedPlace) return !pricePlace;
    if (pricePlace === schedPlace) return true;
    if (schedPlace.includes(pricePlace) || pricePlace.includes(schedPlace)) return true;
    return false;
  }

  function findPrice(s: Schedule): { rate: number; type: string } {
    const vt = (s.weight || 0) >= 15000 ? "トレーラー" : "大型";

    function matchVehicle(p: PriceEntry): boolean {
      if (!p.vehicle_type) return true;
      return p.vehicle_type === vt;
    }

    function search(matchFn: (p: PriceEntry) => boolean): PriceEntry | undefined {
      // 車両タイプ一致を優先、なければ「全て」
      return prices.find(p => matchFn(p) && p.vehicle_type === vt)
        || prices.find(p => matchFn(p) && !p.vehicle_type);
    }

    // 1. 完全一致
    let p = search(p => p.client_name === s.client_name && p.load_place === s.load_place && p.unload_place === s.unload_place);
    // 2. 部分一致
    if (!p) p = search(p => p.client_name === s.client_name && matchPlace(p.load_place, s.load_place) && matchPlace(p.unload_place, s.unload_place));
    // 3. 荷主のみ
    if (!p) p = search(p => p.client_name === s.client_name && !p.load_place && !p.unload_place);

    if (p) {
      if (p.price_type === "per_ton" && p.per_ton_rate) return { rate: p.per_ton_rate, type: "per_ton" };
      if (p.fixed_amount) return { rate: p.fixed_amount, type: "fixed" };
    }
    return { rate: 0, type: "none" };
  }

  function calcAmount(s: Schedule): number {
    if ((s.manual_amount ?? 0) > 0) return s.manual_amount!;
    const p = findPrice(s);
    if (p.type === "per_ton") return Math.round(p.rate * (s.weight || 0) / 1000);
    if (p.type === "fixed") return p.rate;
    return 0;
  }

  async function toggleTaxIncluded(s: Schedule) {
    const next = !s.tax_included;
    const res = await fetch(`/api/schedules/${s.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tax_included: next }),
    });
    if (res.ok) show(next ? "税込に変更しました" : "税別に変更しました");
    else show("税区分の変更に失敗しました（DBにtax_included列が必要です）", "error");
    loadData();
  }

  async function updateManualAmount(id: string, value: string) {
    const amount = value === "" ? null : Number(value);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      show("スポット金額は0以上の数値を入力してください", "error");
      return;
    }
    const before = schedules.find(s => s.id === id)?.manual_amount ?? null;
    if ((before ?? null) === (amount ?? null)) return;
    const res = await fetch(`/api/schedules/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manual_amount: amount }),
    });
    if (res.ok) show(amount === null ? "スポット金額を解除しました" : `スポット金額 ${formatCurrency(amount)} を保存しました`);
    else show("スポット金額の保存に失敗しました", "error");
    loadData();
  }

  const clients = [...new Set(schedules.map(s => s.client_name).filter(Boolean) as string[])].sort();
  const filtered = clientFilter ? schedules.filter(s => s.client_name === clientFilter) : schedules;
  const totalAmount = filtered.reduce((sum, s) => sum + calcAmount(s), 0);
  const selectedRows = schedules.filter(s => selectedIds.has(s.id));
  const selectedTotal = selectedRows.reduce((sum, s) => sum + calcAmount(s), 0);
  const selectedTaxable = selectedRows.filter(s => !s.tax_included).reduce((sum, s) => sum + calcAmount(s), 0);
  const selectedGrandTotal = selectedTaxable + Math.floor(selectedTaxable * 0.1) + (selectedTotal - selectedTaxable);

  function generateSelectedInvoice() {
    if (!selectedRows.length) return;
    const clientNames = [...new Set(selectedRows.map(s => s.client_name || ""))];
    if (clientNames.length > 1) {
      show("複数の荷主が混ざっています。同じ荷主の明細だけ選択してください", "error");
      return;
    }
    if (!clientNames[0]) {
      show("荷主が未設定の明細は請求書にできません", "error");
      return;
    }
    generateInvoice(clientNames[0], selectedIds);
  }

  function toggleSelectAllFiltered() {
    const filteredIds = filtered.map(s => s.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(filteredIds));
  }

  const clientSummary = clients.map(c => {
    const cs = schedules.filter(s => s.client_name === c);
    const total = cs.reduce((sum, s) => sum + calcAmount(s), 0);
    return { name: c, count: cs.length, total };
  }).sort((a, b) => b.total - a.total);

  function generateInvoice(clientName: string, onlyIds?: Set<string>) {
    const items = schedules
      .filter(s => s.client_name === clientName && (!onlyIds || onlyIds.has(s.id)))
      .sort((a, b) => (a.unload_date || a.load_date).localeCompare(b.unload_date || b.load_date));
    if (!items.length) { show("この荷主の期間内データがありません", "error"); return; }

    const formalName = clientMap[clientName] || clientName;
    const issuer = loadIssuerInfo(issuerName);
    const suffix = invoiceSuffix.trim() ? `-${invoiceSuffix.trim()}` : "";
    const invoiceNo = `${dateTo.replaceAll("-", "").slice(0, 6)}-${String(clients.indexOf(clientName) + 1).padStart(3, "0")}${suffix}`;

    const hasTaxIncludedRows = taxEnabled && items.some(s => s.tax_included);
    let taxableSubtotal = 0;   // 税別（10%加算対象）
    let includedSubtotal = 0;  // 税込（そのまま）
    let grandWeight = 0;
    const rows = items.map(s => {
      const p = findPrice(s);
      const amount = calcAmount(s);
      if (taxEnabled && s.tax_included) includedSubtotal += amount;
      else taxableSubtotal += amount;
      grandWeight += s.weight || 0;
      const weightT = s.weight ? s.weight.toLocaleString() : "-";
      const priceStr = (s.manual_amount ?? 0) > 0 ? "スポット" : (p.rate ? (p.type === "per_ton" ? `¥${p.rate.toLocaleString()}/t` : `¥${p.rate.toLocaleString()}`) : "-");
      const taxCell = hasTaxIncludedRows
        ? `<td style="text-align:center;font-size:11px">${s.tax_included ? "税込" : "税別"}</td>`
        : "";
      const vehicleCell = showVehicleNo
        ? `<td style="font-size:11px;white-space:nowrap">${(s.vehicle_id && vehicleMap[s.vehicle_id]) || "-"}</td>`
        : "";
      return `<tr>
        <td>${s.unload_date || s.load_date}</td>${vehicleCell}<td>${s.load_place || ""}</td><td>${s.unload_place || ""}</td>
        <td style="text-align:right">${weightT}</td><td style="text-align:right">${priceStr}</td>
        ${taxCell}
        <td style="text-align:right">${amount ? `¥${amount.toLocaleString()}` : "-"}</td>
      </tr>`;
    }).join("");

    const tax = taxEnabled ? Math.floor(taxableSubtotal * 0.1) : 0;
    const total = taxableSubtotal + tax + includedSubtotal;

    let taxRows: string;
    if (taxEnabled && hasTaxIncludedRows) {
      taxRows = `<div class="summary-row"><span>課税分 小計（税抜）</span><span>¥${taxableSubtotal.toLocaleString()}</span></div>
         <div class="summary-row"><span>消費税（10%）</span><span>¥${tax.toLocaleString()}</span></div>
         <div class="summary-row"><span>税込分 小計</span><span>¥${includedSubtotal.toLocaleString()}</span></div>
         <div class="summary-row summary-total"><span>合計金額（税込）</span><span>¥${total.toLocaleString()}</span></div>`;
    } else if (taxEnabled) {
      taxRows = `<div class="summary-row"><span>小計（税抜）</span><span>¥${taxableSubtotal.toLocaleString()}</span></div>
         <div class="summary-row"><span>消費税（10%）</span><span>¥${tax.toLocaleString()}</span></div>
         <div class="summary-row summary-total"><span>合計金額（税込）</span><span>¥${total.toLocaleString()}</span></div>`;
    } else {
      taxRows = `<div class="summary-row summary-total"><span>合計金額</span><span>¥${total.toLocaleString()}</span></div>`;
    }
    const taxHeaderCell = hasTaxIncludedRows ? `<th style="text-align:center">税区分</th>` : "";
    const vehicleHeaderCell = showVehicleNo ? `<th>車番</th>` : "";

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>請求書 - ${formalName}</title>
      <style>
        @media print { body { margin: 0; } @page { margin: 15mm; } }
        body { font-family: "Hiragino Kaku Gothic Pro", "Yu Gothic", "Meiryo", sans-serif; color: #111; padding: 20px; max-width: 800px; margin: 0 auto; }
        h1 { text-align: center; font-size: 28px; letter-spacing: 0.5em; margin-bottom: 28px; border-bottom: 3px double #333; padding-bottom: 15px; }
        .meta { text-align: right; font-size: 12px; color: #555; margin-bottom: 12px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
        .header-left { font-size: 14px; }
        .header-right { text-align: right; font-size: 12px; line-height: 1.7; }
        .client-name { font-size: 19px; font-weight: bold; border-bottom: 1px solid #333; padding-bottom: 4px; margin-bottom: 8px; }
        .issuer-name { font-size: 15px; font-weight: bold; }
        .amount-box { display: inline-block; border: 2px solid #333; padding: 10px 28px; margin: 8px 0 4px; }
        .amount-box .label { font-size: 12px; color: #555; margin-bottom: 2px; }
        .amount-box .value { font-size: 24px; font-weight: bold; letter-spacing: 1px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 16px; }
        th { background: #f5f5f5; border: 1px solid #ccc; padding: 8px; text-align: left; font-weight: bold; }
        td { border: 1px solid #ccc; padding: 6px 8px; }
        .summary { margin-top: 16px; border-top: 2px solid #333; page-break-inside: avoid; }
        .summary-row { display: flex; justify-content: flex-end; gap: 40px; padding: 6px 4px; font-size: 13px; }
        .summary-total { font-size: 16px; font-weight: bold; border-top: 1px solid #ccc; padding-top: 8px; margin-top: 4px; }
        .footer { margin-top: 24px; padding: 12px 16px; background: #f8f8f8; border: 1px solid #ddd; font-size: 12px; line-height: 1.9; page-break-inside: avoid; }
        .footer b { display: inline-block; min-width: 5em; }
        .print-btn { position: fixed; top: 10px; right: 10px; padding: 10px 20px; background: #333; color: #fff; border: none; border-radius: 5px; cursor: pointer; font-size: 14px; }
        @media print { .print-btn { display: none; } }
      </style>
    </head><body>
      <button class="print-btn" onclick="window.print()">印刷 / PDF保存</button>
      <h1>請 求 書</h1>
      <div class="meta">請求書番号: ${invoiceNo}　発行日: ${new Date().toLocaleDateString('ja-JP')}</div>
      <div class="header">
        <div class="header-left">
          <div class="client-name">${formalName} 御中</div>
          <div style="font-size:12px;color:#555">下記の通りご請求申し上げます。</div>
          <div style="font-size:12px;color:#555">対象期間: ${dateFrom} ～ ${dateTo}</div>
          <div class="amount-box">
            <div class="label">御請求金額${taxEnabled ? "（税込）" : ""}</div>
            <div class="value">¥${total.toLocaleString()}</div>
          </div>
        </div>
        <div class="header-right">
          <div class="issuer-name">${issuerName}</div>
          ${issuer.address ? `<div>${issuer.address}</div>` : ""}
          ${issuer.tel ? `<div>TEL: ${issuer.tel}</div>` : ""}
          ${issuer.invoiceNo ? `<div>登録番号: ${issuer.invoiceNo}</div>` : ""}
        </div>
      </div>
      <table>
        <thead><tr><th>日付</th>${vehicleHeaderCell}<th>積み地</th><th>下ろし先</th><th style="text-align:right">重量(kg)</th><th style="text-align:right">単価</th>${taxHeaderCell}<th style="text-align:right">金額</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="summary">
        <div class="summary-row"><span>合計重量</span><span>${grandWeight.toLocaleString()} kg</span></div>
        ${taxRows}
      </div>
      <div class="footer">
        ${issuer.bank ? `<div><b>お振込先</b>${issuer.bank}</div>` : ""}
        ${issuer.dueText ? `<div><b>お支払期限</b>${issuer.dueText}</div>` : ""}
        <div style="color:#777">恐れ入りますが、振込手数料は貴社にてご負担願います。</div>
      </div>
    </body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }

  if (loading) return <div className="text-muted text-sm">読み込み中...</div>;

  return (
    <div>
      {toastNode}
      <h2 className="text-xl font-light mb-6">売上・請求管理</h2>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div><label className="block text-xs text-muted mb-1">開始日</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
        <div><label className="block text-xs text-muted mb-1">終了日</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
        <div><label className="block text-xs text-muted mb-1">荷主フィルター</label>
          <select value={clientFilter} onChange={e => setClientFilter(e.target.value)}>
            <option value="">全て</option>
            {clients.map(c => <option key={c} value={c}>{c}</option>)}
          </select></div>
        <div><label className="block text-xs text-muted mb-1">請求書発行者名</label>
          <select value={issuerName} onChange={e => setIssuerName(e.target.value)}>
            <option value="サンテツ運輸株式会社">サンテツ運輸株式会社</option>
            <option value="株式会社仲山商事">株式会社仲山商事</option>
          </select></div>
        <button onClick={openIssuerModal}
          className="text-xs px-3 py-2 bg-accent rounded hover:bg-border">発行者情報を編集</button>
        <label className="flex items-center gap-2 text-xs text-muted cursor-pointer py-2">
          <input type="checkbox" checked={taxEnabled} onChange={e => setTaxEnabled(e.target.checked)} />
          請求書に消費税10%を加算
        </label>
        <label className="flex items-center gap-2 text-xs text-muted cursor-pointer py-2">
          <input type="checkbox" checked={showVehicleNo} onChange={e => setShowVehicleNo(e.target.checked)} />
          請求書に車番を表示
        </label>
      </div>

      <div className="bg-[#111] border border-border rounded-lg p-5 mb-6">
        <p className="text-xs text-muted mb-1">期間内売上合計</p>
        <p className="text-3xl font-extralight">{formatCurrency(totalAmount)}</p>
      </div>

      <div className="bg-[#111] border border-border rounded-lg p-5 mb-6">
        <h3 className="text-sm font-light text-muted mb-4">荷主別集計・請求書発行</h3>
        <div className="space-y-2">
          {clientSummary.length === 0 ? <p className="text-xs text-muted">データなし</p> :
            clientSummary.map(c => (
              <div key={c.name} className="flex items-center justify-between">
                <span className="text-sm">{c.name} ({c.count}件)</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-light">{formatCurrency(c.total)}</span>
                  <button onClick={() => generateInvoice(c.name)}
                    className="text-xs px-2 py-1 bg-accent rounded hover:bg-border">PDF発行</button>
                </div>
              </div>
            ))
          }
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-light text-muted">明細一覧</h3>
        <p className="text-xs text-muted">チェックした明細だけで請求書を分けて発行できます（税込分・税別分など）</p>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-3 p-3 bg-blue-500/10 border border-blue-800/50 rounded-lg">
          <span className="text-sm">{selectedIds.size}件選択中</span>
          <span className="text-sm font-medium">{formatCurrency(selectedTotal)}{taxEnabled ? `（請求額 ${formatCurrency(selectedGrandTotal)}）` : ""}</span>
          <div className="flex items-center gap-1">
            <label className="text-xs text-muted">枝番</label>
            <input type="text" value={invoiceSuffix} onChange={e => setInvoiceSuffix(e.target.value)}
              placeholder="例: 2" className="w-14 text-sm bg-transparent border border-border rounded px-2 py-1" />
          </div>
          <button onClick={generateSelectedInvoice}
            className="text-xs px-3 py-1.5 bg-white text-black rounded hover:bg-gray-200">選択分で請求書発行</button>
          <button onClick={() => setSelectedIds(new Set())}
            className="text-xs text-muted hover:text-white ml-auto">選択解除</button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table>
          <thead><tr>
            <th><input type="checkbox"
              checked={filtered.length > 0 && filtered.every(s => selectedIds.has(s.id))}
              onChange={toggleSelectAllFiltered} /></th>
            <th>日付</th><th>荷主</th><th>積み地</th><th>下ろし先</th><th>重量(kg)</th><th>単価</th><th>スポット金額</th><th>税区分</th><th>確定金額</th>
          </tr></thead>
          <tbody>
            {filtered.map(s => {
              const p = findPrice(s);
              const amount = calcAmount(s);
              const isSpot = (s.manual_amount ?? 0) > 0;
              return (
                <tr key={s.id} className={selectedIds.has(s.id) ? "bg-blue-500/10" : isSpot ? "bg-amber-500/5" : ""}>
                  <td><input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)} /></td>
                  <td className="text-sm">{s.unload_date || s.load_date}</td>
                  <td className="text-sm">{s.client_name || "—"}</td>
                  <td className="text-sm">{s.load_place}</td>
                  <td className="text-sm">{s.unload_place}</td>
                  <td className="text-sm">{s.weight ? `${s.weight.toLocaleString()}kg` : "—"}</td>
                  <td className="text-sm text-muted">{isSpot ? <span className="text-xs text-amber-400">スポット</span> : (p.rate ? (p.type === "per_ton" ? `¥${p.rate}/t` : formatCurrency(p.rate)) : "—")}</td>
                  <td>
                    <input
                      type="number"
                      defaultValue={s.manual_amount ?? ""}
                      placeholder="直接入力"
                      className="bg-transparent border-b border-border text-sm w-28 outline-none focus:border-amber-400 text-right"
                      onBlur={e => updateManualAmount(s.id, e.target.value)}
                    />
                  </td>
                  <td>
                    <button onClick={() => toggleTaxIncluded(s)}
                      title="クリックで税別⇄税込を切替"
                      className={`text-xs px-2 py-0.5 rounded transition-colors ${s.tax_included ? "bg-emerald-500/15 text-emerald-400" : "bg-white/5 text-muted hover:text-white"}`}>
                      {s.tax_included ? "税込" : "税別"}
                    </button>
                  </td>
                  <td className="text-sm font-medium">{amount ? formatCurrency(amount) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={showIssuerModal} onClose={() => setShowIssuerModal(false)} title={`発行者情報（${issuerName}）`}>
        <form onSubmit={saveIssuerInfo} className="space-y-3">
          <div><label className="block text-xs text-muted mb-1">住所</label>
            <input type="text" value={issuerForm.address} onChange={e => setIssuerForm({ ...issuerForm, address: e.target.value })} className="w-full" placeholder="例: 愛知県名古屋市○○区○○ 1-2-3" /></div>
          <div><label className="block text-xs text-muted mb-1">電話番号</label>
            <input type="text" value={issuerForm.tel} onChange={e => setIssuerForm({ ...issuerForm, tel: e.target.value })} className="w-full" placeholder="例: 052-000-0000" /></div>
          <div><label className="block text-xs text-muted mb-1">インボイス登録番号</label>
            <input type="text" value={issuerForm.invoiceNo} onChange={e => setIssuerForm({ ...issuerForm, invoiceNo: e.target.value })} className="w-full" placeholder="例: T1234567890123" /></div>
          <div><label className="block text-xs text-muted mb-1">振込先</label>
            <input type="text" value={issuerForm.bank} onChange={e => setIssuerForm({ ...issuerForm, bank: e.target.value })} className="w-full" placeholder="例: ○○銀行 ○○支店 普通 1234567 ｶ)ﾅｶﾔﾏｼｮｳｼﾞ" /></div>
          <div><label className="block text-xs text-muted mb-1">支払期限の表記</label>
            <input type="text" value={issuerForm.dueText} onChange={e => setIssuerForm({ ...issuerForm, dueText: e.target.value })} className="w-full" placeholder="例: 翌月末日" /></div>
          <p className="text-xs text-muted">※ 入力した項目だけ請求書に表示されます（このブラウザに保存）</p>
          <button type="submit" className="w-full py-2.5 bg-white text-black text-sm rounded-md hover:bg-gray-200 mt-2">保存</button>
        </form>
      </Modal>
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
