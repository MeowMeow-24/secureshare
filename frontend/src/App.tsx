import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { ThemeProvider } from "./hooks/useTheme";
import AdminDepartmentsPage from "./pages/AdminDepartmentsPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import AuditPage from "./pages/AuditPage";
import DashboardPage from "./pages/DashboardPage";
import DepartmentFilesPage from "./pages/DepartmentFilesPage";
import FilesPage from "./pages/FilesPage";
import LoginPage from "./pages/LoginPage";
import NotificationsPage from "./pages/NotificationsPage";
import PublicSharePage from "./pages/PublicSharePage";
import SecurityPage from "./pages/SecurityPage";
import SharePage from "./pages/SharePage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center">กำลังโหลด...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center">กำลังโหลด...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/dashboard" replace />;
  return <Layout>{children}</Layout>;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center">กำลังโหลด...</div>;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
          <Route path="/share/:token" element={<PublicSharePage />} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/files" element={<ProtectedRoute><FilesPage /></ProtectedRoute>} />
          <Route path="/share" element={<ProtectedRoute><SharePage /></ProtectedRoute>} />
          <Route path="/department-files" element={<ProtectedRoute><DepartmentFilesPage /></ProtectedRoute>} />
          <Route path="/security" element={<AdminRoute><SecurityPage /></AdminRoute>} />
          <Route path="/audit" element={<AdminRoute><AuditPage /></AdminRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
          <Route path="/admin/users" element={<AdminRoute><AdminUsersPage /></AdminRoute>} />
          <Route path="/admin/departments" element={<AdminRoute><AdminDepartmentsPage /></AdminRoute>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}
