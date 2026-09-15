import { ChevronRight, Download, Folder as FolderIcon, FolderPlus, Home, Search, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import FileIcon from "../components/FileIcon";
import ViewModeToggle, { type ViewMode } from "../components/ViewModeToggle";
import { api } from "../services/api";
import type { FileItem, Folder } from "../types";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// เมนูปุ่ม "ดาวน์โหลด/ลบ" ของแต่ละไฟล์ — ใช้ร่วมกันทั้ง 3 โหมดการแสดงผล
function FileActions({ onDownload, onDelete }: { onDownload: () => void; onDelete: () => void }) {
  return (
    <div className="flex gap-1">
      <button
        onClick={onDownload}
        title="ดาวน์โหลด"
        className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100"
      >
        <Download size={16} />
      </button>
      <button
        onClick={onDelete}
        title="ลบ"
        className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

interface Crumb {
  id: string | null;
  name: string;
}

// custom MIME type ไว้แยกว่ากำลังลาก "ไฟล์ที่มีอยู่แล้วในระบบ" (ย้ายโฟลเดอร์) ไม่ใช่ไฟล์จากเครื่อง (อัปโหลดใหม่)
const FILE_DRAG_TYPE = "application/x-secureshare-file-id";

export default function FilesPage() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  // เก็บ path ที่กำลังยืนอยู่เป็น breadcrumb — ตัวแรกคือ root เสมอ (id: null)
  const [breadcrumb, setBreadcrumb] = useState<Crumb[]>([{ id: null, name: "ไฟล์ของฉัน" }]);
  const currentFolderId = breadcrumb[breadcrumb.length - 1].id;
  // จำโหมดการแสดงผลไว้ใน localStorage เหมือน Windows Explorer ที่จำโหมดล่าสุดไว้ ไม่ต้องเลือกใหม่ทุกครั้ง
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem("files_view_mode") as ViewMode | null) ?? "list"
  );
  const inputRef = useRef<HTMLInputElement>(null);
  // ลากไฟล์วางได้ทั้งหน้า (ไปที่โฟลเดอร์ปัจจุบัน) และลากไปวางตรงการ์ดโฟลเดอร์ (ไปที่โฟลเดอร์นั้นเลย)
  const [pageDragOver, setPageDragOver] = useState(false);
  const [folderDragOverId, setFolderDragOverId] = useState<string | null>(null);
  const [crumbDragOverIndex, setCrumbDragOverIndex] = useState<number | null>(null);
  const dragCounter = useRef(0);

  const load = () => {
    api.listFiles(currentFolderId).then(setFiles).catch(console.error);
    api.listFolders(currentFolderId).then(setFolders).catch(console.error);
  };
  useEffect(() => { load(); setSearch(""); }, [currentFolderId]);

  // ค้นหาแบบง่ายๆ กรองจากชื่อไฟล์/โฟลเดอร์ในโฟลเดอร์ปัจจุบันฝั่ง frontend เลย
  const filteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => f.original_filename.toLowerCase().includes(q));
  }, [files, search]);
  const filteredFolders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return folders;
    return folders.filter((f) => f.name.toLowerCase().includes(q));
  }, [folders, search]);

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem("files_view_mode", mode);
  };

  const openFolder = (folder: Folder) => setBreadcrumb([...breadcrumb, { id: folder.id, name: folder.name }]);
  const goToCrumb = (index: number) => setBreadcrumb(breadcrumb.slice(0, index + 1));

  const handleCreateFolder = async () => {
    const name = prompt("ตั้งชื่อโฟลเดอร์:");
    if (!name || !name.trim()) return;
    try {
      await api.createFolder(name.trim(), currentFolderId);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "สร้างโฟลเดอร์ไม่สำเร็จ");
    }
  };

  const handleDeleteFolder = async (folder: Folder) => {
    if (!confirm(`ลบโฟลเดอร์ "${folder.name}"? (ต้องไม่มีไฟล์หรือโฟลเดอร์ย่อยอยู่ข้างในก่อน)`)) return;
    try {
      await api.deleteFolder(folder.id);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "ลบโฟลเดอร์ไม่สำเร็จ — โฟลเดอร์นี้อาจยังไม่ว่าง");
    }
  };

  // อัปโหลดได้หลายไฟล์พร้อมกัน (ทั้งจากปุ่มเลือกไฟล์ และจากการลากวาง) โดยระบุปลายทางเป็นโฟลเดอร์ไหนก็ได้
  const uploadFiles = async (fileList: FileList | File[], targetFolderId: string | null) => {
    const list = Array.from(fileList);
    if (list.length === 0) return;
    setUploading(true);
    try {
      for (const file of list) {
        await api.uploadFile(file, targetFolderId);
      }
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) uploadFiles(e.target.files, currentFolderId);
  };

  // ย้ายไฟล์ที่มีอยู่แล้วไปโฟลเดอร์อื่น (ลากวางภายในระบบ ต่างจากลากไฟล์จากเครื่องมาอัปโหลด)
  const moveFileTo = async (fileId: string, targetFolderId: string | null) => {
    try {
      await api.moveFile(fileId, targetFolderId);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "ย้ายไฟล์ไม่สำเร็จ");
    }
  };

  const handleFileDragStart = (e: React.DragEvent, file: FileItem) => {
    e.dataTransfer.setData(FILE_DRAG_TYPE, file.id);
    e.dataTransfer.effectAllowed = "move";
  };

  // ลากไฟล์วางที่ไหนก็ได้ในหน้า (นอกโฟลเดอร์) = อัปโหลดเข้าโฟลเดอร์ปัจจุบันที่กำลังเปิดอยู่
  // (ถ้าลากไฟล์ที่มีอยู่แล้วมาวางเฉยๆ ไม่ได้วางตรงโฟลเดอร์/breadcrumb ก็ไม่ต้องทำอะไร เพราะมันอยู่ที่นี่อยู่แล้ว)
  const handlePageDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setPageDragOver(false);
    if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files, currentFolderId);
  };
  const handlePageDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) {
      dragCounter.current += 1;
      setPageDragOver(true);
    }
  };
  const handlePageDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) setPageDragOver(false);
  };

  // ลากไฟล์ไปวางตรงการ์ด/แถวของโฟลเดอร์ = ย้ายไฟล์ที่มีอยู่แล้วเข้าไป หรืออัปโหลดไฟล์ใหม่จากเครื่องเข้าไปเลย
  const handleFolderDrop = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setFolderDragOverId(null);
    dragCounter.current = 0;
    setPageDragOver(false);
    const movedFileId = e.dataTransfer.getData(FILE_DRAG_TYPE);
    if (movedFileId) {
      moveFileTo(movedFileId, folderId);
      return;
    }
    if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files, folderId);
  };
  const handleFolderDragOver = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files") || e.dataTransfer.types.includes(FILE_DRAG_TYPE)) {
      setFolderDragOverId(folderId);
    }
  };
  const handleFolderDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    setFolderDragOverId(null);
  };

  // ลากไฟล์ไปวางบน breadcrumb = ย้ายไฟล์ออกไปโฟลเดอร์แม่ระดับนั้นๆ (รวมถึงย้ายกลับไป root ได้)
  const handleCrumbDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setCrumbDragOverIndex(null);
    const movedFileId = e.dataTransfer.getData(FILE_DRAG_TYPE);
    if (movedFileId && index !== breadcrumb.length - 1) {
      moveFileTo(movedFileId, breadcrumb[index].id);
    }
  };
  const handleCrumbDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes(FILE_DRAG_TYPE) && index !== breadcrumb.length - 1) {
      setCrumbDragOverIndex(index);
    }
  };
  const handleCrumbDragLeave = () => setCrumbDragOverIndex(null);

  const handleDownload = async (file: FileItem) => {
    const res = await api.downloadFile(file.id);
    if (!res.ok) {
      // โชว์ error จริงจาก backend เลย (เช่น "Access denied") แทนข้อความกลางๆ
      // จะได้รู้ทันทีว่าปัญหาคืออะไร ไม่ต้องเดา
      const body = await res.json().catch(() => null);
      alert(body?.detail ? `ดาวน์โหลดไม่สำเร็จ: ${body.detail}` : `ดาวน์โหลดไม่สำเร็จ (HTTP ${res.status})`);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.original_filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("ยืนยันการลบไฟล์นี้?")) return;
    await api.deleteFile(id);
    load();
  };

  const isEmpty = files.length === 0 && folders.length === 0;
  const noSearchResults = filteredFiles.length === 0 && filteredFolders.length === 0 && !isEmpty;

  return (
    <div
      className="relative"
      onDragEnter={handlePageDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={handlePageDragLeave}
      onDrop={handlePageDrop}
    >
      {pageDragOver && (
        <div className="fixed inset-0 z-40 bg-emerald-500/10 border-4 border-dashed border-emerald-500 rounded-lg pointer-events-none flex items-center justify-center">
          <div className="bg-white dark:bg-slate-900 px-6 py-4 rounded-xl shadow-lg flex items-center gap-3">
            <Upload size={20} className="text-emerald-600 dark:text-emerald-400" />
            <p className="font-medium">ปล่อยไฟล์เพื่ออัปโหลดที่นี่</p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">ไฟล์ของฉัน</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCreateFolder}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors"
          >
            <FolderPlus size={16} />
            สร้างโฟลเดอร์
          </button>
          <label className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-500 rounded-lg cursor-pointer text-sm font-medium shadow-sm shadow-emerald-600/20 transition-colors">
            <Upload size={16} />
            {uploading ? "กำลังอัปโหลด..." : "อัปโหลดไฟล์"}
            <input ref={inputRef} type="file" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      {/* breadcrumb: เส้นทางโฟลเดอร์ที่กำลังอยู่ กดย้อนกลับได้ทุกระดับ เหมือน path bar ใน Explorer
          ลากไฟล์มาวางตรงนี้ได้ด้วย เพื่อย้ายไฟล์ออกไปโฟลเดอร์แม่ระดับนั้นๆ (หรือกลับไป root) */}
      <div className="flex items-center gap-1 text-sm mb-6 text-slate-500 dark:text-slate-400">
        {breadcrumb.map((crumb, i) => (
          <span key={crumb.id ?? "root"} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={14} className="text-slate-400 dark:text-slate-600" />}
            <button
              onClick={() => goToCrumb(i)}
              onDragOver={(e) => handleCrumbDragOver(e, i)}
              onDragLeave={handleCrumbDragLeave}
              onDrop={(e) => handleCrumbDrop(e, i)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 ${
                i === breadcrumb.length - 1 ? "text-slate-900 dark:text-slate-100 font-medium" : ""
              } ${crumbDragOverIndex === i ? "bg-emerald-500/10 ring-2 ring-emerald-500" : ""}`}
            >
              {i === 0 && <Home size={13} />}
              {crumb.name}
            </button>
          </span>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาไฟล์/โฟลเดอร์ในนี้..."
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

      {isEmpty ? (
        <p className="text-slate-500">โฟลเดอร์นี้ว่างเปล่า ลองอัปโหลดไฟล์หรือสร้างโฟลเดอร์ใหม่ดู</p>
      ) : noSearchResults ? (
        <p className="text-slate-500">ไม่พบไฟล์หรือโฟลเดอร์ที่ตรงกับ "{search}"</p>
      ) : viewMode === "list" ? (
        // โหมดรายการ: โฟลเดอร์มาก่อนเสมอ ตามด้วยไฟล์ (เหมือน List view ใน Explorer)
        <div className="space-y-1">
          {filteredFolders.map((f, i) => (
            <div
              key={f.id}
              onClick={() => openFolder(f)}
              onDragOver={(e) => handleFolderDragOver(e, f.id)}
              onDragLeave={handleFolderDragLeave}
              onDrop={(e) => handleFolderDrop(e, f.id)}
              className={`animate-list-item flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white dark:hover:bg-slate-900 hover:shadow-sm group cursor-pointer ${
                folderDragOverId === f.id ? "bg-emerald-500/10 ring-2 ring-emerald-500" : ""
              }`}
              style={{ animationDelay: `${i * 35}ms` }}
            >
              <div className="shrink-0 w-9 h-9 bg-amber-500/15 text-amber-500 dark:text-amber-400 rounded-lg flex items-center justify-center">
                <FolderIcon size={18} fill="currentColor" fillOpacity={0.2} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{f.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">โฟลเดอร์</p>
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteFolder(f); }}
                  title="ลบโฟลเดอร์"
                  className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
          {filteredFiles.map((f, i) => (
            <div
              key={f.id}
              draggable
              onDragStart={(e) => handleFileDragStart(e, f)}
              className="animate-list-item flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white dark:hover:bg-slate-900 hover:shadow-sm group cursor-grab active:cursor-grabbing"
              style={{ animationDelay: `${(filteredFolders.length + i) * 35}ms` }}
            >
              <FileIcon mimeType={f.mime_type} filename={f.original_filename} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{f.original_filename}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {formatSize(f.file_size)} · SHA-256: {f.sha256_hash.slice(0, 12)}...
                  {f.has_signature && " · มีลายเซ็นดิจิทัล"}
                </p>
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                <FileActions onDownload={() => handleDownload(f)} onDelete={() => handleDelete(f.id)} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        // โหมดตาราง (กลาง/ใหญ่): การ์ดไอคอนกลางเรียงเป็นกริด โฟลเดอร์ก่อนไฟล์เหมือนโหมดรายการ
        <div
          className={`grid gap-3 ${
            viewMode === "grid-lg"
              ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
              : "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6"
          }`}
        >
          {filteredFolders.map((f, i) => (
            <div
              key={f.id}
              onClick={() => openFolder(f)}
              onDragOver={(e) => handleFolderDragOver(e, f.id)}
              onDragLeave={handleFolderDragLeave}
              onDrop={(e) => handleFolderDrop(e, f.id)}
              className={`animate-list-item group relative flex flex-col items-center text-center p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-900 hover:shadow-sm hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer ${
                folderDragOverId === f.id ? "bg-emerald-500/10 ring-2 ring-emerald-500" : ""
              }`}
              style={{ animationDelay: `${i * 35}ms` }}
            >
              <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteFolder(f); }}
                  title="ลบโฟลเดอร์"
                  className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div
                className={`shrink-0 ${viewMode === "grid-lg" ? "w-16 h-16" : "w-11 h-11"} bg-amber-500/15 text-amber-500 dark:text-amber-400 rounded-lg flex items-center justify-center`}
              >
                <FolderIcon size={viewMode === "grid-lg" ? 28 : 20} fill="currentColor" fillOpacity={0.2} />
              </div>
              <p className="mt-3 text-sm font-medium w-full truncate" title={f.name}>{f.name}</p>
              <p className="text-xs text-slate-500 mt-1">โฟลเดอร์</p>
            </div>
          ))}
          {filteredFiles.map((f, i) => (
            <div
              key={f.id}
              draggable
              onDragStart={(e) => handleFileDragStart(e, f)}
              className="animate-list-item group relative flex flex-col items-center text-center p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-900 hover:shadow-sm hover:border-slate-300 dark:hover:border-slate-700 cursor-grab active:cursor-grabbing"
              style={{ animationDelay: `${(filteredFolders.length + i) * 35}ms` }}
            >
              <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <FileActions onDownload={() => handleDownload(f)} onDelete={() => handleDelete(f.id)} />
              </div>
              <FileIcon mimeType={f.mime_type} filename={f.original_filename} size={viewMode === "grid-lg" ? "lg" : "md"} />
              <p className="mt-3 text-sm font-medium w-full truncate" title={f.original_filename}>
                {f.original_filename}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {formatSize(f.file_size)}
                {f.has_signature && " · เซ็นแล้ว"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
