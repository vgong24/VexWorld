import { createInitialGame, makeParticipantObservation, serializeGameState, stepGame, validateGameState } from '../core/engine.mjs';
import { getCompanions, getHuman } from '../core/party.mjs';
import { FIXED_STEP_MS } from '../core/constants.mjs';
import { createInput } from './input.mjs';
import { createRenderer } from './renderer.mjs';
import { ServerSessionClient } from './network-client.mjs';

const canvas = document.querySelector('#game');
const renderer = createRenderer(canvas);
const input = createInput(window);
const query = new URLSearchParams(location.search);
const serverToken = query.get('token');
const serverBase = query.get('server') || location.origin;
const uuid = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const hostId = localStorage.getItem('vexworld.host-id') || `host.browser.${uuid}`;
localStorage.setItem('vexworld.host-id', hostId);

const ui = Object.fromEntries([
  'setup-panel','setup-error','save-slot','environment','human-name','human-form','human-color','companion-count','companion-setup',
  'continue-button','begin-button','saved-summary','server-options','use-server','session-id','party-panel','quest-panel','message-panel',
  'weather-label','world-label','combo-panel','combo-speaker','timing-marker','status-panel','status-content','status-button','status-close',
  'copy-session-button','release-session-button','pause-panel','resume-button','pause-setup-button'
].map((id) => [id.replaceAll('-', '_'), document.querySelector(`#${id}`)]));

let worldPackage;
let state = null;
let running = false;
let lastFrame = performance.now();
let accumulator = 0;
let activeClient = null;
let networkState = 'LOCAL_ONLY';
let remoteIntents = {};
let lastNetworkObservationAt = 0;
let lastNetworkIntentAt = 0;
let lastSaveAt = 0;
let lastLeaseRenewAt = 0;
let lastStatusRenderAt = 0;

const companionDefaults = [
  { name: 'Vex', form: 'WISP', color: '#94f1c8' },
  { name: 'Mira', form: 'SPROUTLING', color: '#f3a8d8' },
  { name: 'Rowan', form: 'LITTLE_WARDEN', color: '#9fc6ff' }
];

function saveKey(slot) {
  return `vexworld.first-grove.save.${slot}`;
}

function normalizeEnvironment(value) {
  if (value !== 'RANDOM') return value;
  const values = ['GARDEN_MEADOW','COAST','MOUNTAIN','ISLAND','DESERT','SNOWLAND'];
  return values[Math.floor(Math.random() * values.length)];
}

function makeCompanionRows() {
  const count = Number(ui.companion_count.value);
  const current = [...ui.companion_setup.querySelectorAll('.companion-row')].map((row) => ({
    name: row.querySelector('[data-field=name]')?.value,
    form: row.querySelector('[data-field=form]')?.value,
    color: row.querySelector('[data-field=color]')?.value,
    controller: row.querySelector('[data-field=controller]')?.value
  }));
  ui.companion_setup.replaceChildren();
  for (let index = 0; index < count; index += 1) {
    const value = { ...companionDefaults[index], ...(current[index] || {}) };
    const row = document.createElement('div');
    row.className = 'companion-row';
    row.innerHTML = `
      <label>Companion ${index + 1} name<input data-field="name" maxlength="28" value="${escapeHtml(value.name)}"></label>
      <label>First form<select data-field="form">
        ${['WISP','SPROUTLING','LITTLE_WARDEN'].map((form)=>`<option value="${form}" ${value.form===form?'selected':''}>${form.replaceAll('_',' ')}</option>`).join('')}
      </select></label>
      <label>Controller<select data-field="controller">
        <option value="LOCAL_DETERMINISTIC" ${value.controller!=='REMOTE_OLLAMA'&&value.controller!=='REMOTE_DETERMINISTIC'?'selected':''}>Local companion</option>
        <option value="REMOTE_OLLAMA" ${value.controller==='REMOTE_OLLAMA'?'selected':''} ${serverToken?'':'disabled'}>Remote Ollama worker${serverToken?'':' — open server URL first'}</option>
        <option value="REMOTE_DETERMINISTIC" ${value.controller==='REMOTE_DETERMINISTIC'?'selected':''} ${serverToken?'':'disabled'}>Remote test worker${serverToken?'':' — open server URL first'}</option>
      </select></label>
      <label>Accent<input data-field="color" type="color" value="${value.color}"></label>`;
    ui.companion_setup.append(row);
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (character) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[character]);
}

