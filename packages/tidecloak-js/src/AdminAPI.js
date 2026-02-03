/**
 * AdminAPI - Keycloak Admin REST API client
 *
 * Provides methods to interact with the Keycloak Admin REST API
 * using the IAMService for authentication.
 */

import IAMService from './IAMService.js';

class AdminAPI {
  constructor(realm) {
    this.realm = realm;
  }

  /**
   * Set the realm for API calls
   */
  setRealm(realm) {
    this.realm = realm;
  }

  /**
   * Get the current realm
   */
  getRealm() {
    if (this.realm) return this.realm;
    const config = IAMService.getConfig();
    return config?.realm || 'master';
  }

  /**
   * Make an authenticated fetch request
   */
  async fetch(endpoint, options = {}) {
    const token = await IAMService.getToken();
    const baseURL = IAMService.getBaseUrl();
    const url = endpoint.startsWith('http') ? endpoint : `${baseURL}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`API error ${response.status}: ${errorText || response.statusText}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  /**
   * Make an authenticated fetch request with FormData (no Content-Type header)
   */
  async fetchWithFormData(endpoint, formData) {
    const token = await IAMService.getToken();
    const baseURL = IAMService.getBaseUrl();
    const url = endpoint.startsWith('http') ? endpoint : `${baseURL}${endpoint}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`API error ${response.status}: ${errorText || response.statusText}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  // ==========================================================================
  // Roles
  // ==========================================================================

  async getRoles() {
    const realm = this.getRealm();
    return this.fetch(`/admin/realms/${realm}/roles`);
  }

  async getRole(roleName) {
    const realm = this.getRealm();
    return this.fetch(`/admin/realms/${realm}/roles/${encodeURIComponent(roleName)}`);
  }

  async createRole(role) {
    const realm = this.getRealm();
    return this.fetch(`/admin/realms/${realm}/roles`, {
      method: 'POST',
      body: JSON.stringify(role),
    });
  }

  async updateRole(roleName, role) {
    const realm = this.getRealm();
    return this.fetch(`/admin/realms/${realm}/roles/${encodeURIComponent(roleName)}`, {
      method: 'PUT',
      body: JSON.stringify(role),
    });
  }

  async deleteRole(roleName) {
    const realm = this.getRealm();
    return this.fetch(`/admin/realms/${realm}/roles/${encodeURIComponent(roleName)}`, {
      method: 'DELETE',
    });
  }

  // ==========================================================================
  // Client Roles
  // ==========================================================================

  /**
   * Get the client UUID from the client_id (resource) in the config
   */
  async getClientUUID(clientId) {
    if (!clientId) {
      const config = IAMService.getConfig();
      clientId = config?.resource || config?.clientId;
    }
    if (!clientId) {
      throw new Error('No client ID available');
    }
    const realm = this.getRealm();
    const clients = await this.fetch(`/admin/realms/${realm}/clients?clientId=${encodeURIComponent(clientId)}`);
    if (!clients || clients.length === 0) {
      throw new Error(`Client not found: ${clientId}`);
    }
    return clients[0].id;
  }

  async getClientRoles(clientId) {
    const realm = this.getRealm();
    const clientUUID = await this.getClientUUID(clientId);
    return this.fetch(`/admin/realms/${realm}/clients/${clientUUID}/roles`);
  }

  async getClientRole(roleName, clientId) {
    const realm = this.getRealm();
    const clientUUID = await this.getClientUUID(clientId);
    return this.fetch(`/admin/realms/${realm}/clients/${clientUUID}/roles/${encodeURIComponent(roleName)}`);
  }

  async createClientRole(role, clientId) {
    const realm = this.getRealm();
    const clientUUID = await this.getClientUUID(clientId);
    return this.fetch(`/admin/realms/${realm}/clients/${clientUUID}/roles`, {
      method: 'POST',
      body: JSON.stringify(role),
    });
  }

  async updateClientRole(roleName, role, clientId) {
    const realm = this.getRealm();
    const clientUUID = await this.getClientUUID(clientId);
    return this.fetch(`/admin/realms/${realm}/clients/${clientUUID}/roles/${encodeURIComponent(roleName)}`, {
      method: 'PUT',
      body: JSON.stringify(role),
    });
  }

  async deleteClientRole(roleName, clientId) {
    const realm = this.getRealm();
    const clientUUID = await this.getClientUUID(clientId);
    return this.fetch(`/admin/realms/${realm}/clients/${clientUUID}/roles/${encodeURIComponent(roleName)}`, {
      method: 'DELETE',
    });
  }

  // ==========================================================================
  // Users
  // ==========================================================================

  async getUsers(params = {}) {
    const realm = this.getRealm();
    const query = new URLSearchParams();
    if (params.first !== undefined) query.set('first', String(params.first));
    if (params.max !== undefined) query.set('max', String(params.max));
    if (params.search) query.set('search', params.search);
    const qs = query.toString();
    return this.fetch(`/admin/realms/${realm}/users${qs ? `?${qs}` : ''}`);
  }

  async getUser(userId) {
    const realm = this.getRealm();
    return this.fetch(`/admin/realms/${realm}/users/${userId}`);
  }

  async createUser(user) {
    const realm = this.getRealm();
    return this.fetch(`/admin/realms/${realm}/users`, {
      method: 'POST',
      body: JSON.stringify(user),
    });
  }

  async updateUser(userId, user) {
    const realm = this.getRealm();
    return this.fetch(`/admin/realms/${realm}/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(user),
    });
  }

  async deleteUser(userId) {
    const realm = this.getRealm();
    return this.fetch(`/admin/realms/${realm}/users/${userId}`, {
      method: 'DELETE',
    });
  }

  async setUserEnabled(userId, enabled) {
    const realm = this.getRealm();
    return this.fetch(`/admin/realms/${realm}/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    });
  }

  /**
   * Get a Tide link URL for a user to link their Tide account
   * @param {string} userId - The user ID
   * @param {string} redirectUri - The redirect URI after linking
   * @param {number} [lifespan=43200] - Link lifespan in seconds (default: 12 hours)
   * @returns {Promise<string>} The Tide link URL
   */
  async getTideLinkUrl(userId, redirectUri, lifespan = 43200) {
    const token = await IAMService.getToken();
    const baseURL = IAMService.getBaseUrl();
    const realm = this.getRealm();
    const config = IAMService.getConfig();
    const clientId = config?.resource || config?.clientId;

    const params = new URLSearchParams({
      userId,
      lifespan: String(lifespan),
      redirect_uri: redirectUri,
      client_id: clientId,
    });

    const url = `${baseURL}/admin/realms/${realm}/tideAdminResources/get-required-action-link?${params.toString()}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(['link-tide-account-action']),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`API error ${response.status}: ${errorText || response.statusText}`);
    }

    // Returns the URL as plain text, not JSON
    return response.text();
  }

  // ==========================================================================
  // User Roles
  // ==========================================================================

  async getUserRoles(userId) {
    const realm = this.getRealm();
    return this.fetch(`/admin/realms/${realm}/users/${userId}/role-mappings/realm`);
  }

  async addUserRoles(userId, roles) {
    const realm = this.getRealm();
    return this.fetch(`/admin/realms/${realm}/users/${userId}/role-mappings/realm`, {
      method: 'POST',
      body: JSON.stringify(roles),
    });
  }

  async removeUserRoles(userId, roles) {
    const realm = this.getRealm();
    return this.fetch(`/admin/realms/${realm}/users/${userId}/role-mappings/realm`, {
      method: 'DELETE',
      body: JSON.stringify(roles),
    });
  }

  // ==========================================================================
  // Policy Templates (Tide Admin) - Read only, templates managed elsewhere
  // ==========================================================================

  async getTemplates() {
    const realm = this.getRealm();
    try {
      return await this.fetch(`/admin/realms/${realm}/tide-admin/policy-templates`);
    } catch {
      return [];
    }
  }

  // ==========================================================================
  // Change Sets / Approvals (Tide Admin)
  // ==========================================================================

  /**
   * Get pending user change requests
   * @returns {Promise<Array>} Array of user change request objects
   */
  async getUserChangeRequests() {
    const realm = this.getRealm();
    try {
      const data = await this.fetch(`/admin/realms/${realm}/tide-admin/change-set/users/requests`);
      return (data || []).map(d => ({
        ...d,
        changeSetId: d.draftRecordId,
        changeSetType: d.changeSetType,
        actionType: d.actionType,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get pending role change requests
   * @returns {Promise<Array>} Array of role change request objects
   */
  async getRoleChangeRequests() {
    const realm = this.getRealm();
    try {
      const data = await this.fetch(`/admin/realms/${realm}/tide-admin/change-set/roles/requests`);
      return (data || []).map(d => ({
        ...d,
        changeSetId: d.draftRecordId,
        changeSetType: d.changeSetType,
        actionType: d.actionType,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get all pending change sets (users + roles)
   * @deprecated Use getUserChangeRequests() and getRoleChangeRequests() separately
   */
  async getPendingChangeSets() {
    const [users, roles] = await Promise.all([
      this.getUserChangeRequests(),
      this.getRoleChangeRequests(),
    ]);
    return [...users, ...roles];
  }

  /**
   * Add approval to a change request
   * @param {Object} changeSet - Change set object with changeSetId, actionType, changeSetType
   */
  async approveChangeSet(changeSet) {
    const realm = this.getRealm();
    const formData = new FormData();
    formData.append('changeSetId', changeSet.changeSetId);
    formData.append('actionType', changeSet.actionType);
    formData.append('changeSetType', changeSet.changeSetType);
    return this.fetchWithFormData(`/admin/realms/${realm}/tideAdminResources/add-review`, formData);
  }

  /**
   * Add rejection to a change request
   * @param {Object} changeSet - Change set object with changeSetId, actionType, changeSetType
   */
  async rejectChangeSet(changeSet) {
    const realm = this.getRealm();
    const formData = new FormData();
    formData.append('changeSetId', changeSet.changeSetId);
    formData.append('actionType', changeSet.actionType);
    formData.append('changeSetType', changeSet.changeSetType);
    return this.fetchWithFormData(`/admin/realms/${realm}/tideAdminResources/add-rejection`, formData);
  }

  /**
   * Commit a change request
   * @param {Object} changeSet - Change set object with changeSetId, actionType, changeSetType
   */
  async commitChangeSet(changeSet) {
    const realm = this.getRealm();
    return this.fetch(`/admin/realms/${realm}/tide-admin/change-set/commit`, {
      method: 'POST',
      body: JSON.stringify({
        changeSetId: changeSet.changeSetId,
        actionType: changeSet.actionType,
        changeSetType: changeSet.changeSetType,
      }),
    });
  }

  /**
   * Cancel a change request
   * @param {Object} changeSet - Change set object with changeSetId, actionType, changeSetType
   */
  async cancelChangeSet(changeSet) {
    const realm = this.getRealm();
    return this.fetch(`/admin/realms/${realm}/tide-admin/change-set/cancel`, {
      method: 'POST',
      body: JSON.stringify({
        changeSetId: changeSet.changeSetId,
        actionType: changeSet.actionType,
        changeSetType: changeSet.changeSetType,
      }),
    });
  }

  /**
   * Get raw change set requests for signing
   * @param {Object} changeSet - Change set object with changeSetId, actionType, changeSetType
   * @returns {Promise<Array>} Array of raw change set responses for signing
   */
  async getRawChangeSetRequest(changeSet) {
    const realm = this.getRealm();
    return this.fetch(`/admin/realms/${realm}/tide-admin/change-set/sign/batch`, {
      method: 'POST',
      body: JSON.stringify({ changeSets: [changeSet] }),
    });
  }

  /**
   * Add approval with a signed request
   * @param {Object} changeSet - Change set object with changeSetId, actionType, changeSetType
   * @param {string} signedRequest - The signed request string
   */
  async approveChangeSetWithSignature(changeSet, signedRequest) {
    const realm = this.getRealm();
    const formData = new FormData();
    formData.append('changeSetId', changeSet.changeSetId);
    formData.append('actionType', changeSet.actionType);
    formData.append('changeSetType', changeSet.changeSetType);
    formData.append('requests', signedRequest);
    return this.fetchWithFormData(`/admin/realms/${realm}/tideAdminResources/add-review`, formData);
  }

  // ==========================================================================
  // Logs
  // ==========================================================================

  async getAccessLogs(params = {}) {
    const realm = this.getRealm();
    const query = new URLSearchParams();
    if (params.first !== undefined) query.set('first', String(params.first));
    if (params.max !== undefined) query.set('max', String(params.max));
    const qs = query.toString();
    return this.fetch(`/admin/realms/${realm}/events${qs ? `?${qs}` : ''}`);
  }
}

// Export singleton instance
const adminAPI = new AdminAPI();
export default adminAPI;
export { AdminAPI };
