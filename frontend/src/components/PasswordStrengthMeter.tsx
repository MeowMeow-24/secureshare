interface Rule {
  label: string;
  test: (pw: string) => boolean;
}

const rules: Rule[] = [
  { label: "อย่างน้อย 8 ตัวอักษร", test: (pw) => pw.length >= 8 },
  { label: "มีตัวพิมพ์เล็ก (a-z)", test: (pw) => /[a-z]/.test(pw) },
  { label: "มีตัวพิมพ์ใหญ่ (A-Z)", test: (pw) => /[A-Z]/.test(pw) },
  { label: "มีตัวเลข (0-9)", test: (pw) => /[0-9]/.test(pw) },
  { label: "มีอักขระพิเศษ (!@#$%...)", test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

const levels = [
  { label: "รหัสผ่านอ่อนมาก", color: "bg-red-500", text: "text-red-600 dark:text-red-400" },
  { label: "รหัสผ่านอ่อน", color: "bg-orange-500", text: "text-orange-400" },
  { label: "รหัสผ่านพอใช้", color: "bg-yellow-500", text: "text-yellow-400" },
  { label: "รหัสผ่านดี", color: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  { label: "รหัสผ่านแข็งแรงมาก", color: "bg-emerald-400", text: "text-emerald-300" },
];

// Common weak passwords that should always score as very weak
const commonPasswords = new Set([
  "password", "12345678", "123456789", "qwerty123", "111111",
  "123123123", "abc12345", "password1", "letmein", "welcome1",
]);

export function getPasswordScore(password: string): number {
  if (!password) return 0;
  if (commonPasswords.has(password.toLowerCase())) return 1;

  const passed = rules.filter((r) => r.test(password)).length;
  let score = passed;

  // Bonus for longer passwords
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;

  return Math.min(score, 5);
}

export function isPasswordAcceptable(password: string): boolean {
  // Require at least length + 2 other categories (score >= 3), matching backend policy
  return getPasswordScore(password) >= 3;
}

export default function PasswordStrengthMeter({ password }: { password: string }) {
  const score = getPasswordScore(password);
  const levelIndex = Math.max(0, Math.min(score - 1, levels.length - 1));
  const level = levels[levelIndex];
  const filledBars = score;

  if (!password) return null;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < filledBars ? level.color : "bg-slate-200 dark:bg-slate-700"
            }`}
          />
        ))}
      </div>
      <p className={`text-xs font-medium ${level.text}`}>{level.label}</p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
        {rules.map((rule) => {
          const ok = rule.test(password);
          return (
            <li
              key={rule.label}
              className={`text-xs flex items-center gap-1.5 ${
                ok ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500"
              }`}
            >
              <span>{ok ? "✓" : "○"}</span>
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