function collectSetup() {
  const companions = [...ui.companion_setup.querySelectorAll('.companion-row')].map((row) => ({
    displayName: row.querySelector('[data-field=name]').value.trim() || 'Companion',
    avatarForm: row.querySelector('[data-field=form]').value,
    color: row.querySelector('[data-field=color]').value,
    controllerClass: row.querySelector('[data-field=controller]').value
  }));
  return {
    saveSlot: Number(ui.save_slot.value),
    environment: normalizeEnvironment(ui.environment.value),
    sessionRef: ui.session_id.value.trim() || 'first-grove-home',
    human: {
      displayName: ui.human_name.value.trim() || 'Wanderer',
      avatarForm: ui.human_form.value,
      color: ui.human_color.value
    },
    companions
  };
}

function updateSaveSummary() {
  const slot = Number(ui.save_slot.value);
  const raw = localStorage.getItem(saveKey(slot));
  if (!raw) {
    ui.saved_summary.textContent = `Pair ${slot} has no local journey yet.`;
    ui.continue_button.disabled = false;
    return;
  }
  try {
    const saved = JSON.parse(raw);
    const region = saved.firstGrove?.currentRegionRef?.split('.').pop()?.replaceAll('-', ' ');
    ui.saved_summary.textContent = `Pair ${slot}: ${saved.environment?.replaceAll('_',' ')} • party ${saved.party?.members?.length || '?'} • ${region || 'First Grove'} • ${Math.round((saved.nowMs || 0)/1000)}s explored`;
  } catch {
    ui.saved_summary.textContent = `Pair ${slot} contains an unreadable local save.`;
  }
}

async function initializeNetwork(setup, { continueExisting }) {
  if (!serverToken || !ui.use_server.checked) {
    activeClient = null;
    networkState = 'LOCAL_ONLY';
    return null;
  }
  activeClient = new ServerSessionClient({ baseUrl: serverBase, token: serverToken, sessionRef: setup.sessionRef, hostId });
  networkState = 'CONNECTING';
  await activeClient.health();
  const prior = await activeClient.load();
  await activeClient.claimLease();
  networkState = 'HOST_LEASE_HELD';
  if (continueExisting && prior.checkpoint) {
    validateGameState(prior.checkpoint);
    return prior.checkpoint;
  }
  return null;
}

async function begin({ continueExisting = false } = {}) {
  ui.setup_error.textContent = '';
  try {
    const setup = collectSetup();
    const remoteRequested = setup.companions.some((companion) => companion.controllerClass.startsWith('REMOTE_'));
    if (remoteRequested && (!serverToken || !ui.use_server.checked)) {
      throw new Error('Remote companions require the LAN session option and the tokenized URL printed by npm run play or npm run play:lan.');
    }
    let loaded = null;
    if (serverToken && ui.use_server.checked) loaded = await initializeNetwork(setup, { continueExisting });
    if (!loaded && continueExisting) {
      const raw = localStorage.getItem(saveKey(setup.saveSlot));
      if (raw) {
        loaded = JSON.parse(raw);
        validateGameState(loaded);
      }
    }
    state = loaded || createInitialGame(worldPackage, setup);
    if (loaded && state.sessionRef !== setup.sessionRef && activeClient) state.sessionRef = setup.sessionRef;
    ui.setup_panel.classList.add('hidden');
    running = true;
    canvas.focus();
    lastFrame = performance.now();
    accumulator = 0;
    renderUi(true);
    await saveCurrentState(true);
  } catch (error) {
    ui.setup_error.textContent = `Could not begin: ${error.message}`;
    if (activeClient) {
      try { await activeClient.releaseLease(); } catch {}
      activeClient = null;
    }
    networkState = 'ERROR';
  }
}

async function saveCurrentState(force = false) {
  if (!state) return;
  const now = performance.now();
  if (!force && now - lastSaveAt < 3500) return;
  lastSaveAt = now;
  const checkpoint = serializeGameState(state);
  localStorage.setItem(saveKey(state.saveSlot), JSON.stringify(checkpoint));
  if (activeClient && networkState === 'HOST_LEASE_HELD') {
    try {
      await activeClient.save(checkpoint);
    } catch (error) {
      if (error.status === 409 && error.payload?.reason === 'VERSION_CONFLICT') {
        networkState = 'VERSION_CONFLICT';
        state.flags.paused = true;
      } else {
        networkState = 'CHECKPOINT_UNAVAILABLE';
      }
    }
  }
}

