export type UserRole = "admin" | "user" | "viewer";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  department_id: string | null;
  department_name: string | null;
  created_at: string;
}

export interface Department {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  created_at: string;
}

export type ShareMode = "open" | "claim_required";

export type SharePermission = "view_only" | "download";
export type ClaimStatus = "pending" | "approved" | "rejected";

export interface DepartmentShare {
  id: string;
  file_id: string;
  filename: string;
  department_id: string;
  department_name: string;
  created_by_name: string;
  mode: ShareMode;
  permission: SharePermission;
  expires_at: string | null;
  is_active: boolean;
  claim_count: number;
  pending_count: number;
  my_claim_status: ClaimStatus | null;
  created_at: string;
}

export interface DepartmentShareClaimRequest {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  status: ClaimStatus;
  claimed_at: string;
  decided_at: string | null;
}

export interface FileItem {
  id: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  sha256_hash: string;
  has_signature: boolean;
  folder_id: string | null;
  created_at: string;
}

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
}

export interface ShareLink {
  id: string;
  token: string;
  share_url: string;
  qr_code_base64: string;
  expires_at: string | null;
  is_one_time: boolean;
  is_active: boolean;
  download_count: number;
  created_at: string;
}

export type SecurityEventType =
  | "BULK_DOWNLOAD"
  | "EXPIRED_LINK_ACCESS"
  | "SIGNATURE_VERIFICATION_FAILED"
  | "UNAUTHORIZED_ACCESS"
  | "RBAC_VIOLATION";

export type SecuritySeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface SecurityEvent {
  id: string;
  event_type: SecurityEventType;
  severity: SecuritySeverity;
  user_id: string | null;
  description: string;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  is_resolved: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_full_name: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface SecurityDashboardStats {
  total_events: number;
  unresolved_events: number;
  events_by_severity: Record<string, number>;
  events_by_type: Record<string, number>;
  recent_events: SecurityEvent[];
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}
