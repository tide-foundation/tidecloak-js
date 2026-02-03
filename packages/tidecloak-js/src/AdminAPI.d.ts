/**
 * AdminAPI - Keycloak Admin REST API client
 */

export interface Role {
  id?: string;
  name: string;
  description?: string;
  composite?: boolean;
  clientRole?: boolean;
  containerId?: string;
  attributes?: Record<string, string[]>;
}

export interface User {
  id: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  enabled?: boolean;
  emailVerified?: boolean;
  attributes?: Record<string, string[]>;
  createdTimestamp?: number;
}

export interface ChangeSet {
  id?: string;
  changeSetId: string;
  changeSetType: string;
  actionType: string;
  draftRecordId?: string;
  username?: string;
  userId?: string;
  role?: string;
  clientId?: string;
  status?: string;
  timestamp?: string | number;
  commitReady?: boolean;
}

export interface ChangeSetRequest {
  changeSetId: string;
  changeSetType: string;
  actionType: string;
}

export interface RawChangeSetResponse {
  changesetId: string;
  changeSetDraftRequests: string;
  requiresApprovalPopup: boolean | string;
}

export interface Policy {
  id: string;
  roleId?: string;
  roleName?: string;
  status?: string;
  threshold?: number;
  approvalCount?: number;
  approvedBy?: string[];
  deniedBy?: string[];
  commitReady?: boolean;
  requestedBy?: string;
  requestedByEmail?: string;
  createdAt?: string;
}

export interface AccessLog {
  id?: string;
  time?: number;
  type?: string;
  userId?: string;
  clientId?: string;
  ipAddress?: string;
  details?: Record<string, string>;
}

export interface PolicyLog {
  id: string;
  action?: string;
  roleId?: string;
  performedBy?: string;
  performedByEmail?: string;
  createdAt?: string;
  policyStatus?: string;
}

export interface GetUsersParams {
  first?: number;
  max?: number;
  search?: string;
}

export interface GetLogsParams {
  first?: number;
  max?: number;
}

export declare class AdminAPI {
  constructor(realm?: string);

  /** Set the realm for API calls */
  setRealm(realm: string): void;

  /** Get the current realm */
  getRealm(): string;

  /** Make an authenticated fetch request */
  fetch<T = any>(endpoint: string, options?: RequestInit): Promise<T>;

  /** Make an authenticated fetch request with FormData */
  fetchWithFormData<T = any>(endpoint: string, formData: FormData): Promise<T>;

  // Realm Roles
  getRoles(): Promise<Role[]>;
  getRole(roleName: string): Promise<Role>;
  createRole(role: { name: string; description?: string }): Promise<void>;
  updateRole(roleName: string, role: { name: string; description?: string }): Promise<void>;
  deleteRole(roleName: string): Promise<void>;

  // Client Roles
  getClientUUID(clientId?: string): Promise<string>;
  getClientRoles(clientId?: string): Promise<Role[]>;
  getClientRole(roleName: string, clientId?: string): Promise<Role>;
  createClientRole(role: { name: string; description?: string }, clientId?: string): Promise<void>;
  updateClientRole(roleName: string, role: { name: string; description?: string }, clientId?: string): Promise<void>;
  deleteClientRole(roleName: string, clientId?: string): Promise<void>;

  // Users
  getUsers(params?: GetUsersParams): Promise<User[]>;
  getUser(userId: string): Promise<User>;
  createUser(user: Partial<User>): Promise<void>;
  updateUser(userId: string, user: Partial<User>): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  setUserEnabled(userId: string, enabled: boolean): Promise<void>;
  /** Get a Tide link URL for a user to link their Tide account */
  getTideLinkUrl(userId: string, redirectUri: string, lifespan?: number): Promise<string>;

  // User Roles
  getUserRoles(userId: string): Promise<Role[]>;
  addUserRoles(userId: string, roles: Role[]): Promise<void>;
  removeUserRoles(userId: string, roles: Role[]): Promise<void>;

  // Policy Templates (Tide Admin) - Read only
  getTemplates(): Promise<any[]>;

  // Change Sets / Approvals (Tide Admin)
  /** Get pending user change requests */
  getUserChangeRequests(): Promise<ChangeSet[]>;
  /** Get pending role change requests */
  getRoleChangeRequests(): Promise<ChangeSet[]>;
  /** Get all pending change sets (users + roles) @deprecated Use getUserChangeRequests() and getRoleChangeRequests() separately */
  getPendingChangeSets(): Promise<ChangeSet[]>;
  /** Add approval to a change request */
  approveChangeSet(changeSet: ChangeSetRequest): Promise<void>;
  /** Add rejection to a change request */
  rejectChangeSet(changeSet: ChangeSetRequest): Promise<void>;
  /** Commit a change request */
  commitChangeSet(changeSet: ChangeSetRequest): Promise<void>;
  /** Cancel a change request */
  cancelChangeSet(changeSet: ChangeSetRequest): Promise<void>;
  /** Get raw change set requests for signing */
  getRawChangeSetRequest(changeSet: ChangeSetRequest): Promise<RawChangeSetResponse[]>;
  /** Add approval with a signed request */
  approveChangeSetWithSignature(changeSet: ChangeSetRequest, signedRequest: string): Promise<void>;

  // Logs
  getAccessLogs(params?: GetLogsParams): Promise<AccessLog[]>;
}

/** Singleton AdminAPI instance */
declare const adminAPI: AdminAPI;
export default adminAPI;
