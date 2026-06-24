"use client";

import AuthGuard from "@/components/AuthGuard";

function DispatchContent() {
  return (
    <div className="-m-6 md:-m-8">
      <iframe
        src="/api/dispatch-tool"
        className="w-full border-none"
        style={{ height: "calc(100vh - 0px)" }}
      />
    </div>
  );
}

export default function DispatchPage() {
  return (
    <AuthGuard allowedRoles={["admin", "dispatcher"]}>
      <DispatchContent />
    </AuthGuard>
  );
}
