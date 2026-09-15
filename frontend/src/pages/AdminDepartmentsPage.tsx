import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { Department } from "../types";

export default function AdminDepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = () => api.listDepartments().then(setDepartments).catch(console.error);
  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.createDepartment(name, description);
      setName("");
      setDescription("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างแผนกไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("ยืนยันการลบแผนกนี้? แผนกต้องไม่มีสมาชิกเหลืออยู่")) return;
    try {
      await api.deleteDepartment(id);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "ลบแผนกไม่สำเร็จ");
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">แผนก</h1>

      <div className="p-6 bg-white dark:bg-slate-900 shadow-sm shadow-slate-200/70 dark:shadow-none rounded-xl border border-slate-200 dark:border-slate-800 mb-10 max-w-lg">
        <h2 className="font-semibold mb-4">สร้างแผนกใหม่</h2>
        <form onSubmit={handleCreate} className="space-y-3">
          <input
            type="text"
            placeholder="ชื่อแผนก (เช่น การเงิน)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
            required
          />
          <input
            type="text"
            placeholder="คำอธิบาย (ไม่บังคับ)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
          />
          {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading || !name}
            className="w-full py-2 bg-emerald-600 text-white hover:bg-emerald-500 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {loading ? "กำลังสร้าง..." : "สร้างแผนก"}
          </button>
        </form>
      </div>

      <h2 className="font-semibold mb-4">แผนกทั้งหมด ({departments.length})</h2>
      <div className="space-y-2">
        {departments.map((d) => (
          <div key={d.id} className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 shadow-sm shadow-slate-200/70 dark:shadow-none rounded-xl border border-slate-200 dark:border-slate-800">
            <div>
              <p className="font-medium">{d.name}</p>
              <p className="text-xs text-slate-500 mt-1">
                {d.member_count} สมาชิก
                {d.description && ` · ${d.description}`}
              </p>
            </div>
            <button onClick={() => handleDelete(d.id)} className="text-sm text-red-600 dark:text-red-400 hover:underline">
              ลบ
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
