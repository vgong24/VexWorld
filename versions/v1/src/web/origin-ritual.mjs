const lines = Object.freeze({
  GARDEN_MEADOW: 'Rain beads on the grass. The Hearth is close, and the grove opens gently beyond it.',
  COAST: 'Salt mist reaches even this inland gate. Slick stones teach the first careful steps.',
  MOUNTAIN: 'A cool updraft moves through the branches. The first climb asks you to look upward.',
  ISLAND: 'Warm rain gathers on root bridges. The first path bends around water before it rises.',
  DESERT: 'Dry wind crosses the Garden. Shade markers make the first outward route legible.',
  SNOWLAND: 'Snow catches on the leaves. Warmth markers turn the first journey into a route between shelters.',
  RANDOM: 'The Garden will choose a beginning for you. Whatever arrives changes the first lesson, not your potential.'
});

function renderOriginRitual() {
  const select = document.querySelector('#environment');
  const note = document.querySelector('#origin-note');
  if (!select || !note) return;
  note.textContent = lines[select.value] || lines.GARDEN_MEADOW;
}

const environment = document.querySelector('#environment');
if (environment) environment.addEventListener('change', renderOriginRitual);
renderOriginRitual();

// [VXG RealForever]
