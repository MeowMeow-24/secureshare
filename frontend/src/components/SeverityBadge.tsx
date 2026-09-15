import type { SecuritySeverity } from "../types";

const severityStyles: Record<SecuritySeverity, string> = {
  LOW: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  MEDIUM: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  HIGH: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  CRITICAL: "bg-red-500/10 text-red-400 border-red-500/20",
};

const severityLabels: Record<SecuritySeverity, string> = {
  LOW: "ต่ำ",
  MEDIUM: "ปานกลาง",
  HIGH: "สูง",
  CRITICAL: "วิกฤต",
};

export default function SeverityBadge({ severity }: { severity: SecuritySeverity }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${severityStyles[severity]}`}>
      {severityLabels[severity] ?? severity}
    </span>
  );
}
