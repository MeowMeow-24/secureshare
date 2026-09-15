import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { Notification } from "../types";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const load = () => api.getNotifications().then(setNotifications).catch(console.error);
  useEffect(() => { load(); }, []);

  const markRead = async (id: string) => {
    await api.markNotificationRead(id);
    await load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">การแจ้งเตือน</h1>
      <div className="space-y-2 max-w-2xl">
        {notifications.map((n, i) => (
          <div
            key={n.id}
            className={`animate-list-item p-4 rounded-xl border flex items-start justify-between gap-4 ${
              n.is_read ? "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm shadow-slate-200/70 dark:shadow-none" : "border-emerald-500/20 bg-emerald-500/5"
            }`}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div>
              <p className="font-medium">{n.title}</p>
              <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">{n.message}</p>
              <p className="text-xs text-slate-500 mt-2">{new Date(n.created_at).toLocaleString()}</p>
            </div>
            {!n.is_read && (
              <button onClick={() => markRead(n.id)} className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline shrink-0">
                ทำเครื่องหมายว่าอ่านแล้ว
              </button>
            )}
          </div>
        ))}
        {notifications.length === 0 && <p className="text-slate-500">ยังไม่มีการแจ้งเตือน</p>}
      </div>
    </div>
  );
}
