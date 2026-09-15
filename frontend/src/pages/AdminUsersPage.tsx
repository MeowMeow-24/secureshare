import { useEffect, useState } from "react";
import { api } from "../services/api";
import PasswordStrengthMeter, { isPasswordAcceptable } from "../components/PasswordStrengthMeter";
import type { Department, User, UserRole } from "../types";

const emptyForm = { email: "", password: "", full_name: "", role: "user" as UserRole, department_id: "" };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = () => {
    api.listUsers().then(setUsers).catch(console.error);
    api.listDepartments().then(setDepartments).catch(console.error);
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!isPasswordAcceptable(form.password)) {
      setError("รหัสผ่านยังไม่ปลอดภัยพอ กรุณาทำตามคำแนะนำด้านล่างให้ครบก่อน");
      return;
    }
    setLoading(true);
    try {
      await api.register(form.email, form.password, form.full_name, form.role, form.department_id || null);
      setForm(emptyForm);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างผู้ใช้ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const handleDeptChange = async (userId: string, departmentId: string) => {
    await api.updateUser(userId, departmentId ? { department_id: departmentId } : { clear_department: true });
    load();
  };

  const handleRoleChange = async (userId: string, role: UserRole) => {
    await api.updateUser(userId, { role });
    load();
  };

  const handleToggleActive = async (u: User) => {
    await api.updateUser(u.id, { is_active: !u.is_active });
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">จัดการผู้ใช้งาน</h1>

      <div className="p-6 bg-white dark:bg-slate-900 shadow-sm shadow-slate-200/70 dark:shadow-none rounded-xl border border-slate-200 dark:border-slate-800 mb-10 max-w-lg">
        <h2 className="font-semibold mb-4">สร้างผู้ใช้ใหม่</h2>
        <form onSubmit={handleCreate} className="space-y-3">
          <input
            type="text"
            placeholder="ชื่อ-นามสกุล"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
            required
          />
          <input
            type="email"
            placeholder="อีเมล"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
            required
          />
          <div>
            <input
              type="password"
              placeholder="รหัสผ่านชั่วคราว"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
              required
            />
            <PasswordStrengthMeter password={form.password} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
              className="px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
            >
              <option value="user">พนักงาน</option>
              <option value="viewer">ผู้ดูไฟล์</option>
              <option value="admin">ผู้ดูแลระบบ</option>
            </select>
            <select
              value={form.department_id}
              onChange={(e) => setForm({ ...form, department_id: e.target.value })}
              className="px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
            >
              <option value="">ไม่ระบุแผนก</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-emerald-600 text-white hover:bg-emerald-500 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {loading ? "กำลังสร้าง..." : "สร้างผู้ใช้"}
          </button>
        </form>
      </div>

      <h2 className="font-semibold mb-4">ผู้ใช้งานทั้งหมด ({users.length})</h2>
      <div className="space-y-2">
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 shadow-sm shadow-slate-200/70 dark:shadow-none rounded-xl border border-slate-200 dark:border-slate-800">
            <div>
              <p className="font-medium">{u.full_name}</p>
              <p className="text-xs text-slate-500 mt-1">{u.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={u.role}
                onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                <option value="user">พนักงาน</option>
                <option value="viewer">ผู้ดูไฟล์</option>
                <option value="admin">ผู้ดูแลระบบ</option>
              </select>
              <select
                value={u.department_id ?? ""}
                onChange={(e) => handleDeptChange(u.id, e.target.value)}
                className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                <option value="">ไม่ระบุแผนก</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <button
                onClick={() => handleToggleActive(u)}
                className={`px-3 py-1 text-xs rounded-lg ${
                  u.is_active ? "text-red-600 dark:text-red-400 hover:bg-red-500/10" : "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                }`}
              >
                {u.is_active ? "ระงับการใช้งาน" : "เปิดใช้งาน"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
