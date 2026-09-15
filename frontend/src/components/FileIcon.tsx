// ไอคอนไฟล์ตามประเภท mime_type / นามสกุลไฟล์ — ทำให้หน้าไฟล์ดูเหมือน Windows Explorer / Google Drive
// ที่มีไอคอนสีต่างกันตามประเภทไฟล์ ไม่ใช่ไอคอนเดียวกันหมดทุกไฟล์

type FileKind = "image" | "pdf" | "doc" | "sheet" | "archive" | "video" | "audio" | "code" | "other";

function getFileKind(mimeType: string, filename: string): FileKind {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf" || ext === "pdf") return "pdf";
  if (["doc", "docx"].includes(ext)) return "doc";
  if (["xls", "xlsx", "csv"].includes(ext)) return "sheet";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "archive";
  if (["js", "ts", "tsx", "jsx", "py", "json", "html", "css", "java", "c", "cpp", "go", "rs"].includes(ext)) return "code";
  return "other";
}

// สีพื้นหลังของไอคอนแต่ละประเภท (โทนคล้าย Google Drive: pdf แดง, sheet เขียว, doc น้ำเงิน)
const kindStyles: Record<FileKind, { bg: string; fg: string; label: string }> = {
  image: { bg: "bg-purple-500/15", fg: "text-purple-500 dark:text-purple-400", label: "รูปภาพ" },
  video: { bg: "bg-pink-500/15", fg: "text-pink-500 dark:text-pink-400", label: "วิดีโอ" },
  audio: { bg: "bg-orange-500/15", fg: "text-orange-500 dark:text-orange-400", label: "เสียง" },
  pdf: { bg: "bg-red-500/15", fg: "text-red-500 dark:text-red-400", label: "PDF" },
  doc: { bg: "bg-blue-500/15", fg: "text-blue-500 dark:text-blue-400", label: "เอกสาร" },
  sheet: { bg: "bg-emerald-500/15", fg: "text-emerald-600 dark:text-emerald-400", label: "สเปรดชีต" },
  archive: { bg: "bg-amber-500/15", fg: "text-amber-500 dark:text-amber-400", label: "ไฟล์บีบอัด" },
  code: { bg: "bg-cyan-500/15", fg: "text-cyan-500 dark:text-cyan-400", label: "โค้ด" },
  other: { bg: "bg-slate-500/15", fg: "text-slate-500 dark:text-slate-400", label: "ไฟล์" },
};

// สีเดียวกับ kindStyles ด้านบน แต่เป็นค่า hex ตรงๆ ไว้ให้กราฟ (recharts) ใช้ได้
// เพราะกราฟกำหนดสีผ่าน fill/stroke แบบ hex ไม่รับ tailwind class
const kindChartColors: Record<FileKind, string> = {
  image: "#a855f7",
  video: "#ec4899",
  audio: "#f97316",
  pdf: "#ef4444",
  doc: "#3b82f6",
  sheet: "#10b981",
  archive: "#f59e0b",
  code: "#06b6d4",
  other: "#64748b",
};

interface FileIconProps {
  mimeType: string;
  filename: string;
  size?: "sm" | "md" | "lg";
}

export default function FileIcon({ mimeType, filename, size = "md" }: FileIconProps) {
  const kind = getFileKind(mimeType, filename);
  const style = kindStyles[kind];
  const boxSize = size === "sm" ? "w-9 h-9" : size === "lg" ? "w-16 h-16" : "w-11 h-11";
  const iconSize = size === "sm" ? 16 : size === "lg" ? 28 : 20;

  return (
    <div className={`shrink-0 ${boxSize} ${style.bg} ${style.fg} rounded-lg flex items-center justify-center`}>
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
      </svg>
    </div>
  );
}

export { getFileKind, kindStyles, kindChartColors };
export type { FileKind };
