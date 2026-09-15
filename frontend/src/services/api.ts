const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

class ApiClient {
  private token: string | null = localStorage.getItem("token");

  setToken(token: string | null) {
    this.token = token;
    if (token) localStorage.setItem("token", token);
    else localStorage.removeItem("token");
  }

  getToken() {
    return this.token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    if (!(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(`${API_URL}${path}`, { ...options, headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "คำขอไม่สำเร็จ");
    }
    if (res.status === 204) return undefined as T;
    const contentType = res.headers.get("content-type");
    if (contentType?.includes("application/json")) return res.json();
    return res as unknown as T;
  }

  // Auth
  login(email: string, password: string) {
    return this.request<{ access_token: string; expires_in: number }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  register(email: string, password: string, full_name: string, role = "user", department_id?: string | null) {
    return this.request<import("../types").User>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, full_name, role, department_id: department_id ?? null }),
    });
  }

  getMe() {
    return this.request<import("../types").User>("/api/v1/auth/me");
  }

  // Admin: user management
  listUsers() {
    return this.request<import("../types").User[]>("/api/v1/auth/users");
  }

  updateUser(
    userId: string,
    body: Partial<{
      full_name: string;
      role: import("../types").UserRole;
      is_active: boolean;
      department_id: string | null;
      clear_department: boolean;
    }>
  ) {
    return this.request<import("../types").User>(`/api/v1/auth/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  // Departments
  listDepartments() {
    return this.request<import("../types").Department[]>("/api/v1/departments/");
  }

  createDepartment(name: string, description?: string) {
    return this.request<import("../types").Department>("/api/v1/departments/", {
      method: "POST",
      body: JSON.stringify({ name, description: description || null }),
    });
  }

  deleteDepartment(id: string) {
    return this.request(`/api/v1/departments/${id}`, { method: "DELETE" });
  }

  // Department Shares
  createDepartmentShare(
    fileId: string,
    department_id: string,
    mode: import("../types").ShareMode,
    permission: import("../types").SharePermission = "download",
    expires_at?: string
  ) {
    return this.request<import("../types").DepartmentShare>(`/api/v1/department-shares/files/${fileId}`, {
      method: "POST",
      body: JSON.stringify({ department_id, mode, permission, expires_at: expires_at ?? null }),
    });
  }

  listDepartmentInbox() {
    return this.request<import("../types").DepartmentShare[]>("/api/v1/department-shares/inbox");
  }

  listMyDepartmentShares() {
    return this.request<import("../types").DepartmentShare[]>("/api/v1/department-shares/mine");
  }

  claimDepartmentShare(shareId: string) {
    return this.request<import("../types").DepartmentShare>(`/api/v1/department-shares/${shareId}/claim`, {
      method: "POST",
    });
  }

  listShareRequests(shareId: string) {
    return this.request<import("../types").DepartmentShareClaimRequest[]>(`/api/v1/department-shares/${shareId}/requests`);
  }

  approveShareRequest(claimId: string) {
    return this.request(`/api/v1/department-shares/claims/${claimId}/approve`, { method: "POST" });
  }

  rejectShareRequest(claimId: string) {
    return this.request(`/api/v1/department-shares/claims/${claimId}/reject`, { method: "POST" });
  }

  downloadDepartmentShare(shareId: string) {
    return fetch(`${API_URL}/api/v1/department-shares/${shareId}/download`, {
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
    });
  }

  revokeDepartmentShare(shareId: string) {
    return this.request(`/api/v1/department-shares/${shareId}`, { method: "DELETE" });
  }

  // Files
  listFiles(folderId?: string | null, allFolders = false) {
    const params = new URLSearchParams();
    if (folderId) params.set("folder_id", folderId);
    if (allFolders) params.set("all_folders", "true");
    const q = params.toString() ? `?${params.toString()}` : "";
    return this.request<import("../types").FileItem[]>(`/api/v1/files/${q}`);
  }

  uploadFile(file: File, folderId?: string | null) {
    const form = new FormData();
    form.append("file", file);
    const q = folderId ? `?folder_id=${folderId}` : "";
    return this.request(`/api/v1/files/upload${q}`, { method: "POST", body: form });
  }

  downloadFile(fileId: string) {
    return fetch(`${API_URL}/api/v1/files/${fileId}/download`, {
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
    });
  }

  deleteFile(fileId: string) {
    return this.request(`/api/v1/files/${fileId}`, { method: "DELETE" });
  }

  moveFile(fileId: string, folderId: string | null) {
    return this.request(`/api/v1/files/${fileId}/move`, {
      method: "PATCH",
      body: JSON.stringify({ folder_id: folderId }),
    });
  }

  // Folders
  listFolders(parentId?: string | null) {
    const q = parentId ? `?parent_id=${parentId}` : "";
    return this.request<import("../types").Folder[]>(`/api/v1/folders/${q}`);
  }

  createFolder(name: string, parentId?: string | null) {
    return this.request<import("../types").Folder>("/api/v1/folders/", {
      method: "POST",
      body: JSON.stringify({ name, parent_id: parentId ?? null }),
    });
  }

  deleteFolder(folderId: string) {
    return this.request(`/api/v1/folders/${folderId}`, { method: "DELETE" });
  }

  // Share
  createShareLink(fileId: string, expires_at?: string, is_one_time = false) {
    return this.request<import("../types").ShareLink>(`/api/v1/share/${fileId}/links`, {
      method: "POST",
      body: JSON.stringify({ expires_at, is_one_time }),
    });
  }

  listShareLinks() {
    return this.request<import("../types").ShareLink[]>("/api/v1/share/links");
  }

  revokeShareLink(linkId: string) {
    return this.request(`/api/v1/share/links/${linkId}`, { method: "DELETE" });
  }

  getShareInfo(token: string) {
    return this.request(`/api/v1/share/public/${token}/info`);
  }

  // Security
  getSecurityDashboard() {
    return this.request<import("../types").SecurityDashboardStats>("/api/v1/security/dashboard");
  }

  getSecurityEvents(unresolved_only = false) {
    return this.request<import("../types").SecurityEvent[]>(
      `/api/v1/security/events?unresolved_only=${unresolved_only}`
    );
  }

  resolveEvent(eventId: string) {
    return this.request(`/api/v1/security/events/${eventId}`, {
      method: "PATCH",
      body: JSON.stringify({ is_resolved: true }),
    });
  }

  getAuditLogs() {
    return this.request<import("../types").AuditLog[]>("/api/v1/audit/logs");
  }

  getNotifications() {
    return this.request<import("../types").Notification[]>("/api/v1/notifications");
  }

  markNotificationRead(id: string) {
    return this.request(`/api/v1/notifications/${id}/read`, { method: "PATCH" });
  }
}

export const api = new ApiClient();
