import { useEffect, useState } from "react";
import SeverityBadge from "../components/SeverityBadge";
import { api } from "../services/api";
import type { SecurityDashboardStats, SecurityEvent } from "../types";

const eventIcons: Record<string, string> = {
  BULK_DOWNLOAD: "⚠",
  EXPIRED_LINK_ACCESS: "⚠",
  SIGNATURE_VERIFICATION_FAILED: "⚠",
  UNAUTHORIZED_ACCESS: "⚠",
  RBAC_VIOLATION: "⚠",
};

export default function SecurityPage() {
  const [stats, setStats] = useState<SecurityDashboardStats | null>(null);
  const [events, setEvents] = useState<SecurityEvent[]>([]);

  const load = async () => {
    const [s, e] = await Promise.all([
      api.getSecurityDashboard(),
      api.getSecurityEvents(true),
    ]);
    setStats(s);
    setEvents(e);
  };

  useEffect(() => { load().catch(console.error); }, []);

  const handleResolve = async (id: string) => {
    await api.resolveEvent(id);
    await load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">ศูนย์เหตุการณ์ความปลอดภัย</h1>
      <p className="text-slate-600 dark:text-slate-400 text-sm mb-8">ตรวจจับความผิดปกติและติดตามภัยคุกคามแบบเรียลไทม์</p>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="เหตุการณ์ทั้งหมด" value={stats.total_events} />
          <StatCard label="ยังไม่ได้แก้ไข" value={stats.unresolved_events} highlight />
          {Object.entries(stats.events_by_severity).map(([sev, count]) => (
            <StatCard key={sev} label={sev} value={count} />
          ))}
        </div>
      )}

      <h2 className="font-semibold mb-4">การแจ้งเตือนที่ยังไม่แก้ไข</h2>
      {events.length === 0 ? (
        <p className="text-slate-500 text-sm">ไม่มีการแจ้งเตือนความปลอดภัยที่ยังทำงานอยู่</p>
      ) : (
        <div className="space-y-3">
          {events.map((e) => (
            <div key={e.id} className="p-4 bg-white dark:bg-slate-900 shadow-sm shadow-slate-200/70 dark:shadow-none rounded-xl border border-orange-500/20">
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <span className="text-xl">{eventIcons[e.event_type] ?? "⚠"}</span>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <SeverityBadge severity={e.severity} />
                      <span className="text-xs text-slate-500 font-mono">{e.event_type}</span>
                    </div>
                    <p className="text-sm">{e.description}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(e.created_at).toLocaleString()}
                      {e.ip_address && ` · ไอพี: ${e.ip_address}`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleResolve(e.id)}
                  className="text-xs px-3 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg shrink-0"
                >
                  แก้ไขแล้ว
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {stats && stats.recent_events.length > 0 && (
        <>
          <h2 className="font-semibold mt-8 mb-4">เหตุการณ์ล่าสุด</h2>
          <div className="space-y-2">
            {stats.recent_events.map((e) => (
              <div key={e.id} className="flex items-center gap-3 p-3 bg-white dark:bg-slate-900 shadow-sm shadow-slate-200/70 dark:shadow-none rounded-lg text-sm">
                <SeverityBadge severity={e.severity} />
                <span className="flex-1 text-slate-700 dark:text-slate-300">{e.description}</span>
                <span className="text-xs text-slate-500">{new Date(e.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`p-4 rounded-xl border ${highlight ? "border-orange-500/30 bg-orange-500/5" : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm shadow-slate-200/70 dark:shadow-none"}`}>
      <p className="text-slate-600 dark:text-slate-400 text-xs">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}
