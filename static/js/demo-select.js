/* Website controls shared by the embedded and full-size previews. */
(() => {
  const controls = [];
  document.querySelectorAll('[data-demo-select]').forEach(control => {
    const choices = Object.entries(JSON.parse(control.dataset.options));
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'gofer-button gofer-button-secondary demo-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    const valueLabel = document.createElement('span');
    valueLabel.id = `${control.id}-value`;
    trigger.setAttribute('aria-labelledby', `${control.getAttribute('aria-labelledby')} ${valueLabel.id}`);
    trigger.append(valueLabel);
    const menu = document.createElement('div');
    menu.id = `${control.id}-options`;
    menu.className = 'demo-select-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-labelledby', control.getAttribute('aria-labelledby'));
    trigger.setAttribute('aria-controls', menu.id);
    let value = control.dataset.value || choices[0][0];
    const options = choices.map(([key, label]) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'demo-select-option';
      option.textContent = label;
      option.dataset.value = key;
      option.tabIndex = -1;
      option.setAttribute('role', 'option');
      option.addEventListener('click', () => {
        const changed = value !== key;
        control.value = key;
        close(true);
        if (changed) control.dispatchEvent(new Event('change', { bubbles: true }));
      });
      menu.append(option);
      return option;
    });
    const close = (restoreFocus = false) => {
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      if (restoreFocus) trigger.focus();
    };
    const open = (last = false) => {
      controls.forEach(other => { if (other.control !== control) other.close(); });
      menu.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      (last ? options.at(-1) : options.find(option => option.dataset.value === value) || options[0]).focus();
    };
    Object.defineProperty(control, 'value', {
      get: () => value,
      set: next => {
        const choice = choices.find(([key]) => key === next);
        if (!choice) return;
        value = next;
        valueLabel.textContent = choice[1];
        options.forEach(option => option.setAttribute('aria-selected', String(option.dataset.value === value)));
      },
    });
    trigger.addEventListener('click', () => menu.hidden ? open() : close());
    control.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !menu.hidden) {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      } else if (event.key === 'Tab') { if (!menu.hidden) close(true); }
      else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        if (menu.hidden) { open(event.key === 'End'); return; }
        const current = options.indexOf(document.activeElement);
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        options[index].focus();
      } else if (!menu.hidden && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.key !== ' ') {
        const option = options.find(option => option.textContent.toLowerCase().startsWith(event.key.toLowerCase()));
        if (option) { event.preventDefault(); option.focus(); }
      }
    });
    control.append(trigger, menu);
    control.value = value;
    controls.push({ control, close });
  });
  document.addEventListener('click', event => controls.forEach(({ control, close }) => { if (!control.contains(event.target)) close(); }));
  document.addEventListener('focusin', event => controls.forEach(({ control, close }) => { if (!control.contains(event.target)) close(); }));
  window.addEventListener('blur', () => controls.forEach(({ close }) => close()));
})();
