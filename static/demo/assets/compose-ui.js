var _activeComposeEditor = null; var _composeSignatureMenu = null; var _composeSignatureDismiss = null;
function _composeRecipientEmail(value) {
  value = String(value || "").trim()
  var match = value.match(/<([^<>\s]+@[^<>\s]+)>/)
  return (match ? match[1] : value).replace(/^mailto:/i, "").trim().toLowerCase()
}

function _isComposeRecipientValid(value) {
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(_composeRecipientEmail(value))
}

function _splitComposeRecipients(value) {
  return String(value || "")
    .split(/[;,\n]+/) 
    .map(function (part) { return part.trim() })
    .filter(Boolean)
}

function focusComposeRecipientField(field) {
  var input = field && field.querySelector ? field.querySelector("[data-compose-recipient-input]") : null
  if (input) input.focus()
}

function _composeRecipientValueInput(field) {
  var form = field && field.closest ? field.closest("#compose-form, #compose-pane-form") : null
  return form ? form.querySelector('input[name="' + field.dataset.recipientName + '"]') : null
}

function _composeRecipientValues(field) {
  var chips = field ? field.querySelectorAll("[data-compose-recipient-chip]") : []
  var values = []
  for (var i = 0; i < chips.length; i++) values.push(chips[i].dataset.value || chips[i].textContent.trim())
  return values
}

function _syncComposeRecipientField(field) {
  var hidden = _composeRecipientValueInput(field)
  if (hidden) hidden.value = _composeRecipientValues(field).join(", ")
}

function _makeComposeRecipientChip(value) {
  var chip = document.createElement("span")
  chip.dataset.composeRecipientChip = ""
  chip.dataset.value = value
  chip.className = "compose-recipient-chip"
  if (_isComposeRecipientValid(value)) {
    chip.dataset.valid = "true"
  } else {
    chip.dataset.valid = "false"
  }
  var label = document.createElement("span")
  label.className = "truncate"
  label.textContent = value
  var remove = document.createElement("button")
  remove.type = "button"
  remove.className = "compose-recipient-remove"
  remove.setAttribute("aria-label", "Remove recipient")
  remove.textContent = "x"
  remove.onclick = function () {
    var field = chip.closest("[data-compose-recipient-field]")
    removeComposeRecipientChip(chip)
  }
  chip.appendChild(label)
  chip.appendChild(remove)
  return chip
}

function removeComposeRecipientChip(chip) {
  if (!chip || chip.dataset.removing === "true") return
  var field = chip.closest("[data-compose-recipient-field]")
  chip.dataset.removing = "true"
  chip.classList.add("compose-recipient-chip-removing")
  setTimeout(function () {
    chip.remove()
    _syncComposeRecipientField(field)
    _markComposeDirty(_composeFormFrom(field))
  }, 140)
}

function renderComposeRecipientField(field, value) {
  if (!field) return
  var input = field.querySelector("[data-compose-recipient-input]")
  if (!input) return
  var existing = field.querySelectorAll("[data-compose-recipient-chip]")
  for (var i = 0; i < existing.length; i++) existing[i].remove()
  var seen = {}
  var tokens = _splitComposeRecipients(value)
  for (var t = 0; t < tokens.length; t++) {
    var email = _composeRecipientEmail(tokens[t])
    if (seen[email]) continue
    seen[email] = true
    field.insertBefore(_makeComposeRecipientChip(tokens[t]), input)
  }
  input.textContent = ""
  _syncComposeRecipientField(field)
}

function renderComposeRecipientFields(form) {
  if (!form) return
  var recipientFields = form.querySelectorAll("[data-compose-recipient-field]")
  for (var i = 0; i < recipientFields.length; i++) {
    var hidden = _composeRecipientValueInput(recipientFields[i])
    renderComposeRecipientField(recipientFields[i], hidden ? hidden.value : "")
  }
}

function finalizeComposeRecipientInput(input) {
  var field = input && input.closest ? input.closest("[data-compose-recipient-field]") : null
  if (!field) return
  _hideComposeRecipientSuggestions(field)
  var text = input.textContent || ""
  if (!text.trim()) return
  var merged = _composeRecipientValues(field).concat(_splitComposeRecipients(text)).join(", ")
  renderComposeRecipientField(field, merged)
  _markComposeDirty(_composeFormFrom(field))
}

