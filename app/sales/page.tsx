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
  tax_included?: boolean; toll_amount?: number; ai_tsumi?: boolean; ai_tsumi_group?: string | null;
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
  const [tollAmount, setTollAmount] = useState("");

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
      if (num) {
        const digits = num.match(/\d+/g)?.join("") || "";
        vmap[veh.id] = digits ? digits.slice(-4) : num;
      }
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
      // 常用（daily）は目安表示専用で自動計算には使わない
      return prices.find(p => p.price_type !== "daily" && matchFn(p) && p.vehicle_type === vt)
        || prices.find(p => p.price_type !== "daily" && matchFn(p) && !p.vehicle_type);
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

  async function updateTollAmount(id: string, value: string) {
    const amount = value === "" ? null : Number(value);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      show("高速代は0以上の数値を入力してください", "error");
      return;
    }
    const before = schedules.find(s => s.id === id)?.toll_amount ?? null;
    if ((before ?? null) === (amount ?? null)) return;
    const res = await fetch(`/api/schedules/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toll_amount: amount }),
    });
    if (res.ok) show(amount === null ? "高速代を解除しました" : `高速代 ${formatCurrency(amount)} を保存しました`);
    else show("高速代の保存に失敗しました", "error");
    loadData();
  }

  const clients = [...new Set(schedules.map(s => s.client_name).filter(Boolean) as string[])].sort();
  const filtered = clientFilter ? schedules.filter(s => s.client_name === clientFilter) : schedules;
  const totalAmount = filtered.reduce((sum, s) => sum + calcAmount(s), 0);
  const selectedRows = schedules.filter(s => selectedIds.has(s.id));
  const selectedTotal = selectedRows.reduce((sum, s) => sum + calcAmount(s), 0);
  const selectedTaxable = selectedRows.filter(s => !s.tax_included).reduce((sum, s) => sum + calcAmount(s), 0);
  const selectedGrandTotal = selectedTaxable + Math.round(selectedTaxable * 0.1) + (selectedTotal - selectedTaxable);

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

    // 相積みグループ（ai_tsumi_group）は請求書上1行にまとめる（積み地・下ろし先は「・」で連結）
    type InvoiceLine = {
      date: string; loadPlace: string; unloadPlace: string; weight: number;
      isSpot: boolean; priceStr: string; amount: number; taxIncluded: boolean; toll: number; vehicleId?: string;
    };
    const seenGroups = new Set<string>();
    const lines: InvoiceLine[] = [];
    for (const s of items) {
      if (s.ai_tsumi && s.ai_tsumi_group) {
        if (seenGroups.has(s.ai_tsumi_group)) continue;
        seenGroups.add(s.ai_tsumi_group);
        const grp = items.filter(x => x.ai_tsumi_group === s.ai_tsumi_group);
        const loadPlace = [...new Set(grp.map(x => x.load_place).filter(Boolean))].join("・");
        const unloadPlace = [...new Set(grp.map(x => x.unload_place).filter(Boolean))].join("・");
        const weight = grp.reduce((sum, x) => sum + (x.weight || 0), 0);
        const amount = grp.reduce((sum, x) => sum + calcAmount(x), 0);
        const isSpot = grp.some(x => (x.manual_amount ?? 0) > 0);
        const p = findPrice(grp[0]);
        lines.push({
          date: grp[0].unload_date || grp[0].load_date,
          loadPlace, unloadPlace, weight, isSpot,
          priceStr: isSpot ? "スポット" : (p.rate ? (p.type === "per_ton" ? `¥${p.rate.toLocaleString()}/t` : `¥${p.rate.toLocaleString()}`) : "-"),
          amount,
          taxIncluded: !!grp[0].tax_included,
          toll: grp.reduce((sum, x) => sum + (x.toll_amount || 0), 0),
          vehicleId: grp[0].vehicle_id,
        });
      } else {
        const p = findPrice(s);
        const isSpot = (s.manual_amount ?? 0) > 0;
        lines.push({
          date: s.unload_date || s.load_date,
          loadPlace: s.load_place || "", unloadPlace: s.unload_place || "", weight: s.weight || 0, isSpot,
          priceStr: isSpot ? "スポット" : (p.rate ? (p.type === "per_ton" ? `¥${p.rate.toLocaleString()}/t` : `¥${p.rate.toLocaleString()}`) : "-"),
          amount: calcAmount(s),
          taxIncluded: !!s.tax_included,
          toll: s.toll_amount || 0,
          vehicleId: s.vehicle_id,
        });
      }
    }

    const hasTaxIncludedRows = taxEnabled && lines.some(l => l.taxIncluded);
    const hasTollRows = lines.some(l => l.toll > 0);

    // 明細行数に応じてフォント・余白を自動で詰め、1ページに収まりやすくする
    const rowCount = lines.length;
    const scale = rowCount <= 15 ? "normal" : rowCount <= 25 ? "compact" : rowCount <= 40 ? "tight" : "min";
    const S = {
      normal: { body: 12, h1: 26, h1mb: 20, headmb: 16, td: "5px 7px", th: "6px 7px", tblFs: 12, sumFs: 12, sumTotalFs: 15, footFs: 11, amtVal: 22, cname: 17, bodyPad: 14, tableMt: 8, summaryMt: 8, sumPad: 2, footMt: 10 },
      compact:{ body: 11, h1: 22, h1mb: 14, headmb: 12, td: "3px 6px", th: "4px 6px", tblFs: 11, sumFs: 11, sumTotalFs: 14, footFs: 10, amtVal: 20, cname: 16, bodyPad: 12, tableMt: 6, summaryMt: 6, sumPad: 1, footMt: 8 },
      tight:  { body: 9,  h1: 16, h1mb: 6,  headmb: 6,  td: "1px 4px", th: "1px 4px", tblFs: 9,  sumFs: 9,  sumTotalFs: 12, footFs: 8,  amtVal: 15, cname: 13, bodyPad: 8,  tableMt: 4, summaryMt: 4, sumPad: 0, footMt: 5 },
      min:    { body: 8,  h1: 14, h1mb: 5,  headmb: 5,  td: "0px 3px", th: "1px 3px", tblFs: 8,  sumFs: 8,  sumTotalFs: 11, footFs: 7,  amtVal: 13, cname: 12, bodyPad: 6,  tableMt: 3, summaryMt: 3, sumPad: 0, footMt: 4 },
    }[scale];
    const cellFs = Math.max(7, S.tblFs - 1);

    let taxableSubtotal = 0;   // 税別（10%加算対象）
    let includedSubtotal = 0;  // 税込（そのまま）
    let grandWeight = 0;
    let itemTollTotal = 0;     // 配車ごとに記録された高速代の合計
    const rows = lines.map(l => {
      if (taxEnabled && l.taxIncluded) includedSubtotal += l.amount;
      else taxableSubtotal += l.amount;
      grandWeight += l.weight;
      itemTollTotal += l.toll;
      const weightT = l.weight ? l.weight.toLocaleString() : "-";
      const taxCell = hasTaxIncludedRows
        ? `<td style="text-align:center;font-size:${cellFs}px">${l.taxIncluded ? "税込" : "税別"}</td>`
        : "";
      const vehicleCell = showVehicleNo
        ? `<td style="font-size:${cellFs}px;white-space:nowrap">${(l.vehicleId && vehicleMap[l.vehicleId]) || "-"}</td>`
        : "";
      const tollCell = hasTollRows
        ? `<td style="text-align:right;font-size:${cellFs}px">${l.toll ? `¥${l.toll.toLocaleString()}` : "-"}</td>`
        : "";
      return `<tr>
        <td>${l.date}</td>${vehicleCell}<td>${l.loadPlace}</td><td>${l.unloadPlace}</td>
        <td style="text-align:right">${weightT}</td><td style="text-align:right">${l.priceStr}</td>
        ${taxCell}
        <td style="text-align:right">${l.amount ? `¥${l.amount.toLocaleString()}` : "-"}</td>
        ${tollCell}
      </tr>`;
    }).join("");

    const tax = taxEnabled ? Math.round(taxableSubtotal * 0.1) : 0;
    const extraToll = Math.max(0, Number(tollAmount) || 0);
    const toll = itemTollTotal + extraToll;
    const total = taxableSubtotal + tax + includedSubtotal + toll;
    const tollRow = toll > 0
      ? `<div class="summary-row"><span>高速代${itemTollTotal > 0 && extraToll > 0 ? `（配車分¥${itemTollTotal.toLocaleString()}＋追加¥${extraToll.toLocaleString()}）` : ""}</span><span>¥${toll.toLocaleString()}</span></div>`
      : "";

    let taxRows: string;
    if (taxEnabled && hasTaxIncludedRows) {
      taxRows = `<div class="summary-row"><span>課税分 小計（税抜）</span><span>¥${taxableSubtotal.toLocaleString()}</span></div>
         <div class="summary-row"><span>消費税（10%）</span><span>¥${tax.toLocaleString()}</span></div>
         <div class="summary-row"><span>税込分 小計</span><span>¥${includedSubtotal.toLocaleString()}</span></div>
         ${tollRow}
         <div class="summary-row summary-total"><span>合計金額（税込）</span><span>¥${total.toLocaleString()}</span></div>`;
    } else if (taxEnabled) {
      taxRows = `<div class="summary-row"><span>小計（税抜）</span><span>¥${taxableSubtotal.toLocaleString()}</span></div>
         <div class="summary-row"><span>消費税（10%）</span><span>¥${tax.toLocaleString()}</span></div>
         ${tollRow}
         <div class="summary-row summary-total"><span>合計金額（税込）</span><span>¥${total.toLocaleString()}</span></div>`;
    } else {
      taxRows = `${tollRow}
         <div class="summary-row summary-total"><span>合計金額</span><span>¥${total.toLocaleString()}</span></div>`;
    }
    const taxHeaderCell = hasTaxIncludedRows ? `<th style="text-align:center">税区分</th>` : "";
    const vehicleHeaderCell = showVehicleNo ? `<th>車番</th>` : "";
    const tollHeaderCell = hasTollRows ? `<th style="text-align:right">高速代</th>` : "";

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>請求書 - ${formalName}</title>
      <style>
        @media print { body { margin: 0; } @page { margin: 8mm; size: A4; } }
        body { font-family: "Hiragino Kaku Gothic Pro", "Yu Gothic", "Meiryo", sans-serif; color: #111; padding: ${S.bodyPad}px; max-width: 800px; margin: 0 auto; font-size: ${S.body}px; line-height: 1.3; }
        h1 { text-align: center; font-size: ${S.h1}px; letter-spacing: 0.4em; margin-bottom: ${S.h1mb}px; border-bottom: 3px double #333; padding-bottom: ${Math.min(8, S.h1mb)}px; }
        .meta { text-align: right; font-size: ${S.footFs}px; color: #555; margin-bottom: ${Math.min(6, S.headmb)}px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: ${S.headmb}px; }
        .header-left { font-size: ${S.body}px; }
        .header-right { text-align: right; font-size: ${S.footFs}px; line-height: 1.4; }
        .client-name { font-size: ${S.cname}px; font-weight: bold; border-bottom: 1px solid #333; padding-bottom: 2px; margin-bottom: 3px; }
        .issuer-name { font-size: ${S.cname - 3}px; font-weight: bold; }
        .amount-box { display: inline-block; border: 2px solid #333; padding: 4px 16px; margin: 3px 0 2px; }
        .amount-box .label { font-size: ${S.footFs}px; color: #555; margin-bottom: 1px; }
        .amount-box .value { font-size: ${S.amtVal}px; font-weight: bold; letter-spacing: 1px; }
        table { width: 100%; border-collapse: collapse; font-size: ${S.tblFs}px; margin-top: ${S.tableMt}px; }
        th { background: #f5f5f5; border: 1px solid #ccc; padding: ${S.th}; text-align: left; font-weight: bold; }
        td { border: 1px solid #ccc; padding: ${S.td}; }
        .summary { margin-top: ${S.summaryMt}px; border-top: 2px solid #333; page-break-inside: avoid; }
        .summary-row { display: flex; justify-content: flex-end; gap: 24px; padding: ${S.sumPad}px 4px; font-size: ${S.sumFs}px; }
        .summary-total { font-size: ${S.sumTotalFs}px; font-weight: bold; border-top: 1px solid #ccc; padding-top: 3px; margin-top: 1px; }
        .footer { margin-top: ${S.footMt}px; padding: 4px 8px; background: #f8f8f8; border: 1px solid #ddd; font-size: ${S.footFs}px; line-height: 1.4; page-break-inside: avoid; }
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
          <div style="font-size:${S.footFs}px;color:#555">下記の通りご請求申し上げます。</div>
          <div style="font-size:${S.footFs}px;color:#555">対象期間: ${dateFrom} ～ ${dateTo}</div>
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
        <thead><tr><th>日付</th>${vehicleHeaderCell}<th>積み地</th><th>下ろし先</th><th style="text-align:right">重量(kg)</th><th style="text-align:right">単価</th>${taxHeaderCell}<th style="text-align:right">金額</th>${tollHeaderCell}</tr></thead>
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
        <div><label className="block text-xs text-muted mb-1">追加の高速代（任意・配車ごとの記録に上乗せ）</label>
          <input type="number" min="0" step="1" value={tollAmount} onChange={e => setTollAmount(e.target.value)}
            placeholder="例: 15000" className="w-32" /></div>
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
            <th>日付</th><th>荷主</th><th>積み地</th><th>下ろし先</th><th>重量(kg)</th><th>単価</th><th>スポット金額</th><th>高速代</th><th>税区分</th><th>確定金額</th>
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
                    <input
                      type="number"
                      defaultValue={s.toll_amount ?? ""}
                      placeholder="例: 2500"
                      className="bg-transparent border-b border-border text-sm w-24 outline-none focus:border-amber-400 text-right"
                      onBlur={e => updateTollAmount(s.id, e.target.value)}
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
