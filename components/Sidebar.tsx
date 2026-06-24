"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { UserRole } from "@/types/database";

interface SidebarProps {
  userRole: UserRole;
  userName: string;
}

const adminLinks = [
  { href: "/dashboard", label: "ダッシュボード", icon: "◆" },
  { href: "/dispatch", label: "配車管理", icon: "◇" },
  { href: "/daily-reports", label: "日報管理", icon: "◈" },
  { href: "/sales", label: "売上・請求", icon: "◉" },
  { href: "/driver-management", label: "ドライバー管理", icon: "◎" },
  { href: "/masters/clients", label: "荷主マスタ", icon: "─" },
  { href: "/masters/routes", label: "ルートマスタ", icon: "─" },
  { href: "/masters/prices", label: "単価マスタ", icon: "─" },
  { href: "/masters/drivers", label: "ドライバーマスタ", icon: "─" },
];

const officeLinks = [
  { href: "/dashboard", label: "ダッシュボード", icon: "◆" },
  { href: "/daily-reports", label: "日報管理", icon: "◈" },
  { href: "/sales", label: "売上・請求", icon: "◉" },
  { href: "/driver-management", label: "ドライバー管理", icon: "◎" },
  { href: "/masters/clients", label: "荷主マスタ", icon: "─" },
  { href: "/masters/routes", label: "ルートマスタ", icon: "─" },
  { href: "/masters/prices", label: "単価マスタ", icon: "─" },
  { href: "/masters/drivers", label: "ドライバーマスタ", icon: "─" },
];

const dispatcherLinks = [
  { href: "/dispatch", label: "配車管理", icon: "◇" },
];

const roleLabel: Record<UserRole, string> = {
  admin: "管理者",
  office: "事務所",
  dispatcher: "配車係",
};

export default function Sidebar({ userRole, userName }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const links = userRole === "admin" ? adminLinks : userRole === "office" ? officeLinks : dispatcherLinks;

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <>
      <button
        className="md:hidden fixed top-4 left-4 z-50 bg-accent p-2 rounded"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? "✕" : "☰"}
      </button>

      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-56 bg-[#0f0f0f] border-r border-border flex flex-col transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="p-6 border-b border-border">
          <h1 className="text-2xl font-extralight tracking-[0.3em] text-white">
            NULE
          </h1>
          <p className="text-xs text-muted mt-1 font-light">運送業務管理</p>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          {links.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-6 py-2.5 text-sm font-light transition-colors ${
                  isActive
                    ? "text-white bg-accent border-r-2 border-white"
                    : "text-muted hover:text-white hover:bg-accent/50"
                }`}
              >
                <span className="text-xs">{link.icon}</span>
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <p className="text-xs text-muted mb-1">{userName}</p>
          <p className="text-xs text-muted/60 mb-3">{roleLabel[userRole]}</p>
          <button
            onClick={handleLogout}
            className="text-xs text-muted hover:text-danger transition-colors"
          >
            ログアウト
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </>
  );
}
