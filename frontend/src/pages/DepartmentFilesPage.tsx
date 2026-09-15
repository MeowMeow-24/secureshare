import { Clock, Download, Eye, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import FileIcon from "../components/FileIcon";
import ViewModeToggle, { type ViewMode } from "../components/ViewModeToggle";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import type { DepartmentShare } from "../types";

// การ์ดไฟล์แผนก 1 ใบ — คำนวณเองว่าควรโชว์ปุ่ม/ป้ายสถานะแบบไหน จากสถานะ mode/permission/my_claim_status ของ share นั้น
// (ต่างจากเดิมที่แบ่งกลุ่มแล้วส่ง action ตายตัวมาจากข้างนอก เพราะตอนนี้มีสถานะย่อยเยอะขึ้น: ยังไม่ขอ/รอ/อนุมัติ/ปฏิเสธ/ดูอย่างเดียว)
function ShareCard({
  share,
  viewMode,
  busy,
  onRequest,
  onDownload,
  index,
}: {
  share: DepartmentShare;
  viewMode: ViewMode;
  busy: boolean;
  onRequest: () => void;
  onDownload: () => void;
  index: number;
}) {
  const needsRequest = share.mode === "claim_required" && share.my_claim_status === null;
  const isPending = share.mode === "claim_required" && share.my_claim_status === "pending";
  const isRejected = share.mode === "claim_required" && share.my_claim_status === "rejected";
  const isReady =
    share.mode === "open" || (share.mode === "claim_required" && share.my_claim_status === "approved");
  const isViewOnly = share.permission === "view_only";

  let action: React.ReactNode;
  if (isPending) {
    action = (
      <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
        <Clock size={13} /> รอการอนุมัติ
      </span>
    );
  } else if (isRejected) {
    action = <span className="text-xs text-red-500 dark:text-red-400">คำขอถูกปฏิเสธ</span>;
  } else if (needsRequest) {
    action = (
      <button
        onClick={onRequest}
        disabled={busy}
        className="px-3 py-1.5 text-sm rounded-lg disabled:opacity-50 bg-emerald-600 text-white hover:bg-emerald-500"
      >
        {busy ? "..." : "ขอเข้าถึงไฟล์"}
      </button>
    );
  } else if (isReady && isViewOnly) {
    action = (
      <span className="flex items-center gap-1.5 text-xs text-slate-500">
        <Eye size={13} /> ดูได้อย่างเดียว
      </span>
    );
  } else if (isReady) {
    action = (
      <button
        onClick={onDownload}
        disabled={busy}
        className="px-3 py-1.5 text-sm rounded-lg disabled:opacity-50 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
      >
        {busy ? "..." : "ดาวน์โหลด"}
      </button>
    );
  }

  if (viewMode === "list") {
    return (
      <div
        className="animate-list-item flex items-center gap-3 p-4 bg-white dark:bg-slate-900 shadow-sm shadow-slate-200/70 dark:shadow-none rounded-xl border border-slate-200 dark:border-slate-800"
        style={{ animationDelay: `${index * 35}ms` }}
      >
        <FileIcon mimeType="" filename={share.filename} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{share.filename}</p>
          <p className="text-xs text-slate-500 mt-1">
            แชร์โดย {share.created_by_name} · {new Date(share.created_at).toLocaleDateString("th-TH")}
            {share.expires_at && ` · หมดอายุ ${new Date(share.expires_at).toLocaleDateString("th-TH")}`}
          </p>
        </div>
        <div className="shrink-0">{action}</div>
      </div>
    );
  }

  return (
    <div
      className="animate-list-item flex flex-col items-center text-center p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm shadow-slate-200/70 dark:shadow-none"
      style={{ animationDelay: `${index * 35}ms` }}
    >
      <FileIcon mimeType="" filename={share.filename} size={viewMode === "grid-lg" ? "lg" : "md"} />
      <p className="mt-3 text-sm font-medium w-full truncate" title={share.filename}>{share.filename}</p>
      <p className="text-xs text-slate-500 mt-1 truncate w-full">โดย {share.created_by_name}</p>
      <div className="mt-3">{action}</div>
    </div>
  );
}

function ShareGrid({
  shares,
  viewMode,
  busyId,
  onRequest,
  onDownload,
}: {
  shares: DepartmentShare[];
  viewMode: ViewMode;
  busyId: string | null;
  onRequest: (share: DepartmentShare) => void;
  onDownload: (share: DepartmentShare) => void;
}) {
  const containerClass =
    viewMode === "list"
      ? "space-y-2"
      : `grid gap-3 ${viewMode === "grid-lg" ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6"}`;

  return (
    <div className={containerClass}>
      {shares.map((s, i) => (
        <ShareCard
          key={s.id}
          share={s}
          viewMode={viewMode}
          busy={busyId === s.id}
          onRequest={() => onRequest(s)}
          onDownload={() => onDownload(s)}
          index={i}
        />
      ))}
    </div>
  );
}

export default function DepartmentFilesPage() {
  const { user } = useAuth();
  const [shares, setShares] = useState<DepartmentShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem("dept_files_view_mode") as ViewMode | null) ?? "list"
  );

  const load = () =>
    api
      .listDepartmentInbox()
      .then(setShares)
      .catch(console.error)
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem("dept_files_view_mode", mode);
  };

  const handleRequest = async (share: DepartmentShare) => {
    setBusyId(share.id);
    try {
      await api.claimDepartmentShare(share.id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "ส่งคำขอไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  };

  const handleDownload = async (share: DepartmentShare) => {
    setBusyId(share.id);
    try {
      const res = await api.downloadDepartmentShare(share.id);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        alert(body?.detail || "ดาวน์โหลดไม่สำเร็จ");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = share.filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusyId(null);
    }
  };

  // ค้นหาแบบง่ายๆ กรองจากชื่อไฟล์ฝั่ง frontend เหมือนหน้า "ไฟล์ของฉัน"
  const filteredShares = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return shares;
    return shares.filter((s) => s.filename.toLowerCase().includes(q));
  }, [shares, search]);

  // แบ่งกลุ่มตามสถานะคำขอ: ต้องขอก่อน / รอผล / พร้อมใช้งานแล้ว (ทั้งโหลดได้และดูอย่างเดียว)
  const needsRequest = filteredShares.filter((s) => s.mode === "claim_required" && s.my_claim_status === null);
  const awaitingDecision = filteredShares.filter(
    (s) => s.mode === "claim_required" && (s.my_claim_status === "pending" || s.my_claim_status === "rejected")
  );
  const ready = filteredShares.filter(
    (s) => s.mode === "open" || (s.mode === "claim_required" && s.my_claim_status === "approved")
  );

  if (!user?.department_id) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">ไฟล์แผนก</h1>
        <p className="text-slate-500">
          บัญชีของคุณยังไม่ถูกกำหนดแผนก — ให้แอดมินตั้งค่าแผนกให้ก่อน จึงจะเห็นไฟล์ที่แชร์มาที่แผนกได้
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">ไฟล์แผนก</h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">ไฟล์ที่แชร์ให้แผนก {user.department_name}</p>
      </div>

      {shares.length > 0 && (
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาไฟล์ตามชื่อ..."
              className="w-full pl-9 pr-8 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <ViewModeToggle value={viewMode} onChange={changeViewMode} />
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">กำลังโหลด...</p>
      ) : shares.length === 0 ? (
        <p className="text-slate-500">ยังไม่มีไฟล์ที่แชร์มาที่แผนกนี้</p>
      ) : needsRequest.length === 0 && awaitingDecision.length === 0 && ready.length === 0 ? (
        <p className="text-slate-500">ไม่พบไฟล์ที่ตรงกับ "{search}"</p>
      ) : (
        <div className="space-y-8">
          {needsRequest.length > 0 && (
            <div>
              <h2 className="font-semibold mb-3 text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Download size={15} />
                ต้องขอสิทธิ์ก่อน ({needsRequest.length})
              </h2>
              <ShareGrid shares={needsRequest} viewMode={viewMode} busyId={busyId} onRequest={handleRequest} onDownload={handleDownload} />
            </div>
          )}

          {awaitingDecision.length > 0 && (
            <div>
              <h2 className="font-semibold mb-3 text-slate-700 dark:text-slate-300">รอผลการขอเข้าถึง ({awaitingDecision.length})</h2>
              <ShareGrid shares={awaitingDecision} viewMode={viewMode} busyId={busyId} onRequest={handleRequest} onDownload={handleDownload} />
            </div>
          )}

          {ready.length > 0 && (
            <div>
              <h2 className="font-semibold mb-3 text-slate-700 dark:text-slate-300">พร้อมใช้งาน ({ready.length})</h2>
              <ShareGrid shares={ready} viewMode={viewMode} busyId={busyId} onRequest={handleRequest} onDownload={handleDownload} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
