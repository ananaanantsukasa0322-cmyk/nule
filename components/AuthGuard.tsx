"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { User, UserRole } from "@/types/database";
import Sidebar from "./Sidebar";

interface AuthGuardProps {
  children: ReactNode;
  allowedRoles?: UserRole[];
}

const defaultRedirect: Record<UserRole, string> = {
  admin: "/dashboard",
  office: "/dashboard",
  dispatcher: "/dispatch",
};

export default function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) throw new Error("未認証");
        return res.json();
      })
      .then((data) => {
        const u = data.user as User;
        if (allowedRoles && !allowedRoles.includes(u.role) && u.role !== "admin") {
          router.push(defaultRedirect[u.role]);
          return;
        }
        setUser(u);
      })
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router, allowedRoles]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-3xl font-extralight tracking-[0.3em] text-white mb-4">
            NULE
          </h1>
          <div className="w-8 h-8 border border-muted border-t-white rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen">
      <Sidebar userRole={user.role} userName={user.name} userEmail={user.email} />
      <main className="flex-1 p-6 md:p-8 overflow-y-auto min-h-screen">
        {children}
      </main>
    </div>
  );
}