function handleComposeRecipientKeydown(event) {
  var input = event.currentTarget
  var field = input.closest("[data-compose-recipient-field]")
  var activeSuggestion = _activeComposeRecipientSuggestion(field)
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    var box = field && field.querySelector ? field.querySelector("[data-compose-recipient-suggestions]") : null
    if (box && !box.hidden) {
      event.preventDefault()
      var idx = parseInt(field.dataset.suggestionIndex || "0", 10)
      _setComposeRecipientSuggestionIndex(field, idx + (event.key === "ArrowDown" ? 1 : -1))
      return
    }
  }
  if (event.key === "Enter" && activeSuggestion) {
    event.preventDefault()
    _selectComposeRecipientSuggestion(input, activeSuggestion)
    return
  }
  if (event.key === "Escape") {
    _hideComposeRecipientSuggestions(field)
    return
  }
  if (event.key === "Enter" || event.key === "Tab" || event.key === "," || event.key === ";") {
    if ((input.textContent || "").trim()) {
      event.preventDefault()
      finalizeComposeRecipientInput(input)
    }
    return
  }
  if (event.key === "Backspace" && !(input.textContent || "").trim()) {
    var chips = field.querySelectorAll("[data-compose-recipient-chip]")
    if (chips.length) {
      removeComposeRecipientChip(chips[chips.length - 1])
    }
  }
}

function handleComposeRecipientInput(input) {
  var text = input.textContent || ""
  if (/[;,\n]/.test(text)) finalizeComposeRecipientInput(input)
  else _scheduleComposeRecipientSuggestions(input)
}

function finalizeComposeRecipients(form) {
  if (!form) return true
  var fields = form.querySelectorAll("[data-compose-recipient-field]")
  var valid = true
  for (var i = 0; i < fields.length; i++) {
    var input = fields[i].querySelector("[data-compose-recipient-input]")
    if (input) finalizeComposeRecipientInput(input)
    _syncComposeRecipientField(fields[i])
    var chips = fields[i].querySelectorAll("[data-compose-recipient-chip]")
    for (var c = 0; c < chips.length; c++) {
      if (!_isComposeRecipientValid(chips[c].dataset.value)) valid = false
    }
  }
  return valid
}

function _composeFormFrom(el) {
  if (el && el.closest) {
    var form = el.closest("#compose-form, #compose-pane-form")
    if (form) return form
  }
  if (_activeComposeEditor) return _activeComposeEditor.closest("#compose-form, #compose-pane-form")
  return document.querySelector("[data-compose-pane]") ? document.getElementById("compose-pane-form") : document.getElementById("compose-form")
}

function _composeEditorFrom(el) {
  var form = _composeFormFrom(el)
  return form ? form.querySelector("[data-compose-editor]") : _activeComposeEditor
}

function setActiveComposeEditor(editor) {
  _activeComposeEditor = editor
  _saveComposeSelection(editor)
  updateComposeToolbar(editor)
}

function _saveComposeSelection(editor) {
  if (!editor) return
  var selection = window.getSelection && window.getSelection()
  if (!selection || !selection.rangeCount) return
  var anchor = selection.anchorNode
  if (anchor && editor.contains(anchor)) {
    editor._composeRange = selection.getRangeAt(0).cloneRange()
  }
}

function _restoreComposeSelection(editor) {
  if (!editor || !editor._composeRange) return
  var selection = window.getSelection && window.getSelection()
  if (!selection) return
  selection.removeAllRanges()
  selection.addRange(editor._composeRange)
}