function sessionResumeUrl() {
  const url = new URL(location.href);
  if (state?.sessionRef) url.searchParams.set('session', state.sessionRef);
  return url.toString();
}

async function copyText(value, successMessage) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  if (state) state.messages.push({ speaker: 'Vextory', text: successMessage, at: state.nowMs });
}

async function saveReleaseAndReturnToGarden() {
  if (!state) return;
  state.flags.statusOpen = false;
  state.flags.paused = true;
  await saveCurrentState(true);
  if (activeClient) {
    try {
      await activeClient.releaseLease();
      networkState = 'LEASE_RELEASED';
    } catch {
      networkState = 'LEASE_RELEASE_UNCONFIRMED';
    }
    activeClient = null;
  }
  running = false;
  remoteIntents = {};
  ui.status_panel.classList.add('hidden');
  ui.pause_panel.classList.add('hidden');
  ui.setup_panel.classList.remove('hidden');
  updateSaveSummary();
  ui.setup_error.textContent = networkState === 'LEASE_RELEASE_UNCONFIRMED'
    ? 'Journey saved locally. The LAN host lease could not be confirmed released; another device may need to wait up to 15 seconds.'
    : 'Journey saved. Another device may now continue the same LAN session.';
}

async function networkTick() {
  if (!state || !activeClient || networkState !== 'HOST_LEASE_HELD') return;
  const now = performance.now();
  if (now - lastLeaseRenewAt > 5000) {
    lastLeaseRenewAt = now;
    try { await activeClient.renewLease(); } catch { networkState = 'LEASE_LOST'; state.flags.paused = true; }
  }
  const remoteCompanions = getCompanions(state.party).filter((member) => member.controllerBinding.controllerClass.startsWith('REMOTE_'));
  if (now - lastNetworkObservationAt > 650) {
    lastNetworkObservationAt = now;
    await Promise.all(remoteCompanions.map(async (member) => {
      try { await activeClient.publishObservation(member.participantRef, makeParticipantObservation(state, member.participantRef, worldPackage)); } catch {}
    }));
  }
  if (now - lastNetworkIntentAt > 300) {
    lastNetworkIntentAt = now;
    await Promise.all(remoteCompanions.map(async (member) => {
      try {
        const intent = await activeClient.pollIntent(member.participantRef);
        if (intent) remoteIntents[member.participantRef] = intent;
      } catch {}
    }));
  }
}

function partyMemberHtml(member) {
  const energy = Math.max(0, Math.min(100, (member.resources.energy / member.resources.maxEnergy) * 100));
  const controller = member.controllerBinding.controllerClass.replace('LOCAL_', '').replace('REMOTE_', 'REMOTE ');
  const meta = member.participantType === 'HUMAN' ? 'You' : `${controller}${member.flags.remoteIntentStale ? ' • fallback' : ''}`;
  return `<div class="party-member">
    <span class="party-avatar" style="background:${member.avatarExpression.color}"></span>
    <div><div class="party-name">${escapeHtml(member.displayName)}</div><div class="party-meta">${escapeHtml(meta)} • ${escapeHtml(member.resources.currentBand.replaceAll('_',' '))}</div><div class="energy-track"><div class="energy-fill" style="width:${energy}%"></div></div></div>
    <div class="party-number">${Math.round(member.resources.energy)}</div>
  </div>`;
}

function currentRegion() {
  return worldPackage?.map?.regions?.find((region) => region.regionRef === state?.firstGrove?.currentRegionRef) || null;
}

