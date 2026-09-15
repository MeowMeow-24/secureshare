import {
  Bell,
  Building2,
  ChevronsLeft,
  ChevronsRight,
  FolderKanban,
  FolderOpen,
  History,
  LayoutDashboard,
  Link2,
  LogOut,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import CommandPalette from "./CommandPalette";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../hooks/useTheme";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: string[];
}

const navItems: NavItem[] = [
  { to: "/dashboard", label: "แดชบอร์ด", icon: LayoutDashboard, roles: ["admin", "user", "viewer"] },
  { to: "/files", label: "ไฟล์ของฉัน", icon: FolderOpen, roles: ["admin", "user"] },
  { to: "/share", label: "ลิงก์แชร์", icon: Link2, roles: ["admin", "user"] },
  { to: "/department-files", label: "ไฟล์แผนก", icon: FolderKanban, roles: ["admin", "user", "viewer"] },
  { to: "/security", label: "ศูนย์ความปลอดภัย", icon: ShieldCheck, roles: ["admin"] },
  { to: "/audit", label: "บันทึกการใช้งาน", icon: History, roles: ["admin"] },
  { to: "/notifications", label: "การแจ้งเตือน", icon: Bell, roles: ["admin", "user", "viewer"] },
  { to: "/admin/users", label: "ผู้ใช้งาน", icon: Users, roles: ["admin"] },
  { to: "/admin/departments", label: "แผนก", icon: Building2, roles: ["admin"] },
];

export const roleLabels: Record<string, string> = {
  admin: "ผู้ดูแลระบบ",
  user: "พนักงาน",
  viewer: "ผู้ดูไฟล์",
};

// ปุ่มสลับโหมดมืด/สว่าง ทำเป็นสวิตช์ทรงยาว (pill) ที่มีไอคอนพระอาทิตย์/พระจันทร์คงที่อยู่ 2 ฝั่ง
// แล้วมีวงกลมเลื่อนไปมาบอกสถานะปัจจุบัน ให้สังเกตเห็นง่ายกว่าปุ่มไอคอนเดี่ยวๆ แบบเดิม
function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      title={isDark ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด"}
      aria-label="สลับโหมดมืด/สว่าง"
      className="relative flex items-center w-14 h-7 shrink-0 rounded-full px-1 bg-slate-200 dark:bg-slate-700 transition-colors"
    >
      <Sun size={13} className="absolute left-1.5 text-amber-500" />
      <Moon size={13} className="absolute right-1.5 text-slate-300 dark:text-slate-400" />
      <span
        className={`w-5 h-5 rounded-full bg-white shadow-md flex items-center justify-center transition-transform duration-200 ${
          isDark ? "translate-x-7" : "translate-x-0"
        }`}
      >
        {isDark ? <Moon size={12} className="text-slate-700" /> : <Sun size={12} className="text-amber-500" />}
      </span>
    </button>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebar_collapsed") === "true");
  const [paletteOpen, setPaletteOpen] = useState(false);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      localStorage.setItem("sidebar_collapsed", String(!c));
      return !c;
    });
  };

  const visibleNavItems = navItems.filter((item) => user && item.roles.includes(user.role));

  // Ctrl+K (หรือ Cmd+K บน Mac) เปิดแถบค้นหา/สลับหน้าด่วน จากที่ไหนในแอปก็ได้
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="min-h-screen flex">
      <aside
        className={`${collapsed ? "w-[68px]" : "w-64"} shrink-0 sticky top-0 h-screen overflow-y-auto bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-4 flex flex-col transition-all duration-200`}
      >
        <div className={`mb-6 flex items-center ${collapsed ? "justify-center" : "gap-2.5 px-2"}`}>
          <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0">
            <ShieldCheck size={18} className="text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-emerald-600 dark:text-emerald-400 leading-tight">SecureShare</h1>
            </div>
          )}
        </div>

        <button
          onClick={() => setPaletteOpen(true)}
          title="ค้นหา (Ctrl+K)"
          className={`flex items-center gap-2 mb-4 px-2.5 py-2 rounded-lg text-sm text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-600 dark:hover:text-slate-300 transition-colors ${
            collapsed ? "justify-center" : "justify-between"
          }`}
        >
          <span className="flex items-center gap-2">
            <Search size={15} />
            {!collapsed && "ค้นหา..."}
          </span>
          {!collapsed && (
            <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700">
              ⌘K
            </kbd>
          )}
        </button>

        <nav className="flex-1 space-y-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 border border-transparent ${
                  collapsed ? "justify-center" : ""
                } ${
                  active
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-sm"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm hover:border-slate-200 dark:hover:border-slate-700"
                }`}
              >
                <Icon size={17} className="shrink-0" strokeWidth={active ? 2.25 : 2} />
                {!collapsed && item.label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={toggleCollapsed}
          title={collapsed ? "ขยายเมนู" : "ย่อเมนู"}
          className={`flex items-center gap-2 px-3 py-2 mb-2 rounded-lg text-xs text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors ${
            collapsed ? "justify-center" : ""
          }`}
        >
          {collapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
          {!collapsed && "ย่อเมนู"}
        </button>

        <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
          {collapsed ? (
            <div className="flex flex-col items-center gap-3">
              <ThemeToggle />
              <button onClick={logout} title="ออกจากระบบ" className="text-red-500 hover:text-red-400 dark:text-red-400">
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 px-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{user?.full_name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-500 truncate">
                    {(user && roleLabels[user.role]) || user?.role}
                    {user?.department_name && ` · ${user.department_name}`}
                  </p>
                </div>
                <ThemeToggle />
              </div>
              <button
                onClick={logout}
                className="mt-3 ml-2 flex items-center gap-1.5 text-xs text-red-500 hover:text-red-400 dark:text-red-400 dark:hover:text-red-300"
              >
                <LogOut size={13} />
                ออกจากระบบ
              </button>
            </>
          )}
        </div>
      </aside>
      <main className="flex-1 p-8 bg-slate-100 dark:bg-slate-950">{children}</main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} navItems={visibleNavItems} />
    </div>
  );
}
