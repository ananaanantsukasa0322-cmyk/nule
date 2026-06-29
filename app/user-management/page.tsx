"use client";

import { useEffect, useState, useCallback } from "react";
import AuthGuard from "@/components/AuthGuard";
import Modal from "@/components/Modal";

interface User { id: string; email: string; name: string; role: string; }

function UserManagementContent() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [form, setForm] = useState({ email: "", name: "", role: "dispatcher" });

  const loadData = useCallback(async () => {
    const res = await fetch("/api/users");
    const data = await res.json();
    setUsers(data.users || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/users/invite", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "招待に失敗しました"); return; }
    setInviteUrl(data.invite_url);
    setForm({ email: "", name: "", role: "dispatcher" });
    loadData();
  }

  async function deleteUser(id: string) {
    if (!confirm("このユーザーを削除しますか？")) return;
    await fetch("/api/users", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadData();
  }

  const [showEdit, setShowEdit] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ email: "", password: "", name: "" });

  function openEdit(u: User) {
    setEditUser(u);
    setEditForm({ email: u.email, password: "", name: u.name });
    setShowEdit(true);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    const body: Record<string, string> = { id: editUser.id };
    if (editForm.email !== editUser.email) body.email = editForm.email;
    if (editForm.name !== editUser.name) body.name = editForm.name;
    if (editForm.password) body.password = editForm.password;
    const res = await fetch("/api/users/update", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "更新に失敗しました"); return; }
    setShowEdit(false);
    loadData();
  }

  const roleLabel: Record<string, string> = { admin: "管理者", office: "事務所", dispatcher: "配車係" };

  if (loading) return <div className="text-muted text-sm">読み込み中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-light">ユーザー管理</h2>
        <button onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-white text-black text-sm rounded-md hover:bg-gray-200">
          + ユーザー招待
        </button>
      </div>

      <div className="overflow-x-auto">
        <table>
          <thead><tr><th>名前</th><th>メールアドレス</th><th>権限</th><th>操作</th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td className="text-sm">{u.name}</td>
                <td className="text-sm text-muted">{u.email}</td>
                <td><span className="text-xs px-2 py-0.5 rounded bg-accent">{roleLabel[u.role] || u.role}</span></td>
                <td>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(u)} className="text-xs text-muted hover:text-white">編集</button>
                    {u.email === "test@test.com" ? <span className="text-xs text-muted">オーナー</span> :
                      <button onClick={() => deleteUser(u.id)} className="text-xs text-muted hover:text-danger">削除</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); setInviteUrl(""); }} title="ユーザー招待">
        {inviteUrl ? (
          <div className="space-y-4">
            <p className="text-sm text-success">招待リンクが生成されました</p>
            <div className="bg-accent p-3 rounded text-xs break-all select-all">{inviteUrl}</div>
            <p className="text-xs text-muted">このリンクを相手に送ってください。リンクからパスワードを設定してログインできます。</p>
            <button onClick={() => { navigator.clipboard.writeText(inviteUrl); alert("コピーしました"); }}
              className="w-full py-2.5 bg-white text-black text-sm rounded-md hover:bg-gray-200">リンクをコピー</button>
          </div>
        ) : (
          <form onSubmit={handleInvite} className="space-y-3">
            <div><label className="block text-xs text-muted mb-1">メールアドレス</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full" required /></div>
            <div><label className="block text-xs text-muted mb-1">名前（任意）</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full" placeholder="未入力ならメールから自動生成" /></div>
            <div><label className="block text-xs text-muted mb-1">権限</label>
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="w-full">
                <option value="admin">管理者</option>
                <option value="office">事務所</option>
                <option value="dispatcher">配車係</option>
              </select></div>
            <button type="submit" className="w-full py-2.5 bg-white text-black text-sm rounded-md hover:bg-gray-200 mt-4">招待リンク生成</button>
          </form>
        )}
      </Modal>

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="ユーザー編集">
        <form onSubmit={handleUpdate} className="space-y-3">
          <div><label className="block text-xs text-muted mb-1">名前</label>
            <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full" required /></div>
          <div><label className="block text-xs text-muted mb-1">メールアドレス</label>
            <input type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} className="w-full" required /></div>
          <div><label className="block text-xs text-muted mb-1">新しいパスワード（変更する場合のみ）</label>
            <input type="password" value={editForm.password} onChange={e => setEditForm({ ...editForm, password: e.target.value })} className="w-full" placeholder="変更しない場合は空欄" /></div>
          <button type="submit" className="w-full py-2.5 bg-white text-black text-sm rounded-md hover:bg-gray-200 mt-4">更新</button>
        </form>
      </Modal>
    </div>
  );
}

export default function UserManagementPage() {
  return (
    <AuthGuard allowedRoles={["admin"]}>
      <UserManagementContent />
    </AuthGuard>
  );
}
