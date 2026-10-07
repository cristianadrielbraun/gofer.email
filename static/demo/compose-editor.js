/* Local adapters around Gofer's exported recipient and rich-text controls. */
function _markComposeDirty(form) {
  if (form) form.dataset.composeDirty = "true";
}
function _activeComposeRecipientSuggestion() { return null; }
function _hideComposeRecipientSuggestions() {}
function _scheduleComposeRecipientSuggestions() {}
function applyDefaultComposeSignature() { return Promise.resolve(false); }
function syncComposeEditor(editor) {
  const form = _composeFormFrom(editor);
  if (!form) return;
  form.querySelector('[name="body"]').value = _composeEditorText(editor);
  form.querySelector('[name="html_body"]').value = editor.innerHTML;
}
function loadComposeSignatures() {
  return Promise.resolve({ signatures: [{ name: "Studio", html: "<p><strong>Alex Morgan</strong><br>Atelier Studio<br>alex@atelier.example</p>" }] });
}
function insertComposeSignature(form, signature) {
  const editor = form.querySelector('[data-compose-editor]');
  const existing = editor.querySelector('[data-demo-compose-signature]');
  const signatureNode = document.createElement('div');
  signatureNode.dataset.demoComposeSignature = "";
  signatureNode.innerHTML = signature.html;
  if (existing) existing.replaceWith(signatureNode);
  else {
    editor.focus();
    _restoreComposeSelection(editor);
    document.execCommand('insertHTML', false, signatureNode.outerHTML);
    if (!editor.querySelector('[data-demo-compose-signature]')) editor.appendChild(signatureNode);
  }
  editor.querySelector('[data-demo-compose-signature]').scrollIntoView({ block: 'nearest' });
  syncComposeEditor(editor);
  return true;
}
function _composeAttachmentLooksInlineable() { return false; }
function removeComposeAttachment(item) {
  const form = _composeFormFrom(item);
  item.remove();
  if (!form.querySelector('[data-compose-attachment]')) form.querySelector('[data-compose-attachments]').classList.add('hidden');
  updateComposeAttachmentSummary(form);
}

