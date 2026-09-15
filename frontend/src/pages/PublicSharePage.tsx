import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface ShareInfo {
  filename: string;
  expires_at: string | null;
  is_one_time: boolean;
  is_expired: boolean;
  is_available: boolean;
}

export default function PublicSharePage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/v1/share/public/${token}/info`)
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => setError("ไม่พบลิงก์นี้"));
  }, [token]);

  const handleDownload = async () => {
    if (!token) return;
    setDownloading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/share/public/${token}/download`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "ดาวน์โหลดไม่สำเร็จ" }));
        throw new Error(err.detail);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition");
      const filename = disposition?.match(/filename="(.+)"/)?.[1] ?? "download";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ดาวน์โหลดไม่สำเร็จ");
    } finally {
      setDownloading(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950">
        <div className="text-center">
          <p className="text-4xl mb-4">⚠</p>
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950">
        <p className="text-slate-600 dark:text-slate-400">กำลังโหลด...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950">
      <div className="w-full max-w-md p-8 bg-white dark:bg-slate-900 shadow-sm shadow-slate-200/70 dark:shadow-none rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
        <h1 className="text-xl font-bold mb-2">ไฟล์ที่ถูกแชร์</h1>
        <p className="text-slate-700 dark:text-slate-300 mb-6">{info.filename}</p>
        {info.is_expired && (
          <p className="text-orange-400 text-sm mb-4">⚠ ลิงก์นี้หมดอายุแล้ว</p>
        )}
        {info.is_one_time && !info.is_available && (
          <p className="text-orange-400 text-sm mb-4">⚠ ลิงก์นี้ถูกใช้ไปแล้ว (ใช้ได้ครั้งเดียว)</p>
        )}
        <button
          onClick={handleDownload}
          disabled={downloading || info.is_expired || !info.is_available}
          className="w-full py-2 bg-emerald-600 text-white hover:bg-emerald-500 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {downloading ? "กำลังดาวน์โหลด..." : "ดาวน์โหลดไฟล์"}
        </button>
      </div>
    </div>
  );
}
