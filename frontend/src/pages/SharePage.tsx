import { Check, ChevronDown, Copy, Link2, X } from "lucide-react";
import { useEffect, useState } from "react";
import FileIcon from "../components/FileIcon";
import { api } from "../services/api";
import type {
  Department,
  DepartmentShare,
  DepartmentShareClaimRequest,
  FileItem,
  ShareLink,
  ShareMode,
  SharePermission,
} from "../types";

const permissionLabels: Record<SharePermission, string> = {
  download: "โหลดไฟล์ได้",
  view_only: "ดูอย่างเดียว (โหลดไม่ได้)",
};

// แผงคำขอเข้าถึงของ share หนึ่งรายการ — กางออกมาเมื่อกดดู มีปุ่มอนุมัติ/ปฏิเสธให้ในตัว
function RequestsPanel({ shareId, onDecided }: { shareId: string; onDecided: () => void }) {
  const [requests, setRequests] = useState<DepartmentShareClaimRequest[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    api.listShareRequests(shareId).then(setRequests).catch(console.error);
  }, [shareId]);

  const decide = async (claimId: string, approve: boolean) => {
    setBusyId(claimId);
    try {
      if (approve) await api.approveShareRequest(claimId);
      else await api.rejectShareRequest(claimId);
      setRequests(await api.listShareRequests(shareId));
      onDecided();
    } catch (err) {
      alert(err instanceof Error ? err.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  };

  if (requests === null) return <p className="text-xs text-slate-500 py-2">กำลังโหลด...</p>;
  if (requests.length === 0) return <p className="text-xs text-slate-500 py-2">ยังไม่มีคนขอเข้าถึง</p>;

  return (
    <div className="space-y-1.5 py-2">
      {requests.map((r) => (
        <div key={r.id} className="flex items-center gap-2 text-xs">
          <div className="min-w-0 flex-1">
            <p className="truncate">{r.user_name}</p>
            <p className="text-slate-500 truncate">{r.user_email}</p>
          </div>
          {r.status === "pending" ? (
            <div className="flex gap-1 shrink-0">
              <button
                onClick={() => decide(r.id, true)}
                disabled={busyId === r.id}
                title="อนุมัติ"
                className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50"
              >
                <Check size={13} />
              </button>
              <button
                onClick={() => decide(r.id, false)}
                disabled={busyId === r.id}
                title="ปฏิเสธ"
                className="p-1.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 disabled:opacity-50"
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <span
              className={`shrink-0 px-2 py-0.5 rounded-full ${
                r.status === "approved"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-red-500/10 text-red-600 dark:text-red-400"
              }`}
            >
              {r.status === "approved" ? "อนุมัติแล้ว" : "ปฏิเสธแล้ว"}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function SharePage() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [isOneTime, setIsOneTime] = useState(false);
  const [expiresHours, setExpiresHours] = useState("");
  const [createdLink, setCreatedLink] = useState<ShareLink | null>(null);
  const [loading, setLoading] = useState(false);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptShares, setDeptShares] = useState<DepartmentShare[]>([]);
  const [deptFile, setDeptFile] = useState("");
  const [deptId, setDeptId] = useState("");
  const [deptMode, setDeptMode] = useState<ShareMode>("open");
  const [deptPermission, setDeptPermission] = useState<SharePermission>("download");
  const [deptLoading, setDeptLoading] = useState(false);
  const [expandedShareId, setExpandedShareId] = useState<string | null>(null);

  const loadDeptShares = () => api.listMyDepartmentShares().then(setDeptShares).catch(console.error);

  useEffect(() => {
    api.listFiles().then(setFiles).catch(console.error);
    api.listShareLinks().then(setLinks).catch(console.error);
    api.listDepartments().then(setDepartments).catch(console.error);
    loadDeptShares();
  }, []);

  const handleCreate = async () => {
    if (!selectedFile) return;
    setLoading(true);
    try {
      const expires_at = expiresHours
        ? new Date(Date.now() + Number(expiresHours) * 3600000).toISOString()
        : undefined;
      const link = await api.createShareLink(selectedFile, expires_at, isOneTime);
      setCreatedLink(link);
      setLinks(await api.listShareLinks());
    } catch (err) {
      alert(err instanceof Error ? err.message : "สร้างลิงก์ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (id: string) => {
    await api.revokeShareLink(id);
    setLinks(await api.listShareLinks());
  };

  const handleDeptShare = async () => {
    if (!deptFile || !deptId) return;
    setDeptLoading(true);
    try {
      await api.createDepartmentShare(deptFile, deptId, deptMode, deptPermission);
      await loadDeptShares();
    } catch (err) {
      alert(err instanceof Error ? err.message : "แชร์ไปยังแผนกไม่สำเร็จ");
    } finally {
      setDeptLoading(false);
    }
  };

  const handleDeptRevoke = async (id: string) => {
    await api.revokeDepartmentShare(id);
    await loadDeptShares();
  };

  const toggleExpanded = (id: string) => setExpandedShareId((cur) => (cur === id ? null : id));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">การแชร์</h1>

      <div className="grid md:grid-cols-2 gap-6 mb-10">
        <div className="p-6 bg-white dark:bg-slate-900 shadow-sm shadow-slate-200/70 dark:shadow-none rounded-xl border border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold mb-4">สร้างลิงก์แชร์</h2>
          <p className="text-xs text-slate-500 mb-4">
            ใครก็ตามที่มีลิงก์นี้สามารถดาวน์โหลดได้ทันที ไม่ต้องล็อกอิน เหมาะสำหรับแชร์ให้บุคคลภายนอกหรือใช้ครั้งเดียว
          </p>
          <div className="space-y-3">
            <select
              value={selectedFile}
              onChange={(e) => setSelectedFile(e.target.value)}
              className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
            >
              <option value="">เลือกไฟล์...</option>
              {files.map((f) => (
                <option key={f.id} value={f.id}>{f.original_filename}</option>
              ))}
            </select>
            <input
              type="number"
              placeholder="หมดอายุใน (ชั่วโมง, ไม่บังคับ)"
              value={expiresHours}
              onChange={(e) => setExpiresHours(e.target.value)}
              className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
            />
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <input type="checkbox" checked={isOneTime} onChange={(e) => setIsOneTime(e.target.checked)} />
              ดาวน์โหลดได้ครั้งเดียว
            </label>
            <button
              onClick={handleCreate}
              disabled={loading || !selectedFile}
              className="w-full py-2 bg-emerald-600 text-white hover:bg-emerald-500 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {loading ? "กำลังสร้าง..." : "สร้างลิงก์ + QR โค้ด"}
            </button>
          </div>

          {createdLink && (
            <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">ลิงก์แชร์</p>
              <p className="text-xs break-all text-emerald-600 dark:text-emerald-400 mb-4">{createdLink.share_url}</p>
              <img
                src={`data:image/png;base64,${createdLink.qr_code_base64}`}
                alt="คิวอาร์โค้ด"
                className="w-40 h-40 mx-auto bg-white p-2 rounded-lg"
              />
            </div>
          )}
        </div>

        <div className="p-6 bg-white dark:bg-slate-900 shadow-sm shadow-slate-200/70 dark:shadow-none rounded-xl border border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold mb-4">แชร์ไปยังแผนก</h2>
          <p className="text-xs text-slate-500 mb-4">
            เฉพาะสมาชิกที่ล็อกอินอยู่ในแผนกที่เลือกเท่านั้นที่เข้าถึงได้ ระบบตรวจสอบสิทธิ์ทุกครั้ง ไม่ใช่ลิงก์แบบเปิดสาธารณะ
          </p>
          <div className="space-y-3">
            <select
              value={deptFile}
              onChange={(e) => setDeptFile(e.target.value)}
              className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
            >
              <option value="">เลือกไฟล์...</option>
              {files.map((f) => (
                <option key={f.id} value={f.id}>{f.original_filename}</option>
              ))}
            </select>
            <select
              value={deptId}
              onChange={(e) => setDeptId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
            >
              <option value="">เลือกแผนก...</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.member_count} สมาชิก)</option>
              ))}
            </select>

            <div>
              <p className="text-xs text-slate-500 mb-1.5">การเข้าถึง</p>
              <div className="flex flex-col gap-1.5 text-sm">
                <label className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <input type="radio" name="deptMode" checked={deptMode === "open"} onChange={() => setDeptMode("open")} />
                  เปิดทันที — เห็นได้เลย
                </label>
                <label className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <input
                    type="radio"
                    name="deptMode"
                    checked={deptMode === "claim_required"}
                    onChange={() => setDeptMode("claim_required")}
                  />
                  ต้องขอสิทธิ์ก่อน — ฉันอนุมัติทีละคน
                </label>
              </div>
            </div>

            <div>
              <p className="text-xs text-slate-500 mb-1.5">สิทธิ์ที่ให้</p>
              <div className="flex flex-col gap-1.5 text-sm">
                <label className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <input
                    type="radio"
                    name="deptPermission"
                    checked={deptPermission === "download"}
                    onChange={() => setDeptPermission("download")}
                  />
                  โหลดไฟล์ได้
                </label>
                <label className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <input
                    type="radio"
                    name="deptPermission"
                    checked={deptPermission === "view_only"}
                    onChange={() => setDeptPermission("view_only")}
                  />
                  ดูอย่างเดียว (เห็นว่ามีไฟล์นี้ แต่โหลดไม่ได้)
                </label>
              </div>
            </div>

            <button
              onClick={handleDeptShare}
              disabled={deptLoading || !deptFile || !deptId}
              className="w-full py-2 bg-emerald-600 text-white hover:bg-emerald-500 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {deptLoading ? "กำลังแชร์..." : "แชร์ไปยังแผนก"}
            </button>
          </div>

          {deptShares.length > 0 && (
            <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-500 mb-2">แชร์ไปแล้ว ({deptShares.length})</p>
              {/* จำกัดความสูงแล้วให้เลื่อนดูได้แทนปล่อยให้ยาวลงเรื่อยๆ ตอนแชร์ไปหลายไฟล์ */}
              <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                {deptShares.map((s) => (
                  <div key={s.id} className="bg-slate-50 dark:bg-slate-800/60 rounded-lg text-sm">
                    <div className="flex items-center gap-2 p-2.5">
                      <FileIcon mimeType="" filename={s.filename} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-slate-700 dark:text-slate-300 truncate">{s.filename}</p>
                        <p className="text-xs text-slate-500 truncate">
                          → {s.department_name} · {permissionLabels[s.permission]}
                        </p>
                      </div>
                      {s.mode === "claim_required" && s.pending_count > 0 && (
                        <button
                          onClick={() => toggleExpanded(s.id)}
                          className="shrink-0 flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
                        >
                          รออนุมัติ {s.pending_count}
                          <ChevronDown size={11} className={expandedShareId === s.id ? "rotate-180" : ""} />
                        </button>
                      )}
                      <span
                        className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full ${
                          !s.is_active
                            ? "bg-slate-200 dark:bg-slate-700 text-slate-500"
                            : s.mode === "open"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        }`}
                      >
                        {!s.is_active ? "เพิกถอนแล้ว" : s.mode === "open" ? "เปิดทันที" : `อนุมัติแล้ว ${s.claim_count - s.pending_count}`}
                      </span>
                      {s.is_active && (
                        <button
                          onClick={() => handleDeptRevoke(s.id)}
                          title="เพิกถอน"
                          className="shrink-0 p-1 rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    {expandedShareId === s.id && (
                      <div className="px-2.5 pb-2 border-t border-slate-200 dark:border-slate-700">
                        <RequestsPanel shareId={s.id} onDecided={loadDeptShares} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <h2 className="font-semibold mb-4">ลิงก์ที่ใช้งานอยู่ ({links.length})</h2>
      {links.length === 0 ? (
        <p className="text-slate-500 text-sm">ยังไม่มีลิงก์แชร์ที่สร้างไว้</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {links.map((l, i) => (
            <div
              key={l.id}
              className="animate-list-item flex flex-col gap-2 p-4 bg-white dark:bg-slate-900 shadow-sm shadow-slate-200/70 dark:shadow-none rounded-xl border border-slate-200 dark:border-slate-800"
              style={{ animationDelay: `${i * 35}ms` }}
            >
              <div className="flex items-center gap-2">
                <Link2 size={15} className="text-slate-400 shrink-0" />
                <p className="text-sm font-mono text-slate-700 dark:text-slate-300 truncate">{l.token.slice(0, 16)}...</p>
                <button
                  onClick={() => navigator.clipboard.writeText(l.share_url)}
                  title="คัดลอกลิงก์"
                  className="ml-auto shrink-0 p-1 rounded text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-500/10"
                >
                  <Copy size={14} />
                </button>
              </div>
              <p className="text-xs text-slate-500">
                ดาวน์โหลดแล้ว: {l.download_count} ครั้ง
                {l.is_one_time && " · ใช้ได้ครั้งเดียว"}
                {l.expires_at && ` · หมดอายุ ${new Date(l.expires_at).toLocaleDateString("th-TH")}`}
              </p>
              <div className="flex items-center justify-between mt-1">
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full ${
                    l.is_active
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-slate-200 dark:bg-slate-700 text-slate-500"
                  }`}
                >
                  {l.is_active ? "ใช้งานอยู่" : "ถูกเพิกถอนแล้ว"}
                </span>
                {l.is_active && (
                  <button onClick={() => handleRevoke(l.id)} className="text-xs text-red-600 dark:text-red-400 hover:underline">
                    เพิกถอน
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
