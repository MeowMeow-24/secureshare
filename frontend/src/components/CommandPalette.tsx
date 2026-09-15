import { Download, File as FileIconLucide, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import type { FileItem } from "../types";
import type { NavItem } from "./Layout";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  navItems: NavItem[];
}

// แถบค้นหาแบบ Ctrl+K — พิมพ์แล้วเห็นทั้งหน้าเมนูที่ตรงกับคำค้น และไฟล์ (ค้นได้ทุกโฟลเดอร์ ไม่ใช่แค่โฟลเดอร์ปัจจุบัน)
// เลือกเมนู -> พาไปหน้านั้น, เลือกไฟล์ -> ดาวน์โหลดให้ทันที (ไม่ต้องไล่หาว่าไฟล์อยู่โฟลเดอร์ไหน)
export default function CommandPalette({ open, onClose, navItems }: CommandPaletteProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<FileItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    inputRef.current?.focus();
    // โหลดรายชื่อไฟล์ทั้งหมด (ทุกโฟลเดอร์) ไว้ค้นหา — เฉพาะ role ที่มีสิทธิ์เห็นไฟล์ตัวเองเท่านั้น
    if (user?.role !== "viewer") {
      api.listFiles(null, true).then(setFiles).catch(() => setFiles([]));
    }
  }, [open, user]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const q = query.trim().toLowerCase();
  const matchedPages = useMemo(() => {
    if (!q) return navItems;
    return navItems.filter((item) => item.label.toLowerCase().includes(q));
  }, [navItems, q]);
  const matchedFiles = useMemo(() => {
    if (!q) return [];
    return files.filter((f) => f.original_filename.toLowerCase().includes(q)).slice(0, 8);
  }, [files, q]);

  if (!open) return null;

  const goTo = (path: string) => {
    navigate(path);
    onClose();
  };

  const downloadFile = async (file: FileItem) => {
    const res = await api.downloadFile(file.id);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.original_filename;
    a.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg mx-4 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ไปหน้าไหน หรือค้นหาไฟล์..."
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-slate-400"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-slate-400">
            Esc
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto py-2">
          {matchedPages.length > 0 && (
            <div className="px-2">
              <p className="px-2 py-1 text-[11px] uppercase tracking-wide text-slate-400">หน้า</p>
              {matchedPages.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.to}
                    onClick={() => goTo(item.to)}
                    className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Icon size={16} className="text-slate-500 dark:text-slate-400 shrink-0" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          )}

          {matchedFiles.length > 0 && (
            <div className="px-2 mt-1">
              <p className="px-2 py-1 text-[11px] uppercase tracking-wide text-slate-400">ไฟล์ (คลิกเพื่อดาวน์โหลด)</p>
              {matchedFiles.map((f) => (
                <button
                  key={f.id}
                  onClick={() => downloadFile(f)}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-800 group"
                >
                  <FileIconLucide size={16} className="text-slate-500 dark:text-slate-400 shrink-0" />
                  <span className="truncate flex-1">{f.original_filename}</span>
                  <Download size={14} className="text-slate-400 opacity-0 group-hover:opacity-100 shrink-0" />
                </button>
              ))}
            </div>
          )}

          {q && matchedPages.length === 0 && matchedFiles.length === 0 && (
            <p className="px-4 py-6 text-sm text-slate-400 text-center">ไม่พบผลลัพธ์สำหรับ "{query}"</p>
          )}
        </div>
      </div>
    </div>
  );
}
