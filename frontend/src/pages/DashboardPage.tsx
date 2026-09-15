import { Bell, FolderKanban, HardDrive, Link2, ShieldCheck, Upload, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "react-router-dom";
import { roleLabels } from "../components/Layout";
import { getFileKind, kindChartColors, kindStyles } from "../components/FileIcon";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../hooks/useTheme";
import { api } from "../services/api";
import type { FileItem, Notification, SecurityDashboardStats } from "../types";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// สีของกราฟความปลอดภัย เรียงตามระดับความรุนแรงจากเบาไปหนัก
const severityColors: Record<string, string> = {
  LOW: "#3b82f6",
  MEDIUM: "#f59e0b",
  HIGH: "#f97316",
  CRITICAL: "#ef4444",
};
const severityLabels: Record<string, string> = { LOW: "ต่ำ", MEDIUM: "ปานกลาง", HIGH: "สูง", CRITICAL: "วิกฤต" };

// การ์ดกราฟ — ใช้ style เดียวกับ StatCard ด้านล่าง ให้หน้าตาสม่ำเสมอกันทั้งหน้า
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-6 bg-white dark:bg-slate-900 shadow-sm shadow-slate-200/70 dark:shadow-none rounded-xl border border-slate-200 dark:border-slate-800">
      <h3 className="text-sm font-semibold mb-4">{title}</h3>
      {children}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-6 bg-white dark:bg-slate-900 shadow-sm shadow-slate-200/70 dark:shadow-none rounded-xl border border-slate-200 dark:border-slate-800">
      <p className="text-slate-600 dark:text-slate-400 text-sm">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}

// ปุ่มลัดสำหรับงานที่ทำบ่อยๆ วางไว้ให้กดถึงหน้าที่ต้องการได้เลยโดยไม่ต้องไล่หาในเมนู
function QuickAction({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Upload }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:shadow-md hover:-translate-y-0.5 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-150 text-center"
    >
      <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
        <Icon size={17} />
      </div>
      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{label}</span>
    </Link>
  );
}

// สร้างข้อมูล "ไฟล์ที่อัปโหลดใน 7 วันล่าสุด" จากรายการไฟล์ที่มีอยู่ (ไม่ต้องเพิ่ม endpoint ใหม่ที่ backend)
// นับจำนวนไฟล์ที่ created_at ตรงกับแต่ละวัน ย้อนหลัง 7 วันจากวันนี้
function buildUploadTrend(files: FileItem[]) {
  const days: { key: string; label: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
    days.push({ key, label, count: 0 });
  }
  const byDay = new Map(days.map((d) => [d.key, d]));
  for (const f of files) {
    const key = f.created_at.slice(0, 10);
    const bucket = byDay.get(key);
    if (bucket) bucket.count += 1;
  }
  return days;
}

