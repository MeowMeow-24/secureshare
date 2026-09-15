import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { AuditLog } from "../types";

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    api.getAuditLogs().then(setLogs).catch(console.error);
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">บันทึกการใช้งาน</h1>
      <p className="text-slate-600 dark:text-slate-400 text-sm mb-8">บันทึกการทำงานของระบบทั้งหมดที่ไม่สามารถแก้ไขได้</p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <th className="pb-3 pr-4">เวลา</th>
              <th className="pb-3 pr-4">ผู้ใช้</th>
              <th className="pb-3 pr-4">การกระทำ</th>
              <th className="pb-3 pr-4">ทรัพยากร</th>
              <th className="pb-3 pr-4">ไอพี</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-slate-200 dark:border-slate-800/50">
                <td className="py-3 pr-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                  {new Date(log.created_at).toLocaleString()}
                </td>
                <td className="py-3 pr-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                  {log.user_full_name ? (
                    <span>
                      {log.user_full_name}
                      <span className="text-slate-500 text-xs block">{log.user_email}</span>
                    </span>
                  ) : (
                    <span className="text-slate-600 dark:text-slate-400">ระบบ</span>
                  )}
                </td>
                <td className="py-3 pr-4 font-mono text-emerald-600 dark:text-emerald-400">{log.action}</td>
                <td className="py-3 pr-4 text-slate-700 dark:text-slate-300">
                  {log.resource_type}
                  {log.resource_id && <span className="text-slate-500"> / {log.resource_id.slice(0, 8)}</span>}
                </td>
                <td className="py-3 text-slate-500">{log.ip_address ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && <p className="text-slate-500 mt-4">ยังไม่มีบันทึกการใช้งาน</p>}
      </div>
    </div>
  );
}
