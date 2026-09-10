const HOLD_BINDINGS = new Map([
  ['KeyA', 'left'], ['ArrowLeft', 'left'], ['KeyD', 'right'], ['ArrowRight', 'right']
]);
const PRESS_BINDINGS = new Map([
  ['Space', 'jumpPressed'], ['KeyJ', 'attackPressed'], ['KeyK', 'dashPressed'],
  ['KeyE', 'comboPressed'], ['KeyF', 'interactPressed'], ['KeyG', 'carryPressed'],
  ['KeyQ', 'specialPressed'], ['Tab', 'statusPressed'], ['KeyI', 'statusPressed'],
  ['KeyP', 'pausePressed'], ['Escape', 'pausePressed'], ['KeyT', 'weatherPressed']
]);

export function createInput(target = window) {
  const held = { left: false, right: false };
  const pressed = new Set();
  const prevent = new Set([...HOLD_BINDINGS.keys(), ...PRESS_BINDINGS.keys()]);

  target.addEventListener('keydown', (event) => {
    if (prevent.has(event.code)) event.preventDefault();
    const hold = HOLD_BINDINGS.get(event.code);
    if (hold) held[hold] = true;
    const press = PRESS_BINDINGS.get(event.code);
    if (press && !event.repeat) pressed.add(press);
  });
  target.addEventListener('keyup', (event) => {
    const hold = HOLD_BINDINGS.get(event.code);
    if (hold) held[hold] = false;
  });
  target.addEventListener('blur', () => {
    held.left = false;
    held.right = false;
    pressed.clear();
  });

  for (const button of document.querySelectorAll('[data-hold]')) {
    const key = button.dataset.hold;
    const on = (event) => { event.preventDefault(); held[key] = true; };
    const off = (event) => { event.preventDefault(); held[key] = false; };
    button.addEventListener('pointerdown', on);
    button.addEventListener('pointerup', off);
    button.addEventListener('pointercancel', off);
    button.addEventListener('pointerleave', off);
  }
  for (const button of document.querySelectorAll('[data-press]')) {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      pressed.add(button.dataset.press);
    });
  }

  return {
    sample() {
      const frame = { ...held };
      for (const key of pressed) frame[key] = true;
      pressed.clear();
      return frame;
    },
    press(action) { pressed.add(action); }
  };
}
