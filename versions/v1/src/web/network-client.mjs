export function buildReturnReconciliation(record, localCheckpoint, {
  hostId,
  now = Date.now(),
  maxReceipts = 6
} = {}) {
  const checkpoint = record?.checkpoint && typeof record.checkpoint === 'object' ? record.checkpoint : null;
  const sameSessionLocal = checkpoint && localCheckpoint?.sessionRef === checkpoint.sessionRef
    ? localCheckpoint
    : null;
  const liveLease = record?.hostLease && Number(record.hostLease.expiresAt) > Number(now)
    ? record.hostLease
    : null;
  const takeoverState = liveLease
    ? (liveLease.hostId === hostId ? 'HELD_BY_THIS_BROWSER' : 'WAIT_FOR_RELEASE_OR_EXPIRY')
    : 'READY_TO_CLAIM';
  const localReceiptRefs = new Set(
    Array.isArray(sameSessionLocal?.receipts)
      ? sameSessionLocal.receipts.map((receipt) => receipt?.receiptRef).filter(Boolean)
      : []
  );
  const receiptLimit = Number.isInteger(maxReceipts) && maxReceipts >= 0 ? maxReceipts : 6;
  const recentCanonicalReceipts = checkpoint && Array.isArray(checkpoint.receipts)
    ? checkpoint.receipts
      .filter((receipt) => receipt?.receiptRef && !localReceiptRefs.has(receipt.receiptRef))
      .slice(-receiptLimit)
      .map((receipt) => ({
        receiptRef: receipt.receiptRef,
        type: receipt.type || 'UNKNOWN',
        at: Number(receipt.at || 0)
      }))
    : [];
  const currentRegionRef = checkpoint?.firstGrove?.currentRegionRef || null;
  const fromRegionRef = sameSessionLocal?.firstGrove?.currentRegionRef || null;
  return Object.freeze({
    schemaVersion: 'vexworld.return-reconciliation/v1',
    sessionRef: record?.sessionRef || checkpoint?.sessionRef || null,
    stateVersion: Number.isInteger(record?.stateVersion) ? record.stateVersion : null,
    canonicalCheckpointPresent: Boolean(checkpoint),
    canonicalTick: Number.isFinite(checkpoint?.tick) ? Number(checkpoint.tick) : null,
    canonicalNowMs: Number.isFinite(checkpoint?.nowMs) ? Number(checkpoint.nowMs) : null,
    currentRegionRef,
    localBaselineUsed: Boolean(sameSessionLocal),
    fromRegionRef,
    ticksAdvanced: sameSessionLocal && Number.isFinite(checkpoint?.tick) && Number.isFinite(sameSessionLocal?.tick)
      ? Number(checkpoint.tick) - Number(sameSessionLocal.tick)
      : null,
    simulationMsAdvanced: sameSessionLocal && Number.isFinite(checkpoint?.nowMs) && Number.isFinite(sameSessionLocal?.nowMs)
      ? Number(checkpoint.nowMs) - Number(sameSessionLocal.nowMs)
      : null,
    recentCanonicalReceipts,
    takeoverState,
    liveLease: liveLease ? Object.freeze({
      hostId: liveLease.hostId,
      generation: Number(liveLease.generation || 0),
      expiresAt: Number(liveLease.expiresAt)
    }) : null,
    projectionOnly: true,
    privateConversationImported: false,
    relationshipWorthInferred: false,
    narrativeInvented: false
  });
}

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

  async pollUtterance(participantRef) {
    return this.request(`/api/v1/sessions/${encodeURIComponent(this.sessionRef)}/companions/${encodeURIComponent(participantRef)}/utterance`);
  }
}