function renderStatus() {
  if (!state) return;
  const human = getHuman(state.party);
  const companions = getCompanions(state.party);
  const practices = Object.values(human.practice).sort((a,b)=>b.evidence-a.evidence).slice(0,6);
  const profiles = Object.values(state.resonanceProfiles || {});
  const facets = profiles.length
    ? profiles.map((profile) => `<b>${profile.participantRefs.map((ref)=>ref.split('.').pop()).join(' + ')}</b><br>${Object.entries(profile.facets).map(([name,value])=>`${name.replace(/([A-Z])/g,' $1')}: ${value.evidence.toFixed(1)}`).join('<br>')}`).join('<hr>')
    : 'No companion-pair resonance profile in this party.';
  const region = currentRegion();
  const journey = state.firstGrove || {};
  const remoteCommands = companions
    .filter((member) => member.controllerBinding.controllerClass.startsWith('REMOTE_'))
    .map((member, index) => {
      const mode = member.controllerBinding.controllerClass === 'REMOTE_OLLAMA' ? 'ollama' : 'deterministic';
      const command = `npm run agent -- --server ${serverBase} --token ${serverToken || '<token>'} --session ${state.sessionRef} --companion ${member.participantRef} --mode ${mode}${mode === 'ollama' ? ' --model qwen3.5' : ''}`;
      return `<div class="worker-command"><code>${escapeHtml(command)}</code><button type="button" data-copy-worker="${index}">Copy</button></div>`;
    });
  ui.status_content.innerHTML = `
    <article class="status-card"><h3>Who am I here?</h3><p><b>${escapeHtml(human.displayName)}</b> — ${escapeHtml(human.avatarExpression.form)}</p><p>Participant: <code>${escapeHtml(human.participantRef)}</code></p><p>Vessel: <code>${escapeHtml(human.vesselRef)}</code></p></article>
    <article class="status-card"><h3>Party</h3><p>${state.party.members.map((m)=>escapeHtml(m.displayName)).join(' • ')}</p><p>${state.party.members.length} / ${state.party.capacity}</p></article>
    <article class="status-card"><h3>Reality</h3><p><b>${escapeHtml(state.realityContext.realityClass.replaceAll('_',' '))}</b></p><p>Physical effect possible: <b>${state.realityContext.physicalEffectPossible}</b></p><p>Return: Garden of Arrival</p></article>
    <article class="status-card"><h3>Resources</h3><p>Energy: ${human.resources.energy.toFixed(1)} / ${human.resources.maxEnergy}</p><p>Return margin: ${human.resources.returnMargin.toFixed(1)}</p><p>${escapeHtml(human.resources.currentBand.replaceAll('_',' '))}</p></article>
    <article class="status-card"><h3>Practice</h3><p>${practices.length ? practices.map((p)=>`${escapeHtml(p.practiceRef.split('.').pop())}: ${escapeHtml(p.tier)} (${p.evidence.toFixed(1)})`).join('<br>') : 'Practice begins through meaningful use.'}</p></article>
    <article class="status-card"><h3>Bond resonance</h3><p>${facets}</p><p>No hidden affection or worth score.</p></article>
    <article class="status-card"><h3>First Grove journey</h3><p><b>${escapeHtml(region?.title || 'First Grove')}</b></p><p>Home: <code>${escapeHtml(journey.homeAnchorRef || 'UNKNOWN')}</code></p><p>Regions visited: ${(journey.visitedRegionRefs || []).length} • discoveries: ${(journey.discoveredRefs || []).length}</p><p>Origin lesson: ${escapeHtml(journey.originContext?.earlyTraversalCue?.replaceAll('_',' ') || 'UNKNOWN')}</p><p>Potential ceiling effect: <b>${escapeHtml(journey.originContext?.potentialCeilingEffect || 'UNKNOWN')}</b></p></article>
    <article class="status-card"><h3>World / quest</h3><p>${escapeHtml(state.quest.progressText)}</p><p>Weather: ${escapeHtml(state.weather.state)}</p><p>Twin Horizon: ${state.quest.twinHorizonUnlocked ? 'LEARNED' : state.quest.twinHorizonTrial}</p></article>
    <article class="status-card"><h3>Session</h3><p>${escapeHtml(networkState)}</p><p><code>${escapeHtml(state.sessionRef)}</code></p>${remoteCommands.length ? `<p>Remote worker command${remoteCommands.length > 1 ? 's' : ''}:</p>${remoteCommands.join('')}` : '<p>All companions are local.</p>'}<p class="tiny-note">The token is a trusted-LAN development credential. Do not post it publicly.</p></article>`;
  ui.status_content.querySelectorAll('[data-copy-worker]').forEach((button) => {
    button.addEventListener('click', () => {
      const member = companions.filter((candidate) => candidate.controllerBinding.controllerClass.startsWith('REMOTE_'))[Number(button.dataset.copyWorker)];
      if (!member) return;
      const mode = member.controllerBinding.controllerClass === 'REMOTE_OLLAMA' ? 'ollama' : 'deterministic';
      const command = `npm run agent -- --server ${serverBase} --token ${serverToken || '<token>'} --session ${state.sessionRef} --companion ${member.participantRef} --mode ${mode}${mode === 'ollama' ? ' --model qwen3.5' : ''}`;
      copyText(command, `${member.displayName}'s worker command copied.`);
    });
  });
  ui.copy_session_button.classList.toggle('hidden', !activeClient || !serverToken);
}