// Lock the list's contents without temporarily resizing the visible flex layout.
function _freezeComposeMailList(list, opening) {
  const style = getComputedStyle(list);
  let outerWidth = list.getBoundingClientRect().width;
  let borders = (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0);
  if (opening) {
    const parent = list.parentElement;
    const measurement = document.createElement('div');
    measurement.style.cssText = `position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;width:${parent.clientWidth}px;`;
    const probe = list.cloneNode(false);
    probe.removeAttribute('id');
    probe.style.cssText = `display:block;box-sizing:border-box;width:${list._savedWidth};min-width:0;transition:none;`;
    measurement.append(probe);
    document.body.append(measurement);
    const measured = getComputedStyle(probe);
    outerWidth = parseFloat(measured.width);
    borders = (parseFloat(measured.borderLeftWidth) || 0) + (parseFloat(measured.borderRightWidth) || 0);
    measurement.remove();
  }
  list._demoTargetWidth = outerWidth;
  const width = outerWidth - borders - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
  if (!opening) list.style.width = `${outerWidth}px`;
  if (width <= 0) return;
  // The list is the container for the header's @container rules. Hand that role to the
  // frozen children so the header keeps its layout while the list itself shrinks.
  list._demoContainerType = list.style.containerType;
  list.style.containerType = 'normal';
  list._demoFrozenChildren = [...list.children].map(child => {
    const previous = { width: child.style.width, minWidth: child.style.minWidth, maxWidth: child.style.maxWidth, containerType: child.style.containerType, paddingInline: child.style.paddingInline };
    Object.assign(child.style, { width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px`, containerType: 'inline-size' });
    // An element cannot query itself, so mirror the header's own narrow-list padding rule.
    if (width <= 360 && child.matches('.mail-list-header')) child.style.paddingInline = '.75rem';
    return { child, previous };
  });
}
function _releaseComposeMailList(list) {
  for (const { child, previous } of list._demoFrozenChildren || []) Object.assign(child.style, previous);
  if (list._demoFrozenChildren) list.style.containerType = list._demoContainerType;
  delete list._demoFrozenChildren;
  delete list._demoContainerType;
  delete list._demoTargetWidth;
}
function _animateComposePane(axis) {
  const pane = document.querySelector('[data-compose-pane]');
  if (!pane) return;
  pane.style.animation = 'none';
  void pane.offsetWidth;
  pane.style.animation = `${axis === 'height' ? 'pane-slide-up-in' : 'pane-slide-in'} 0.3s ease-out`;
}

window.GoferDemoCompose = (() => {
  let attachmentId = 0;
  function initialize(node) {
    node.querySelectorAll('[data-compose-recipient-field]').forEach(field => {
      field.dataset.demoComposeAction = 'recipient-focus';
      const input = field.querySelector('[data-compose-recipient-input]');
      input.contentEditable = 'true';
      input.removeAttribute('aria-readonly');
      input.addEventListener('keydown', handleComposeRecipientKeydown);
      input.addEventListener('input', () => handleComposeRecipientInput(input));
      input.addEventListener('blur', () => finalizeComposeRecipientInput(input));
      renderComposeRecipientField(field, field.dataset.recipientName === 'to' ? 'Mira Chen <mira@example.com>' : '');
    });
    node.querySelectorAll('[data-compose-editor]').forEach(editor => {
      editor.contentEditable = 'true';
      editor.removeAttribute('aria-readonly');
      editor.addEventListener('focus', () => setActiveComposeEditor(editor));
      editor.addEventListener('input', () => { composeChanged(editor); updateComposeToolbar(editor); });
      editor.addEventListener('keyup', () => updateComposeToolbar(editor));
      editor.addEventListener('mouseup', () => updateComposeToolbar(editor));
      editor.addEventListener('paste', event => {
        event.preventDefault();
        const html = event.clipboardData.getData('text/html');
        const text = event.clipboardData.getData('text/plain');
        document.execCommand('insertHTML', false, html ? _sanitizeComposeHTML(html) : _composePlainToHTML(text));
        composeChanged(editor);
      });
      syncComposeEditor(editor);
    });
    node.querySelectorAll('[data-compose-attachment-input],[data-compose-inline-input]').forEach(input => {
      input.addEventListener('change', async () => {
        const form = _composeFormFrom(input);
        for (const file of input.files) {
          if (input.matches('[data-compose-attachment-input]')) {
            addComposeAttachment(form, { id: `demo-attachment-${++attachmentId}`, filename: file.name, content_type: file.type, size: file.size });
          } else if (file.type.startsWith('image/')) {
            const source = await new Promise(resolve => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(file);
            });
            if (!source || !form.isConnected) continue;
            const editor = form.querySelector('[data-compose-editor]');
            const image = document.createElement('img');
            image.src = source;
            image.alt = file.name;
            image.style.maxWidth = '100%';
            editor.focus();
            _restoreComposeSelection(editor);
            document.execCommand('insertHTML', false, image.outerHTML);
            composeChanged(editor);
          }
        }
        input.value = '';
      });
    });
  }

  function copy(source, target) {
    if (!source || !target) return;
    finalizeComposeRecipients(source);
    for (const name of ['to', 'cc', 'bcc', 'subject', 'account_id']) {
      target.querySelector(`[name="${name}"]`).value = source.querySelector(`[name="${name}"]`).value;
    }
    renderComposeRecipientFields(target);
    const account = target.querySelector('[name="account_id"]').value;
    const option = [...target.querySelectorAll('[data-compose-account-item]')].find(item => item.dataset.accountId === account);
    if (option) selectComposeAccount(option, target.id === 'compose-pane-form');
    target.querySelector('[data-compose-editor]').innerHTML = source.querySelector('[data-compose-editor]').innerHTML;
    syncComposeEditor(target.querySelector('[data-compose-editor]'));
    for (const name of ['cc', 'bcc']) {
      const prefix = target.id === 'compose-pane-form' ? 'pane-' : '';
      const sourcePrefix = source.id === 'compose-pane-form' ? 'pane-' : '';
      const visible = !source.querySelector(`#${sourcePrefix}${name}-field`).classList.contains('hidden');
      target.querySelector(`#${prefix}${name}-field`).classList.toggle('hidden', !visible);
      target.querySelector(`#${prefix}${name}-btn`).classList.toggle('hidden', visible);
    }
    renderComposeAttachments(target, readComposeAttachments(source));
  }

  function action(element) {
    switch (element.dataset.demoComposeAction) {
      case 'recipient-focus': focusComposeRecipientField(element); break;
      case 'account': selectComposeAccount(element, element.dataset.composeAccountScope === 'pane'); break;
      case 'format': composeExec(element, element.dataset.demoComposeCommand, element.dataset.demoComposeValue); break;
      case 'link': composeCreateLink(element); break;
      case 'signature': {
        const tooltip = element.closest('[data-tui-popover-root]')?.querySelector(':scope > [data-tui-popover-content]');
        window.tui?.popover?.closeElement(element);
        if (tooltip?.matches(':popover-open')) tooltip.hidePopover();
        showComposeSignaturePicker(element);
        break;
      }
      case 'attachment': _composeFormFrom(element).querySelector('[data-compose-attachment-input]').click(); break;
      case 'image': {
        _saveComposeSelection(_composeEditorFrom(element));
        _composeFormFrom(element).querySelector('[data-compose-inline-input]').click();
        break;
      }
      case 'attachments': toggleComposeAttachments(element); break;
    }
  }
  document.addEventListener('mousedown', event => {
    if (event.target.closest('[data-demo-compose-action="format"]')) event.preventDefault();
  });
  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    const editor = selection?.anchorNode?.parentElement?.closest('[data-compose-editor]');
    if (editor) setActiveComposeEditor(editor);
  });
  return { initialize, copy, action };
})();
