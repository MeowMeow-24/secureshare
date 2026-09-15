export type ViewMode = "list" | "grid-md" | "grid-lg";

const options: { mode: ViewMode; label: string; icon: React.ReactNode }[] = [
  {
    mode: "list",
    label: "แบบรายการ (เล็ก)",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="4" y1="6" x2="20" y2="6" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="18" x2="20" y2="18" />
      </svg>
    ),
  },
  {
    mode: "grid-md",
    label: "แบบตาราง (กลาง)",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    mode: "grid-lg",
    label: "แบบตาราง (ใหญ่)",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="8" height="8" rx="1" />
        <rect x="13" y="3" width="8" height="8" rx="1" />
        <rect x="3" y="13" width="8" height="8" rx="1" />
        <rect x="13" y="13" width="8" height="8" rx="1" />
      </svg>
    ),
  },
];

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

// ปุ่มสลับรูปแบบการแสดงไฟล์ (list / grid กลาง / grid ใหญ่) เหมือนมุมขวาบนของ Windows Explorer
export default function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
      {options.map((opt) => (
        <button
          key={opt.mode}
          title={opt.label}
          onClick={() => onChange(opt.mode)}
          className={`p-1.5 rounded-md transition-colors ${
            value === opt.mode
              ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}