// จัดกลุ่มไฟล์ตามประเภท (ใช้ตัวจำแนกเดียวกับที่ใช้เลือกไอคอนไฟล์ในหน้า "ไฟล์ของฉัน" เพื่อให้สีตรงกัน)
function buildFileTypeBreakdown(files: FileItem[]) {
  const counts = new Map<string, number>();
  for (const f of files) {
    const kind = getFileKind(f.mime_type, f.original_filename);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([kind, count]) => ({
    kind,
    name: kindStyles[kind as keyof typeof kindStyles].label,
    value: count,
    color: kindChartColors[kind as keyof typeof kindChartColors],
  }));
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [securityStats, setSecurityStats] = useState<SecurityDashboardStats | null>(null);

  useEffect(() => {
    if (user?.role !== "viewer") {
      api.listFiles().then(setFiles).catch(console.error);
    }
    api.getNotifications().then(setNotifications).catch(console.error);
    if (user?.role === "admin") {
      api.getSecurityDashboard().then(setSecurityStats).catch(console.error);
    }
  }, [user]);

  const unread = notifications.filter((n) => !n.is_read).length;
  const uploadTrend = useMemo(() => buildUploadTrend(files), [files]);
  const fileTypeBreakdown = useMemo(() => buildFileTypeBreakdown(files), [files]);
  const totalStorageBytes = useMemo(() => files.reduce((sum, f) => sum + f.file_size, 0), [files]);

  // สีของเส้น/แกน/tooltip ในกราฟต้องปรับตามธีม เพราะ recharts วาดด้วย SVG กำหนดสีตรงๆ
  // ไม่สามารถใช้ dark: ของ tailwind ได้แบบ className ทั่วไป
  const isDark = theme === "dark";
  const gridColor = isDark ? "#1e293b" : "#e2e8f0";
  const tickColor = isDark ? "#94a3b8" : "#64748b";
  const tooltipStyle = {
    background: isDark ? "#0f172a" : "#ffffff",
    border: `1px solid ${isDark ? "#1e293b" : "#e2e8f0"}`,
    borderRadius: 8,
    fontSize: 12,
    color: isDark ? "#e2e8f0" : "#0f172a",
  };

  const severityData = securityStats
    ? Object.entries(securityStats.events_by_severity).map(([sev, count]) => ({
        name: severityLabels[sev] ?? sev,
        count,
        color: severityColors[sev] ?? "#64748b",
      }))
    : [];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">แดชบอร์ด</h1>
      <p className="text-slate-600 dark:text-slate-400 mb-8">ยินดีต้อนรับกลับ, {user?.full_name}</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="ไฟล์ของฉัน" value={files.length} />
        <StatCard label="การแจ้งเตือนที่ยังไม่อ่าน" value={unread} />
        <StatCard label="สิทธิ์การใช้งาน" value={roleLabels[user?.role ?? ""] ?? "-"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <div className="lg:col-span-2">
          <p className="text-sm font-semibold mb-3 text-slate-700 dark:text-slate-300">ทางลัด</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {user?.role !== "viewer" && <QuickAction to="/files" label="อัปโหลดไฟล์" icon={Upload} />}
            {user?.role !== "viewer" && <QuickAction to="/share" label="สร้างลิงก์แชร์" icon={Link2} />}
            <QuickAction to="/department-files" label="ไฟล์แผนก" icon={FolderKanban} />
            <QuickAction to="/notifications" label="การแจ้งเตือน" icon={Bell} />
            {user?.role === "admin" && <QuickAction to="/security" label="ศูนย์ความปลอดภัย" icon={ShieldCheck} />}
            {user?.role === "admin" && <QuickAction to="/admin/users" label="จัดการผู้ใช้งาน" icon={Users} />}
          </div>
        </div>

        {user?.role !== "viewer" && (
          <div className="p-6 bg-white dark:bg-slate-900 shadow-sm shadow-slate-200/70 dark:shadow-none rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-center">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 text-sm mb-2">
              <HardDrive size={15} />
              พื้นที่จัดเก็บที่ใช้ไป
            </div>
            <p className="text-2xl font-bold">{formatBytes(totalStorageBytes)}</p>
            <p className="text-xs text-slate-500 mt-1">จาก {files.length} ไฟล์</p>
          </div>
        )}
      </div>

      {user?.role !== "viewer" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
          <div className="lg:col-span-2">
            <ChartCard title="ไฟล์ที่อัปโหลดใน 7 วันล่าสุด">
              {files.length === 0 ? (
                <p className="text-slate-500 text-sm py-10 text-center">ยังไม่มีข้อมูลไฟล์</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={uploadTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: tickColor }} axisLine={{ stroke: gridColor }} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: tickColor }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: isDark ? "#1e293b" : "#f1f5f9" }} />
                    <Bar dataKey="count" name="ไฟล์" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          <ChartCard title="ไฟล์แยกตามประเภท">
            {fileTypeBreakdown.length === 0 ? (
              <p className="text-slate-500 text-sm py-10 text-center">ยังไม่มีข้อมูลไฟล์</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={fileTypeBreakdown} dataKey="value" nameKey="name" innerRadius={40} outerRadius={65} paddingAngle={2}>
                      {fileTypeBreakdown.map((entry) => (
                        <Cell key={entry.kind} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 justify-center">
                  {fileTypeBreakdown.map((entry) => (
                    <span key={entry.kind} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                      <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
                      {entry.name} ({entry.value})
                    </span>
                  ))}
                </div>
              </>
            )}
          </ChartCard>
        </div>
      )}

      {user?.role === "admin" && securityStats && (
        <div className="mb-8">
          <ChartCard title="เหตุการณ์ความปลอดภัยแยกตามความรุนแรง">
            {severityData.length === 0 ? (
              <p className="text-slate-500 text-sm py-10 text-center">ยังไม่มีเหตุการณ์ความปลอดภัย</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={severityData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: tickColor }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: tickColor }} axisLine={false} tickLine={false} width={70} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: isDark ? "#1e293b" : "#f1f5f9" }} />
                  <Bar dataKey="count" name="เหตุการณ์" radius={[0, 4, 4, 0]} maxBarSize={28}>
                    {severityData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-4">การแจ้งเตือนล่าสุด</h2>
        {notifications.length === 0 ? (
          <p className="text-slate-500 text-sm">ยังไม่มีการแจ้งเตือน</p>
        ) : (
          <div className="space-y-2">
            {notifications.slice(0, 5).map((n, i) => (
              <div
                key={n.id}
                className={`animate-list-item p-4 rounded-lg border ${
                  n.is_read
                    ? "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm shadow-slate-200/70 dark:shadow-none"
                    : "border-emerald-500/20 bg-emerald-500/5"
                }`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <p className="font-medium text-sm">{n.title}</p>
                <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">{n.message}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