function renderUi(force = false) {
  if (!state) return;
  const region = currentRegion();
  ui.party_panel.innerHTML = state.party.members.map(partyMemberHtml).join('');
  ui.weather_label.textContent = state.weather.state.replaceAll('_',' ');
  ui.world_label.textContent = `${region?.title || 'First Grove'} • ${state.environment.replaceAll('_',' ')} • ${networkState}`;
  ui.quest_panel.innerHTML = `<strong>${state.quest.twinHorizonTrial === 'ACTIVE' ? 'Resonance Trial' : 'Current path'}</strong>${escapeHtml(state.quest.progressText)}`;
  ui.message_panel.innerHTML = state.messages.slice(-3).map((message)=>`<div class="message"><b>${escapeHtml(message.speaker)}</b>${escapeHtml(message.text)}</div>`).join('');
  const signal = state.activeTechniqueSignal;
  if (signal) {
    ui.combo_panel.classList.remove('hidden');
    const initiator = state.party.members.find((member)=>member.participantRef===signal.initiatorRef);
    ui.combo_speaker.textContent = `${initiator?.displayName || 'Companion'} signals`;
    const progress = Math.max(0, Math.min(1, (state.nowMs - signal.signalledAt) / (signal.expiresAt - signal.signalledAt)));
    ui.timing_marker.style.left = `${progress * 100}%`;
  } else ui.combo_panel.classList.add('hidden');
  ui.status_panel.classList.toggle('hidden', !state.flags.statusOpen);
  ui.pause_panel.classList.toggle('hidden', !state.flags.paused || state.flags.statusOpen);
  if (state.flags.statusOpen && (force || performance.now() - lastStatusRenderAt > 250)) {
    lastStatusRenderAt = performance.now();
    renderStatus();
  }
}

function frame(timestamp) {
  requestAnimationFrame(frame);
  if (!running || !state) return;
  const elapsed = Math.min(100, timestamp - lastFrame);
  lastFrame = timestamp;
  accumulator += elapsed;
  let firstInput = input.sample();
  while (accumulator >= FIXED_STEP_MS) {
    stepGame(state, firstInput, worldPackage, { dtMs: FIXED_STEP_MS, externalIntents: remoteIntents });
    firstInput = {};
    accumulator -= FIXED_STEP_MS;
  }
  renderer.render(state, worldPackage);
  renderUi();
  saveCurrentState();
  networkTick();
}

ui.companion_count.addEventListener('change', makeCompanionRows);
ui.save_slot.addEventListener('change', updateSaveSummary);
ui.begin_button.addEventListener('click', () => begin({ continueExisting: false }));
ui.continue_button.addEventListener('click', () => begin({ continueExisting: true }));
ui.status_button.addEventListener('click', () => { if (state) { state.flags.statusOpen = true; renderUi(true); } });
ui.status_close.addEventListener('click', () => { if (state) state.flags.statusOpen = false; });
ui.resume_button.addEventListener('click', () => { if (state) state.flags.paused = false; });
ui.copy_session_button.addEventListener('click', () => copyText(sessionResumeUrl(), 'LAN resume link copied.'));
ui.release_session_button.addEventListener('click', saveReleaseAndReturnToGarden);
ui.pause_setup_button.addEventListener('click', saveReleaseAndReturnToGarden);
window.addEventListener('beforeunload', () => {
  if (state) localStorage.setItem(saveKey(state.saveSlot), JSON.stringify(serializeGameState(state)));
  if (activeClient) activeClient.releaseLease().catch(()=>{});
});

try {
  worldPackage = await fetch('../../generated/first-grove.world-package.json', { cache: 'no-store' }).then((response) => {
    if (!response.ok) throw new Error('World Package is missing. Run npm run compile.');
    return response.json();
  });
  if (serverToken) {
    ui.server_options.classList.remove('hidden');
    ui.use_server.checked = true;
    ui.session_id.value = query.get('session') || 'first-grove-home';
  }
  makeCompanionRows();
  updateSaveSummary();
  requestAnimationFrame(frame);
} catch (error) {
  ui.setup_error.textContent = error.message;
}