function _escapeComposeHTML(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function _composePlainToHTML(text) {
  var lines = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
  var html = ""
  for (var i = 0; i < lines.length; i++) {
    html += _escapeComposeHTML(lines[i])
    if (i < lines.length - 1) html += "<br>"
  }
  return html
}

function _sanitizeComposeImageStyle(style) {
  var out = []
  var width = String(style || "").match(/(?:^|;)\s*width\s*:\s*(\d{1,4})(px|%)\s*(?:;|$)/i)
  if (width) out.push("width: " + Math.min(1200, Math.max(1, Number(width[1]))) + width[2])
  var transform = String(style || "").match(/(?:^|;)\s*transform\s*:[^;]*rotate\(\s*(-?\d{1,4})deg\s*\)/i)
  var rotate = transform ? "rotate(" + (Number(transform[1]) % 360) + "deg)" : ""
  var flip = /(?:^|;)\s*transform\s*:.*scaleX\(\s*-1\s*\)/i.test(String(style || "")) ? "scaleX(-1)" : ""
  if (rotate || flip) out.push("transform: " + [rotate, flip].filter(Boolean).join(" "))
  return out.join("; ")
}

function _sanitizeComposeStyle(style) {
  var safe = []
  var allowed = {
    "background": true, "background-color": true, "border": true, "border-bottom": true, "border-collapse": true,
    "border-left": true, "border-radius": true, "border-right": true, "border-spacing": true, "border-top": true,
    "color": true, "display": true, "font": true, "font-family": true, "font-size": true, "font-style": true,
    "font-weight": true, "height": true, "letter-spacing": true, "line-height": true, "margin": true,
    "margin-bottom": true, "margin-left": true, "margin-right": true, "margin-top": true, "max-height": true,
    "max-width": true, "min-height": true, "min-width": true, "mso-line-height-rule": true, "opacity": true,
    "overflow": true, "padding": true, "padding-bottom": true, "padding-left": true, "padding-right": true, "padding-top": true,
    "text-align": true, "text-decoration": true, "text-transform": true, "vertical-align": true, "white-space": true,
    "width": true, "word-break": true, "word-wrap": true
  }
  String(style || "").split(";").forEach(function (part) {
    var idx = part.indexOf(":")
    if (idx <= 0) return
    var prop = part.slice(0, idx).trim().toLowerCase()
    var value = part.slice(idx + 1).trim()
    if (!allowed[prop] || !value) return
    if (/expression\s*\(|javascript:|vbscript:|-moz-binding|behavior\s*:/i.test(value)) return
    if (/url\s*\(/i.test(value) && !/url\s*\(\s*['"]?https?:/i.test(value)) return
    safe.push(prop + ": " + value)
  })
  return safe.join("; ")
}

function _mergeComposeStyle(el, styleText) {
  var safeStyle = _sanitizeComposeStyle(styleText)
  if (!safeStyle) return
  var existing = el.getAttribute("style") || ""
  el.setAttribute("style", existing ? existing + "; " + safeStyle : safeStyle)
}

function _inlineComposeStyleRules(root) {
  var styles = root.querySelectorAll("style")
  for (var i = 0; i < styles.length; i++) {
    var css = styles[i].textContent || ""
    if (!css.trim()) continue
    var parserDoc = document.implementation.createHTMLDocument("")
    var styleEl = parserDoc.createElement("style")
    styleEl.textContent = css
    parserDoc.head.appendChild(styleEl)
    try {
      var rules = styleEl.sheet ? styleEl.sheet.cssRules : []
      for (var r = 0; r < rules.length; r++) {
        if (!rules[r].selectorText || !rules[r].style) continue
        var styleText = rules[r].style.cssText || ""
        var selectors = rules[r].selectorText.split(",")
        for (var s = 0; s < selectors.length; s++) {
          var selector = selectors[s].trim()
          if (!selector || /:(?!first-child|last-child)/.test(selector)) continue
          try {
            if (/^(html|body)$/i.test(selector)) {
              var body = root.querySelector("body")
              var targets = body ? body.children : root.children
              for (var t = 0; t < targets.length; t++) _mergeComposeStyle(targets[t], styleText)
              continue
            }
            var nodes = root.querySelectorAll(selector)
            for (var n = 0; n < nodes.length; n++) _mergeComposeStyle(nodes[n], styleText)
          } catch (e) {}
        }
      }
    } catch (e) {}
  }
}

function _sanitizeComposeHTML(html) {
  var template = document.createElement("template")
  template.innerHTML = html || ""
  _inlineComposeStyleRules(template.content)
  var blocked = template.content.querySelectorAll("script, style, head, title, iframe, object, embed, form, meta, link")
  for (var i = 0; i < blocked.length; i++) blocked[i].remove()
  var allowed = { A: true, B: true, BIG: true, BLOCKQUOTE: true, BR: true, CENTER: true, CODE: true, COL: true, COLGROUP: true, DIV: true, EM: true, FONT: true, H1: true, H2: true, H3: true, H4: true, H5: true, H6: true, HR: true, I: true, IMG: true, LI: true, OL: true, P: true, PRE: true, S: true, SMALL: true, SPAN: true, STRIKE: true, STRONG: true, SUB: true, SUP: true, TABLE: true, TBODY: true, TD: true, TFOOT: true, TH: true, THEAD: true, TR: true, U: true, UL: true }
  var walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT)
  var nodes = []
  while (walker.nextNode()) nodes.push(walker.currentNode)
  for (var n = nodes.length - 1; n >= 0; n--) {
    var node = nodes[n]
    var tag = node.tagName
    if (!allowed[tag]) {
      var parent = node.parentNode
      while (node.firstChild) parent.insertBefore(node.firstChild, node)
      parent.removeChild(node)
      continue
    }
    for (var a = node.attributes.length - 1; a >= 0; a--) {
      var attr = node.attributes[a]
      var name = attr.name.toLowerCase()
      if (name.indexOf("on") === 0 || name === "class") {
        node.removeAttribute(attr.name)
        continue
      }
      if (tag === "IMG") {
        var imgAllowed = { src: true, alt: true, title: true, width: true, height: true, style: true, "data-compose-inline-image": true, "data-attachment-id": true, "data-existing-attachment-id": true, "data-content-id": true, "data-filename": true, "data-content-type": true, "data-size": true, "data-preview-url": true, "data-remote-src": true }
        if (!imgAllowed[name]) node.removeAttribute(attr.name)
        if (name === "style") {
          var safeStyle = node.hasAttribute("data-compose-inline-image") ? _sanitizeComposeImageStyle(attr.value) : _sanitizeComposeStyle(attr.value)
          if (safeStyle) node.setAttribute("style", safeStyle)
          else node.removeAttribute("style")
        }
        continue
      }
      if (name === "style") {
        var safeNodeStyle = _sanitizeComposeStyle(attr.value)
        if (safeNodeStyle) node.setAttribute("style", safeNodeStyle)
        else node.removeAttribute("style")
        continue
      }
      var globalAllowed = { align: true, bgcolor: true, border: true, cellpadding: true, cellspacing: true, colspan: true, dir: true, height: true, lang: true, role: true, rowspan: true, title: true, valign: true, width: true }
      if (tag !== "A" && !globalAllowed[name]) {
        node.removeAttribute(attr.name)
      } else if (tag === "A" && name !== "href" && name !== "target" && name !== "rel" && !globalAllowed[name]) {
        node.removeAttribute(attr.name)
      }
    }
    if (tag === "A") {
      var href = node.getAttribute("href") || ""
      if (!/^(https?:|mailto:|#)/i.test(href)) node.removeAttribute("href")
      node.setAttribute("rel", "noopener noreferrer")
      if (href && href.charAt(0) !== "#") node.setAttribute("target", "_blank")
    } else if (tag === "IMG") {
      var src = node.getAttribute("src") || ""
      var remoteSrc = node.getAttribute("data-remote-src") || ""
      if (!src && /^https?:/i.test(remoteSrc)) {
        src = remoteSrc
        node.setAttribute("src", src)
      }
      if (!/^(cid:|https?:|\/api\/attachments\/|\/api\/inline-content\/|\/compose\/attachments\/|\/api\/remote-assets\/)/i.test(src)) {
        node.remove()
        continue
      }
      node.removeAttribute("data-remote-src")
      var width = Number(node.getAttribute("width") || 0)
      if (width) node.setAttribute("width", String(Math.min(1200, Math.max(1, Math.round(width)))))
      var height = Number(node.getAttribute("height") || 0)
      if (height) node.setAttribute("height", String(Math.min(1200, Math.max(1, Math.round(height)))))
      if (!width && node.hasAttribute("width")) node.removeAttribute("width")
      if (!height && node.hasAttribute("height")) node.removeAttribute("height")
    }
  }
  return template.innerHTML
}

function _composeEditorText(editor) {
  if (!editor) return ""
  return (editor.innerText || "").replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").trim()
}

function composeChanged(editor) {
  syncComposeEditor(editor)
  _markComposeDirty(_composeFormFrom(editor))
}

function composeExec(el, command, value) {
  var editor = _composeEditorFrom(el)
  if (!editor) return
  editor.focus()
  _restoreComposeSelection(editor)
  document.execCommand(command, false, value || null)
  syncComposeEditor(editor)
  updateComposeToolbar(editor)
}

function composeCreateLink(el) {
  var editor = _composeEditorFrom(el)
  if (!editor) return
  editor.focus()
  _restoreComposeSelection(editor)
  var url = window.prompt("Paste a URL or email address")
  if (!url) return
  if (url.indexOf("@") > 0 && !/^[a-z][a-z0-9+.-]*:/i.test(url)) url = "mailto:" + url
  if (!/^(https?:|mailto:)/i.test(url)) url = "https://" + url
  document.execCommand("createLink", false, url)
  syncComposeEditor(editor)
  updateComposeToolbar(editor)
}

function updateComposeToolbar(editor) {
  var form = _composeFormFrom(editor)
  if (!form) return
  _saveComposeSelection(editor)
  var buttons = form.querySelectorAll("[data-compose-command]")
  for (var i = 0; i < buttons.length; i++) {
    var command = buttons[i].dataset.composeCommand
    var active = false
    try { active = document.queryCommandState(command) } catch (e) {}
    buttons[i].classList.toggle("bg-accent", active)
    buttons[i].classList.toggle("text-foreground", active)
  }
}

function selectComposeAccount(el, fromPane) {
  var accountId = el.dataset.accountId
  var email = el.dataset.accountEmail
  var name = el.dataset.accountName
  if (!accountId || !email) return
  var prefix = fromPane ? "compose-pane-" : "compose-"
  var idField = document.getElementById(prefix + "account-id")
  var display = document.getElementById(prefix + "from-display")
  if (idField) idField.value = accountId
  if (display) display.innerHTML = (name ? name + " &lt;" : "") + email + (name ? "&gt;" : "")
  syncComposeAccountItems(fromPane ? "pane" : "dialog", accountId)
  _markComposeDirty(document.getElementById(prefix + "form"))
  applyDefaultComposeSignature(document.getElementById(prefix + "form"), true)
}

function syncComposeAccountItems(scope, accountId) {
  if (!scope || !accountId) return
  var items = document.querySelectorAll('[data-compose-account-scope="' + scope + '"][data-compose-account-item]')
  for (var i = 0; i < items.length; i++) {
    items[i].dataset.composeAccountSelected = items[i].dataset.accountId === accountId ? "true" : "false"
  }
}

function closeComposeSignatureMenu() {
  document.removeEventListener("mousedown", _composeSignatureDismiss);
  _composeSignatureDismiss = null;
  if (_composeSignatureMenu) _composeSignatureMenu.remove()
  _composeSignatureMenu = null
}

function showComposeSignaturePicker(el) {
  closeComposeSignatureMenu()
  var form = _composeFormFrom(el)
  if (!form) return
  loadComposeSignatures(form, true).then(function (data) {
    var menu = document.createElement("div")
    menu.className = "compose-attachment-menu"
    var signatures = (data && data.signatures) || []
    if (!signatures.length) {
      var empty = document.createElement("div")
      empty.className = "px-3 py-2 text-xs text-muted-foreground"
      empty.textContent = "No signatures configured"
      menu.appendChild(empty)
    }
    for (var i = 0; i < signatures.length; i++) {
      ;(function (sig) {
        var btn = document.createElement("button")
        btn.type = "button"
        btn.textContent = sig.name || "Signature"
        btn.onclick = function () {
          closeComposeSignatureMenu()
          if (insertComposeSignature(form, sig, "manual")) _markComposeDirty(form)
        }
        menu.appendChild(btn)
      })(signatures[i])
    }
    (el.closest("dialog") || document.body).appendChild(menu)
    _composeSignatureMenu = menu
    var rect = el.getBoundingClientRect()
    menu.style.top = Math.min(window.innerHeight - menu.offsetHeight - 8, rect.bottom + 6) + "px"
    menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8)) + "px"
    _composeSignatureDismiss = function (event) {
      if (!menu.contains(event.target) && !el.contains(event.target)) closeComposeSignatureMenu();
    };
    document.addEventListener("mousedown", _composeSignatureDismiss);
  })
}

function _composeHiddenInput(name, value, inline) {
  var input = document.createElement("input")
  input.type = "hidden"
  input.name = name
  input.value = value
  if (inline) input.dataset.composeInlineHidden = ""
  return input
}

function composeAttachmentKind(att) {
  var filename = (att && att.filename ? att.filename : "").toLowerCase()
  var contentType = (att && att.content_type ? att.content_type : "").toLowerCase().split(";")[0]
  function hasExt(exts) {
    for (var i = 0; i < exts.length; i++) {
      if (filename.endsWith(exts[i])) return true
    }
    return false
  }
  if (contentType.indexOf("image/") === 0 || hasExt([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico"])) return { kind: "image", label: "IMG", title: "Image file" }
  if (contentType === "application/pdf" || hasExt([".pdf"])) return { kind: "pdf", label: "PDF", title: "PDF document" }
  if (contentType.indexOf("spreadsheet") >= 0 || contentType.indexOf("excel") >= 0 || contentType === "text/csv" || hasExt([".xls", ".xlsx", ".csv", ".ods"])) return { kind: "sheet", label: hasExt([".csv"]) ? "CSV" : "XLS", title: "Spreadsheet" }
  if (contentType.indexOf("word") >= 0 || hasExt([".doc", ".docx", ".odt", ".rtf"])) return { kind: "doc", label: "DOC", title: "Document" }
  if (contentType.indexOf("presentation") >= 0 || contentType.indexOf("powerpoint") >= 0 || hasExt([".ppt", ".pptx", ".odp"])) return { kind: "deck", label: "PPT", title: "Presentation" }
  if (contentType.indexOf("zip") >= 0 || contentType.indexOf("compressed") >= 0 || contentType.indexOf("tar") >= 0 || hasExt([".zip", ".rar", ".7z", ".tar", ".gz", ".tgz", ".bz2"])) return { kind: "archive", label: "ZIP", title: "Archive" }
  if (contentType.indexOf("audio/") === 0 || hasExt([".mp3", ".wav", ".m4a", ".ogg", ".flac"])) return { kind: "audio", label: "AUD", title: "Audio file" }
  if (contentType.indexOf("video/") === 0 || hasExt([".mp4", ".mov", ".avi", ".webm", ".mkv"])) return { kind: "video", label: "VID", title: "Video file" }
  if (hasExt([".json", ".xml", ".html", ".css", ".js", ".ts", ".go", ".py", ".rb", ".java", ".c", ".cpp", ".sh"])) return { kind: "code", label: "DEV", title: "Code file" }
  if (contentType.indexOf("text/") === 0 || hasExt([".txt", ".md", ".log"])) return { kind: "text", label: "TXT", title: "Text file" }
  return { kind: "file", label: "FILE", title: "File" }
}

function toggleComposeAttachments(el) {
  var form = _composeFormFrom(el)
  var wrap = form && form.querySelector("[data-compose-attachments]")
  var list = form && form.querySelector("[data-compose-attachment-list]")
  if (!wrap || !list) return
  var collapsed = wrap.dataset.composeAttachmentsCollapsed !== "true"
  wrap.dataset.composeAttachmentsCollapsed = collapsed ? "true" : "false"
  list.classList.toggle("hidden", collapsed)
  updateComposeAttachmentSummary(form)
}

function updateComposeAttachmentSummary(form) {
  var wrap = form && form.querySelector("[data-compose-attachments]")
  if (!wrap) return
  var summary = wrap.querySelector("[data-compose-attachment-summary]")
  var toggle = wrap.querySelector("[data-compose-attachment-toggle]")
  var attachments = form.querySelectorAll("[data-compose-attachment]")
  var pending = form.querySelectorAll("[data-compose-upload-pending]")
  var totalCount = attachments.length + pending.length
  var totalSize = 0
  for (var i = 0; i < attachments.length; i++) totalSize += Number(attachments[i].dataset.size || 0)
  for (var p = 0; p < pending.length; p++) totalSize += Number(pending[p].dataset.size || 0)
  if (summary) {
    if (totalCount) {
      summary.textContent = totalCount + " " + (totalCount === 1 ? "attachment" : "attachments") + " · " + formatComposeAttachmentSize(totalSize) + (pending.length ? " · " + pending.length + " uploading" : "") + " · Max 35 MB total"
    } else {
      summary.textContent = "Max 25 MB per file, 35 MB total"
    }
  }
  if (toggle) {
    var collapsed = wrap.dataset.composeAttachmentsCollapsed === "true"
    toggle.textContent = collapsed ? "Show" : "Hide"
    toggle.classList.toggle("hidden", totalCount === 0)
  }
}

function addComposeAttachment(form, att) {
  var wrap = form.querySelector("[data-compose-attachments]")
  var list = form.querySelector("[data-compose-attachment-list]")
  if (!wrap || !list) return
  wrap.classList.remove("hidden")

  var item = document.createElement("span")
  item.className = "compose-attachment-chip"
  item.dataset.composeAttachment = ""
  item.dataset.attachmentId = att.id || ""
  item.dataset.existingAttachmentId = att.existing ? String(att.id || "") : ""
  item.dataset.filename = att.filename || "attachment"
  item.dataset.contentType = att.content_type || "application/octet-stream"
  item.dataset.size = String(att.size || 0)
  item.dataset.previewUrl = att.preview_url || ""

  var hiddenName = att.existing ? "existing_attachment_id" : "attachment_id"
  item.appendChild(_composeHiddenInput(hiddenName, att.id || ""))
  if (!att.existing) {
    item.appendChild(_composeHiddenInput("attachment_filename", att.filename || "attachment"))
    item.appendChild(_composeHiddenInput("attachment_content_type", att.content_type || "application/octet-stream"))
    item.appendChild(_composeHiddenInput("attachment_size", String(att.size || 0)))
  }

  if (att.preview_url) {
    var preview = document.createElement("img")
    preview.className = "compose-attachment-preview"
    preview.src = att.preview_url
    preview.alt = ""
    preview.loading = "lazy"
    item.appendChild(preview)
  } else {
    var kind = composeAttachmentKind(att)
    var icon = document.createElement("span")
    icon.className = "compose-attachment-icon compose-attachment-icon-" + kind.kind
    icon.textContent = kind.label
    icon.title = kind.title
    icon.setAttribute("aria-hidden", "true")
    item.appendChild(icon)
  }

  var label = document.createElement("span")
  label.className = "truncate"
  label.textContent = (att.filename || "attachment") + (att.size ? " (" + formatComposeAttachmentSize(att.size) + ")" : "")
  var remove = document.createElement("button")
  remove.type = "button"
  remove.className = "compose-attachment-remove"
  remove.setAttribute("aria-label", "Remove attachment")
  remove.textContent = "x"
  remove.onclick = function () { removeComposeAttachment(item) }
  item.appendChild(label)
  if (_composeAttachmentLooksInlineable(att)) {
    var actions = document.createElement("button")
    actions.type = "button"
    actions.className = "compose-attachment-actions"
    actions.setAttribute("aria-label", "Attachment actions")
    actions.textContent = "⋯"
    actions.onclick = function (event) {
      event.preventDefault()
      event.stopPropagation()
      showComposeAttachmentActions(item)
    }
    item.appendChild(actions)
  }
  item.appendChild(remove)
  list.appendChild(item)
  updateComposeAttachmentSummary(form)
}

function formatComposeAttachmentSize(size) {
  size = Number(size || 0)
  if (size >= 1024 * 1024) return (size / (1024 * 1024)).toFixed(1) + " MB"
  if (size >= 1024) return Math.round(size / 1024) + " KB"
  return size + " B"
}

function renderComposeAttachments(form, attachments) {
  if (!form) return
  var list = form.querySelector("[data-compose-attachment-list]")
  var wrap = form.querySelector("[data-compose-attachments]")
  if (!list || !wrap) return
  list.innerHTML = ""
  for (var i = 0; attachments && i < attachments.length; i++) addComposeAttachment(form, attachments[i])
  wrap.classList.toggle("hidden", !attachments || !attachments.length)
  updateComposeAttachmentSummary(form)
}

function readComposeAttachments(form) {
  var items = form ? form.querySelectorAll("[data-compose-attachment]") : []
  var attachments = []
  for (var i = 0; i < items.length; i++) {
    var existing = items[i].dataset.existingAttachmentId
    attachments.push({
      id: existing || items[i].dataset.attachmentId || "",
      existing: !!existing,
      filename: items[i].dataset.filename || "attachment",
      content_type: items[i].dataset.contentType || "application/octet-stream",
      size: Number(items[i].dataset.size || 0),
      preview_url: items[i].dataset.previewUrl || ""
    })
  }
  return attachments
}

function isStackedComposeLayout() {
  var main = document.getElementById("main-content")
  return !!(main && main.dataset.mailPaneLayout === "stacked")
}

function applyComposeFullWidthInstant() {
  var mailList = document.querySelector("#main-content > #mail-list")
  var resizeHandles = document.querySelectorAll('[data-panel="maillist"]')
  if (!mailList || mailList._savedWidth !== undefined) return

  var axis = isStackedComposeLayout() ? "height" : "width"
  mailList._composeFullWidthAxis = axis
  mailList._savedWidth = axis === "height" ? mailList.style.height : mailList.style.width
  if (axis === "height") mailList._savedMinHeight = mailList.style.minHeight
  mailList.style.display = "none"
  mailList.style[axis] = "0px"
  if (axis === "height") mailList.style.minHeight = "0px"
  mailList.style.opacity = "0"
  mailList.style.overflow = "hidden"
  mailList.style.borderWidth = "0"

  for (var i = 0; i < resizeHandles.length; i++) {
    resizeHandles[i]._savedDisplay = resizeHandles[i].style.display
    resizeHandles[i].style.display = "none"
    resizeHandles[i].style.opacity = "0"
  }

  var normal = document.getElementById("pane-btns-normal")
  var full = document.getElementById("pane-btns-full")
  if (normal) normal.style.display = "none"
  if (full) full.style.display = "flex"

  var bodyField = document.querySelector("#compose-pane-form [data-compose-editor]")
  if (bodyField) bodyField.focus()
}

function expandComposeFullWidth() {
  var mailList = document.querySelector("#main-content > #mail-list")
  var resizeHandles = document.querySelectorAll('[data-panel="maillist"]')
  if (!mailList || mailList._animating) return

  var axis = isStackedComposeLayout() ? "height" : "width"
  mailList._animating = true
  mailList._composeFullWidthAxis = axis
  mailList._savedWidth = axis === "height" ? mailList.style.height : mailList.style.width
  if (axis === "width") _freezeComposeMailList(mailList, false);
  if (axis === "height") {
    mailList._savedMinHeight = mailList.style.minHeight
    mailList.style.minHeight = "0px"
  }

  for (var i = 0; i < resizeHandles.length; i++) {
    resizeHandles[i]._savedDisplay = resizeHandles[i].style.display
    resizeHandles[i].style.transition = "opacity 0.25s ease, width 0.3s cubic-bezier(0.4,0,0.2,1)"
    resizeHandles[i].style.opacity = "0"
  }

  mailList.style.transition = axis + " 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease, border-width 0.3s ease"
  mailList.style.overflow = "hidden"
  mailList.style.borderWidth = "0"

  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      mailList.style[axis] = "0px"
      mailList.style.opacity = "0"
      if (axis === "width") {
        for (var i = 0; i < resizeHandles.length; i++) resizeHandles[i].style.width = "0px"
      }
    })
  })


  var animationFinished = false;
  function onEnd(ev) {
    if (animationFinished) return;
    if (ev.target !== mailList || ev.propertyName !== axis) return
    animationFinished = true;
    mailList.removeEventListener("transitionend", onEnd)
    mailList.style.display = "none"
    _releaseComposeMailList(mailList);
    mailList.style.transition = ""
    mailList.style.opacity = ""
    mailList._animating = false
    for (var i = 0; i < resizeHandles.length; i++) {
      resizeHandles[i].style.display = "none"
      resizeHandles[i].style.transition = ""
      resizeHandles[i].style.opacity = ""
      resizeHandles[i].style.width = ""
    }
  }
  mailList.addEventListener("transitionend", onEnd)
  setTimeout(function () { onEnd({ target: mailList, propertyName: axis }); }, 400)

  var normal = document.getElementById("pane-btns-normal")
  var full = document.getElementById("pane-btns-full")
  if (normal) normal.style.display = "none"
  if (full) full.style.display = "flex"

  var bodyField = document.querySelector("#compose-pane-form [data-compose-editor]")
  if (bodyField) bodyField.focus()
}

function collapseComposeFullWidth() {
  var mailList = document.querySelector("#main-content > #mail-list")
  var resizeHandles = document.querySelectorAll('[data-panel="maillist"]')
  if (!mailList || mailList._savedWidth === undefined) return false

  mailList._animating = true;
  var axis = mailList._composeFullWidthAxis || (isStackedComposeLayout() ? "height" : "width")
  mailList.style.display = ""
  if (axis === "width") _freezeComposeMailList(mailList, true);
  mailList.style[axis] = "0px"
  if (axis === "height") mailList.style.minHeight = "0px"
  mailList.style.opacity = "0"
  mailList.style.overflow = "hidden"
  mailList.style.transition = axis + " 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease, border-width 0.3s ease"

  for (var i = 0; i < resizeHandles.length; i++) {
    resizeHandles[i].style.display = resizeHandles[i]._savedDisplay || ""
    delete resizeHandles[i]._savedDisplay
    resizeHandles[i].style.opacity = "0"
    if (axis === "width") resizeHandles[i].style.width = "0px"
    resizeHandles[i].style.transition = "opacity 0.25s ease 0.1s, width 0.3s cubic-bezier(0.4,0,0.2,1)"
  }

  void mailList.offsetHeight

  requestAnimationFrame(function () {
    mailList.style[axis] = axis === "width" ? mailList._demoTargetWidth + "px" : mailList._savedWidth
    mailList.style.opacity = "1"
    for (var i = 0; i < resizeHandles.length; i++) {
      resizeHandles[i].style.opacity = "1"
      resizeHandles[i].style.width = ""
    }
  })

  var animationFinished = false;
  function onEnd(ev) {
    if (animationFinished) return;
    if (ev.target !== mailList || ev.propertyName !== axis) return
    animationFinished = true;
    mailList.removeEventListener("transitionend", onEnd)
    mailList._animating = false;
    _releaseComposeMailList(mailList);
    mailList.style.transition = ""
    mailList.style[axis] = mailList._savedWidth
    mailList.style.opacity = ""
    mailList.style.overflow = ""
    mailList.style.borderWidth = ""
    if (axis === "height") {
      mailList.style.minHeight = mailList._savedMinHeight || ""
      delete mailList._savedMinHeight
    }
    delete mailList._savedWidth
    delete mailList._composeFullWidthAxis
    for (var i = 0; i < resizeHandles.length; i++) {
      resizeHandles[i].style.transition = ""
      resizeHandles[i].style.opacity = ""
    }
  }
  mailList.addEventListener("transitionend", onEnd)
  setTimeout(function () { onEnd({ target: mailList, propertyName: axis }); }, 400)

  var normal = document.getElementById("pane-btns-normal")
  var full = document.getElementById("pane-btns-full")
  if (normal) normal.style.display = "flex"
  if (full) full.style.display = "none"

  return true
}
