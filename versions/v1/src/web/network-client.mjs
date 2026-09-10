export class ServerSessionClient {
  constructor({ baseUrl = location.origin, token, sessionRef, hostId }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
    this.sessionRef = sessionRef;
    this.hostId = hostId;
    this.stateVersion = 0;
    this.lease = null;
  }

  async request(path, options = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.token}`,
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(payload.error || payload.reason || `HTTP ${response.status}`), { status: response.status, payload });
    return payload;
  }

  async health() {
    return this.request('/api/v1/health');
  }

  async load() {
    const record = await this.request(`/api/v1/sessions/${encodeURIComponent(this.sessionRef)}`);
    this.stateVersion = record.stateVersion;
    this.lease = record.hostLease;
    return record;
  }

  async claimLease() {
    const result = await this.request(`/api/v1/sessions/${encodeURIComponent(this.sessionRef)}/lease`, {
      method: 'POST', body: JSON.stringify({ action: 'claim', hostId: this.hostId, ttlMs: 15000 })
    });
    this.lease = result.lease;
    this.stateVersion = result.stateVersion;
    return result;
  }

  async renewLease() {
    return this.claimLease();
  }

  async releaseLease() {
    try {
      return await this.request(`/api/v1/sessions/${encodeURIComponent(this.sessionRef)}/lease`, {
        method: 'POST', body: JSON.stringify({ action: 'release', hostId: this.hostId })
      });
    } finally {
      this.lease = null;
    }
  }

  async save(checkpoint) {
    const result = await this.request(`/api/v1/sessions/${encodeURIComponent(this.sessionRef)}/checkpoint`, {
      method: 'PUT',
      headers: { 'x-vexworld-host-id': this.hostId },
      body: JSON.stringify({ expectedVersion: this.stateVersion, checkpoint })
    });
    this.stateVersion = result.stateVersion;
    return result;
  }

  async publishObservation(participantRef, observation) {
    return this.request(`/api/v1/sessions/${encodeURIComponent(this.sessionRef)}/companions/${encodeURIComponent(participantRef)}/observation`, {
      method: 'PUT', body: JSON.stringify(observation)
    });
  }

  async pollIntent(participantRef) {
    return this.request(`/api/v1/sessions/${encodeURIComponent(this.sessionRef)}/companions/${encodeURIComponent(participantRef)}/intent`);
  }
}
