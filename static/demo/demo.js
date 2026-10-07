/* Static navigation around HTML rendered by Gofer. No mailbox or app server. */
(() => {
  "use strict";
  const root = document.querySelector("#demo-root");
  const dialogs = document.querySelector("#app-pane-dialogs");
  const status = document.querySelector("#demo-status");
  const back = document.querySelector("#demo-back");
  const state = { section: "mail", folder: "inbox", mailView: "cards", contactView: "cards", message: "message-1", contact: "mira", calendarView: "month", date: "2026-10-07", query: "", bodyMode: null };
  let data;
  let mainSection = "mail";
  let composePane = null;
  let composeMode = "full";
  let noticeTimer;
  let calendarGeneration = 0;
  let sectionGeneration = 0;
  let previewVisible = window.parent === window;
  let pendingEntrance = null;
  const calendarCache = new Map();
  const sectionCache = new Map();
  const demoLists = new WeakMap();
  const paneDefaults = { mail: "40%", contacts: "40%", calendar: "76%", compose: "40%" };
  const settingsScreens = { accounts: "settings-accounts", sync: "settings-sync" };
  const $ = (selector, node = document) => node.querySelector(selector);
  const $$ = (selector, node = document) => [...node.querySelectorAll(selector)];

  function notice(text = "This action is unavailable in the demo.") {
    clearTimeout(noticeTimer);
    status.textContent = text;
    status.hidden = false;
    noticeTimer = setTimeout(() => { status.hidden = true; }, 3500);
  }

  function notifyParent() {
    const detail = { type: "gofer-demo-state", section: state.section, style: GoferSettings.get("theme_style"), mode: GoferSettings.get("theme") };
    if (window.parent !== window) window.parent.postMessage(detail, location.origin);
    $("[data-demo-style]").value = detail.style;
    $("[data-demo-mode]").value = detail.mode;
    if (!state.section.startsWith("settings-") && state.section !== "compose") mainSection = state.section;
    $$('[data-demo-screen]').forEach(button => {
      const screen = state.section.startsWith("settings-") || state.section === "compose" ? state.section : "main";
      button.setAttribute("aria-pressed", String(button.dataset.demoScreen === screen));
    });
  }

  function unavailable(element) {
    element.dataset.demoUnavailable = "";
    element.setAttribute("aria-disabled", "true");
    element.title = "Unavailable in the demo";
    if (element.matches("button,input,select,textarea")) element.disabled = true;
    $$('button,input,select,textarea', element).forEach(control => { control.disabled = true; });
  }

  function configureCompose(node) {
    $$('[data-demo-inline-action]', node).forEach(element => {
      const action = element.dataset.demoInlineAction;
      if (action === "collapseToDialog()") element.dataset.demoComposeAction = "dialog";
      else if (action === "expandToPane()") element.dataset.demoComposeAction = "pane";
      else if (action === "discardComposeDialog()") element.dataset.demoComposeAction = "close";
      else if (action.startsWith("discardComposePane(")) element.dataset.demoComposeAction = "close";
      else if (action === "expandComposeFullWidth()") element.dataset.demoComposeAction = "full-width";
      else if (action === "collapseComposeFullWidth()") element.dataset.demoComposeAction = "single-pane";
      else if (element.id.endsWith("cc-btn") || element.id.endsWith("bcc-btn")) element.dataset.demoComposeAction = "optional-field";
      else if (element.matches('[data-compose-account-item]')) element.dataset.demoComposeAction = "account";
      else if (action === "composeCreateLink(this)") element.dataset.demoComposeAction = "link";
      else if (action === "showComposeSignaturePicker(this)") element.dataset.demoComposeAction = "signature";
      else if (action === "triggerComposeAttachmentUpload(this)") element.dataset.demoComposeAction = "attachment";
      else if (action === "triggerComposeInlineImageUpload(this)") element.dataset.demoComposeAction = "image";
      else if (action === "toggleComposeAttachments(this)") element.dataset.demoComposeAction = "attachments";
      else {
        const command = action.match(/^composeExec\(this, '([^']+)'(?:, '([^']+)')?\)$/);
        if (command) {
          element.dataset.demoComposeAction = "format";
          element.dataset.demoComposeCommand = command[1];
          if (command[2]) element.dataset.demoComposeValue = command[2];
        }
      }
    });
    $$('input[name="subject"]', node).forEach(input => {
      input.value = "Ideas for the autumn launch";
      input.readOnly = false;
    });
    $$('[data-compose-editor]', node).forEach(editor => {
      editor.innerHTML = "<p>Hi Mira,</p><p>The new direction looks great. I especially like the warmer colors and the room you've given the work.</p><p>A few thoughts for our review:</p><ul><li><strong>Keep the opening simple.</strong> Let the first image set the tone.</li><li>Bring the print samples so we can compare the textures.</li><li>Try a more personal welcome email.</li></ul><p>See you on Wednesday,<br>Alex</p>";
    });
    GoferDemoCompose.initialize(node);
  }

  function floatCompose() {
    if (!composePane || $("#mail-list", root)?._animating) return;
    if (!$("#compose-dialog")) {
      dialogs.innerHTML = data.compose.dialog;
      configureCompose(dialogs);
      prepare(dialogs);
      const dialog = $('#compose-dialog [data-tui-dialog-content]');
      dialog.addEventListener('close', () => {
        if (dialog.isConnected && state.section === 'compose' && composeMode === 'floating') dockCompose();
        if (dialog.isConnected && state.section === 'compose' && composePane?.isConnected) $('[data-compose-editor]', composePane)?.focus();
      });
    }
    GoferDemoCompose.copy($('#compose-pane-form'), $('#compose-form'));
    closeComposeSignatureMenu();
    if (composeMode === "full") collapseComposeFullWidth();
    composeMode = "floating";
    root.classList.remove("demo-compose-open");
    closeMobileDetail();
    // Retain the real composer node and its draft while showing the selected email.
    selectMessage(state.message, false);
    window.tui.dialog.open("compose-dialog");
  }

  function dockCompose() {
    if (!composePane || state.section !== "compose" || composeMode !== "floating") return;
    $("#mail-view", root).replaceChildren(composePane);
    GoferDemoCompose.copy($('#compose-form'), $('#compose-pane-form'));
    closeComposeSignatureMenu();
    composeMode = "inline";
    root.classList.add("demo-compose-open");
    prepare($("#mail-view", root));
    // Animate as the pane appears, not when the dialog finishes closing.
    _animateComposePane(isStackedComposeLayout() ? 'height' : 'width');
    window.tui.dialog.close("compose-dialog");
  }

  function handleComposeAction(element) {
    switch (element.dataset.demoComposeAction) {
      case "dialog": floatCompose(); break;
      case "pane": dockCompose(); break;
      case "full-width":
        if (!$("#mail-list", root)?._animating && composeMode === "inline") {
          composeMode = "full";
          expandComposeFullWidth();
        }
        break;
      case "single-pane":
        if (!$("#mail-list", root)?._animating && composeMode === "full") {
          composeMode = "inline";
          collapseComposeFullWidth();
        }
        break;
      case "close":
        showSection(mainSection);
        break;
      case "optional-field": {
        const field = $(`#${element.id.replace(/-btn$/, "-field")}`);
        field?.classList.remove("hidden");
        element.classList.add("hidden");
        break;
      }
      default: GoferDemoCompose.action(element);
    }
  }

  function prepare(node) {
    // Mutation affordances remain visible in their real positions.
    $$('[data-demo-inline-action],[data-demo-hx-post],[data-demo-hx-put],[data-demo-hx-patch],[data-demo-hx-delete],.star-btn,[data-star-email],[data-read-email],[data-contact-sync-now],[data-contact-edit-trigger],[data-calendar-create-trigger],[data-load-remote],[data-allow-remote],[data-calendar-edit-trigger],[data-calendar-delete-trigger],[data-mail-card-layout-dialog-open],[data-mail-filter-button],[aria-label="Filter contacts"]', node).filter(element => !element.hasAttribute("data-demo-compose-action")).forEach(unavailable);
    $$('[data-translate-email-language]', node).forEach(item => {
      if (!data.translations?.[item.dataset.translateEmailLanguage]?.[item.dataset.translationLanguage]) item.remove();
    });
    window.initializeEmailTranslationControls?.(node);
    $$('a[href^="/settings"],[data-settings-sidebar-link]', node).forEach(link => {
      if (!state.section.startsWith("settings-") || !settingsScreens[link.dataset.settingsSidebarValue]) unavailable(link);
    });
    if (state.section.startsWith("settings-")) {
      $$('[data-settings-page] input:not([name="theme_style"]),[data-settings-page] select,[data-settings-page] textarea,[data-settings-page] form button,[data-account-actions],[data-account-color-option]', node).forEach(unavailable);
    }
    $$('[data-tui-dialog-trigger]', node).forEach(element => {
      // Only the body-style dialog uses app triggers; Compose opens through its adapter.
      if (!element.closest("[data-email-body-style-toggle]")) unavailable(element);
    });
    $$('form', node).forEach(form => {
      if (form.matches("[data-contact-editor-form]")) $$('input,textarea,button,select', form).forEach(unavailable);
    });
    $$('[data-contact-recent-activity-loading]', node).forEach(element => {
      const card = element.closest('[data-contact-detail-id]');
      if (card && data.activities?.[card.dataset.contactDetailId]) element.outerHTML = data.activities[card.dataset.contactDetailId];
    });
    if (typeof initResizeHandles === "function") initResizeHandles();
    window.applyMailCardLayoutSettings?.();
    window.applyMailTableColumnSettings?.();
    const width = GoferSettings.get("sidebar_width");
    if (width && $("aside", root)) $("aside", root).style.width = width;
    const listWidth = GoferSettings.get("mail_list_width");
    if (listWidth && $("#mail-list", root)) $("#mail-list", root).style.width = listWidth.endsWith("%") ? `clamp(300px,${listWidth},calc(100% - 300px))` : listWidth;
    hydrateBodies(node);
    syncAppearance();
    if (state.section === "calendar") initializeCalendarDaySelection();
    else initializeCalendarViewport();
  }

  function syncAppearance() {
    const mode = GoferSettings.get("theme");
    const style = GoferSettings.get("theme_style");
    $$('[data-mode]').forEach(button => {
      const active = button.dataset.mode === mode;
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("text-muted-foreground", !active);
      button.classList.toggle("text-foreground", active);
      button.classList.toggle("shadow-sm", active);
      button.classList.toggle("bg-background", active);
    });
    $$('input[name="theme_style"]').forEach(input => { input.checked = input.value === style; });
    $$('[data-theme-preview]').forEach(preview => preview.classList.toggle("dark", mode === "dark"));
  }

  function hydrateBodies(node = root) {
    const frames = node.matches('[data-email-body-frame]') ? [node] : $$('[data-email-body-frame]', node);
    frames.forEach(frame => {
      const id = frame.dataset.emailId;
      const translated = frame.dataset.translationActive === "true";
      const language = translated ? frame.dataset.translationTargetLanguage : "en";
      const bodyHTML = translated ? data.translations?.[id]?.[language] : data.bodies[id];
      frame.setAttribute("lang", language);
      const mode = state.bodyMode || GoferSettings.get("theme");
      // Match the app's paper palette. Original demo mail has a white background.
      const dark = mode === "dark";
      const probe = document.createElement("div");
      probe.setAttribute("data-theme", GoferSettings.get("theme_style"));
      probe.classList.toggle("dark", dark);
      document.body.append(probe);
      const palette = getComputedStyle(probe);
      const bg = mode === "original" ? "#fff" : palette.getPropertyValue("--paper").trim();
      const fg = mode === "original" ? "#242424" : palette.getPropertyValue("--paper-foreground").trim();
      const link = palette.getPropertyValue("--copper").trim();
      probe.remove();
      frame.setAttribute("sandbox", "allow-same-origin");
      frame.onload = () => {
        const body = frame.contentDocument?.body;
        if (!body) return;
        frame.style.height = `${Math.max(100, body.scrollHeight)}px`;
        frame.classList.remove("opacity-0");
        if (translated) window.goferEmailTranslationFrameLoaded?.(id);
        $(`[data-email-body-loading="${id}"]`, root)?.classList.add("hidden");
        const observer = new ResizeObserver(() => { if (frame.isConnected && frame.clientWidth) frame.style.height = `${Math.max(100, body.scrollHeight)}px`; });
        observer.observe(body);
      };
      frame.srcdoc = `<!doctype html><html lang="${language}"><head><meta name="viewport" content="width=device-width"><style>html{margin:0;overflow:hidden;background:${bg};color:${fg};color-scheme:${dark ? "dark" : "light"}}body{margin:0;padding:8px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.5;background:${bg};color:${fg};word-wrap:break-word}img{max-width:100%;height:auto}a{color:${link}}</style></head><body>${bodyHTML || ""}</body></html>`;
    });
    $$('[data-email-body-style-toggle]', node).forEach(toggle => {
      const mode = state.bodyMode || GoferSettings.get("theme");
      const tabID = toggle.dataset.tuiTabsId;
      if (tabID && window.tui?.tabs) window.tui.tabs.setActive(tabID, mode, false);
    });
  }

  function selectMessage(id, animate = true) {
    if (!data.messages[id]) return;
    state.message = id;
    $("#mail-list-scroll", root)?._virtualMailList?.onEmailSelected(id);
    if (animate && state.section === "compose" && composeMode !== "floating") {
      syncMailSelection();
      return;
    }
    $("#mail-view", root).innerHTML = data.messages[id];
    $$('[data-email-id].mail-list-item', root).forEach(row => {
      const selected = row.dataset.emailId === id;
      row.setAttribute("aria-current", String(selected));
    });
    syncMailSelection();
    prepare($("#mail-view", root));
    if (animate) animateSectionContent($("#mail-view", root));
    if (window.innerWidth < 1024 && animate) openMobileDetail();
  }

  function selectContact(id, animate = true) {
    if (!data.contacts[id]) return;
    state.contact = id;
    $("#contacts-list-scroll", root)?._virtualContactsList?.onContactSelected(id);
    $("#mail-view", root).innerHTML = data.contacts[id];
    // Gofer's intermediate-width layout renders a separate mobile detail pane.
    const alternate = $("#main-content > section:not(#mail-list):not(#mail-view)", root);
    if (alternate) alternate.innerHTML = data.contacts[id];
    $$('[data-contact-list-item]', root).forEach(card => {
      const selected = card.dataset.contactListItem === id;
      card.dataset.active = String(selected);
      card.classList.toggle("envelope-active", selected);
      card.classList.toggle("envelope", !selected);
    });
    prepare(root);
    if (animate) animateSectionContent(window.innerWidth < 1280 && window.innerWidth >= 1024 ? alternate : $("#mail-view", root));
    if (window.innerWidth < 1024 && animate) openMobileDetail();
  }

  function openMobileDetail() {
    root.classList.add("demo-detail-open");
    back.hidden = false;
    back.focus({ preventScroll: true });
  }

  function closeMobileDetail() {
    root.classList.remove("demo-detail-open");
    back.hidden = true;
  }

  function syncMailSelection() {
    const scroll = $("#mail-list-scroll", root);
    const list = scroll?._virtualMailList;
    const selectedId = list?.selectedEmailId;
    if (!scroll) return;
    // Virtual rows use transforms, so a fractional final offset can blur even
    // real borders. Correct only that offset; native motion still owns transform.
    const snapRows = window.parent !== window && CSS.supports("zoom", "1")
      && document.documentElement.dataset.theme === "minimal" && list?.viewMode === "cards";
    for (const node of list?.itemsContainer?.children || []) {
      if (!snapRows || !node.style.transform) { node.style.translate = ""; continue; }
      const y = new DOMMatrix(node.style.transform).m42;
      const density = window.devicePixelRatio || 1;
      node.style.translate = `0 ${Math.round(y * density) / density - y}px`;
    }
    // Gofer's mail action controller marks both nodes; its native CSS draws
    // the selection inset independently of the active reading-pane class.
    $$('.mail-list-item[data-email-id]', scroll).forEach(row => {
      const selected = row.dataset.emailId === selectedId;
      row.toggleAttribute("data-mail-selected", selected);
      $(":scope > a", row)?.toggleAttribute("data-mail-selected", selected);
    });
  }

  function matchingRows(rows) {
    const query = state.query.toLocaleLowerCase().trim();
    const tokens = [...query.matchAll(/(?:([a-z]+):)?(?:"([^"]*)"|(\S+))/g)];
    return rows.filter(row => {
      const fields = data.mailIndex?.[row.dataset.emailId];
      const haystack = fields ? Object.values(fields).join(" ").toLocaleLowerCase() : row.textContent.toLocaleLowerCase();
      return tokens.every(token => {
        const value = token[2] ?? token[3];
        const text = token[1] && fields ? fields[token[1]] || "" : haystack;
        return text.toLocaleLowerCase().includes(value);
      });
    });
  }

  function listFixture(meta, url) {
    const mode = url.searchParams.get("view") === "table" ? "table" : "cards";
    const folder = meta.contact ? "contacts" : decodeURIComponent(url.pathname.match(/^\/mail\/folder\/([^/]+)\/items$/)[1]);
    const key = meta.contact ? `contacts:${mode}` : `${folder}:${mode}`;
    const template = document.createElement("template");
    template.innerHTML = data.lists[key];
    const source = template.content.querySelector("#mail-list-scroll,#contacts-list-scroll");
    let rows = $$('.mail-list-item', source);
    // Preserve the visitor's current sort when requesting another presentation.
    if (meta.folder === folder) {
      const order = new Map(meta.rows.map((row, i) => [row.dataset.emailId || row.dataset.contactId, i]));
      rows.sort((a, b) => (order.get(a.dataset.emailId || a.dataset.contactId) ?? rows.length) - (order.get(b.dataset.emailId || b.dataset.contactId) ?? rows.length));
    }
    meta.rows = rows;
    meta.folder = folder;
    const visible = matchingRows(rows);
    const start = Math.max(0, Number(url.searchParams.get("start")) || 0);
    const limit = Math.max(1, Number(url.searchParams.get("limit")) || visible.length);
    const wrapper = source.cloneNode(false);
    wrapper.dataset.totalCount = wrapper.dataset.displayTotalCount = String(visible.length);
    wrapper.dataset.windowStart = String(start);
    wrapper.dataset.windowEnd = String(Math.min(visible.length, start + limit) - 1);
    wrapper.dataset.hasMore = "false";
    wrapper.dataset.viewMode = mode;
    if (!meta.contact) wrapper.dataset.folderId = folder;
    visible.slice(start, start + limit).forEach((row, i) => {
      const copy = row.cloneNode(true);
      copy.dataset.position = String(start + i);
      $$('.star-btn,[data-star-email],[data-read-email],[data-demo-hx-post],[data-demo-hx-delete]', copy).forEach(unavailable);
      wrapper.append(copy);
    });
    return wrapper.outerHTML;
  }

  function hydrateDemoList(scroll, meta, visible, transition) {
    const fragment = document.createDocumentFragment();
    visible.forEach((row, index) => {
      const copy = row.cloneNode(true);
      copy.dataset.position = String(index);
      fragment.append(copy);
    });
    scroll.replaceChildren(fragment);
    scroll.dataset.totalCount = String(visible.length);
    scroll.dataset.displayTotalCount = String(visible.length);
    scroll.dataset.windowStart = "0";
    scroll.dataset.windowEnd = String(visible.length - 1);
    scroll.dataset.hasMore = "false";
    scroll.dataset.query = state.query;
    const list = meta.contact
      ? new VirtualContactsList(scroll, { viewMode: state.contactView, selectedContactId: state.contact })
      : new VirtualMailList(scroll, { viewMode: state.mailView, folderID: state.folder });
    // The real renderer receives only static fixtures and never changes the URL.
    list.pushUrl = () => {};
    list.replaceUrl = () => {};
    if (meta.contact) list.updateURLForState = () => {};
    list.fetchHTML = async href => {
      const url = new URL(href, location.origin);
      const thread = url.pathname.match(/^\/mail\/thread\/([^/]+)\/subitems$/);
      if (thread && data.threads[decodeURIComponent(thread[1])]) return data.threads[decodeURIComponent(thread[1])];
      if (url.pathname === "/contacts/items" || /^\/mail\/folder\/[^/]+\/items$/.test(url.pathname)) return listFixture(meta, url);
      throw new Error("This demo uses local list fixtures.");
    };
    if (meta.contact) scroll._virtualContactsList = list;
    else scroll._virtualMailList = list;
    meta.list = list;
    demoLists.set(scroll, meta);
    list.hydrateFromDOM({ animate: false });
    if (transition) list.animateListTransition(transition, { enterFrom: -8, exitTo: 14 });
    else {
      // Finish shell sizing and detail rendering before starting the native drop-in.
      list.itemsContainer.style.visibility = "hidden";
      const enter = () => requestAnimationFrame(() => {
        if (!scroll.isConnected) return;
        list.itemsContainer.style.visibility = "";
        list.animateRenderedRows({ enterFrom: -8 });
      });
      if (previewVisible) enter();
      else pendingEntrance = enter;
    }
    const input = meta.contact ? $('[data-contact-search-input]', root) : $('[data-mail-search-input]', root);
    if (input) input.value = state.query;
    $("#contacts-count,#mail-folder-count", root)?.replaceChildren(document.createTextNode(String(visible.length)));
  }

  function toggleThread(button) {
    const scroll = button.closest("#mail-list-scroll");
    const list = scroll?._virtualMailList;
    if (!list) return;
    list.toggleThreadExpand(button.dataset.threadToggle).then(() => {
      if (scroll.isConnected) prepare(scroll);
    }).catch(error => { console.error(error); notice("This thread couldn’t open. Please try again."); });
  }

  async function showSection(section, animate = true) {
    if (!data?.sections[section]) return;
    const generation = ++sectionGeneration;
    root.setAttribute("aria-busy", "true");
    const required = section === "compose" ? ["mail", "compose"] : [section];
    for (const name of required) {
      if (!sectionCache.has(name)) {
        sectionCache.set(name, fetch(data.sections[name]).then(response => {
          if (!response.ok) throw new Error("Demo section missing");
          return response.json();
        }).then(bundle => {
          for (const [key, value] of Object.entries(bundle)) data[key] = Object.assign(data[key] || {}, value);
        }));
      }
    }
    try { await Promise.all(required.map(name => sectionCache.get(name))); }
    catch (error) { required.forEach(name => sectionCache.delete(name)); console.error(error); notice("This section couldn’t load. Please try again."); root.setAttribute("aria-busy", "false"); return; }
    if (generation !== sectionGeneration) return;
    calendarGeneration++;
    const previous = $('[data-sidebar-app-indicator]', root)?.style.transform;
    state.section = section;
    state.query = "";
    composePane = null;
    composeMode = "full";
    closeComposeSignatureMenu();
    root.classList.remove("demo-compose-open");
    closeMobileDetail();
    dialogs.innerHTML = "";
    root.innerHTML = data.shells[section];
    // Resizing lasts only until the visitor switches app tabs or reloads.
    GoferSettings.set("sidebar_width", "290px");
    if (paneDefaults[section]) GoferSettings.set("mail_list_width", paneDefaults[section]);
    GoferSettings.set("mail_list_height", "");
    $("#demo-loading")?.remove();
    root.setAttribute("aria-busy", "false");
    const indicator = $('[data-sidebar-app-indicator]', root);
    if (animate && previous && indicator) {
      const next = indicator.style.transform;
      indicator.style.transition = "none";
      indicator.style.transform = previous;
      requestAnimationFrame(() => { indicator.style.transition = ""; indicator.style.transform = next; });
    }
    if (section === "mail" || section === "compose") { showList(false); selectMessage(state.message, false); }
    if (section === "contacts") { showList(false); selectContact(state.contact, false); }
    if (section === "calendar") showCalendar(state.calendarView, state.date, false);
    prepare(root);
    if (section === "compose") {
      const template = document.createElement("template");
      template.innerHTML = data.compose.pane;
      composePane = template.content.firstElementChild;
      $("#mail-view", root).replaceChildren(composePane);
      configureCompose(composePane);
      prepare($("#mail-view", root));
      root.classList.add("demo-compose-open");
      // Open as the floating composer; the docked pane stays ready for "expand to pane".
      composeMode = "inline";
      floatCompose();
    }
    if (animate && (section === "calendar" || section === "compose" || section.startsWith("settings-"))) animateSectionContent($("#main-content", root));
    notifyParent();
  }

  function showList(animate = true) {
    const contact = state.section === "contacts";
    const key = contact ? `contacts:${state.contactView}` : `${state.folder}:${state.mailView}`;
    const list = contact ? $("#mail-list", root) : $("#mail-list-scroll", root);
    if (!list || !data.lists[key]) return;
    const oldIndicator = $('[data-mail-list-view-indicator],[data-contact-list-view-indicator]', root)?.style.transform;
    const template = document.createElement("template");
    template.innerHTML = data.lists[key];
    list.replaceWith(template.content);
    const nextList = $("#mail-list", root);
    const scroll = $("#mail-list-scroll,#contacts-list-scroll", nextList);
    const nextIndicator = $('[data-mail-list-view-indicator],[data-contact-list-view-indicator]', nextList);
    if (!contact) {
      nextList.dataset.viewMode = state.mailView;
      nextIndicator.style.transform = state.mailView === "table" ? "translateX(calc(100% + 2px))" : "translateX(0)";
      $$('[data-mail-list-view-button]', nextList).forEach(button => { button.setAttribute("aria-pressed", String(button.dataset.mailListViewButton === state.mailView)); });
      const folder = state.folder.replace(/^(work|personal)-/, "");
      $("h2", nextList).textContent = folder.charAt(0).toUpperCase() + folder.slice(1);
      const badge = $("h2", nextList).nextElementSibling;
      if (badge) badge.textContent = $$('.mail-list-item', nextList).length;
    }
    if (animate && oldIndicator && nextIndicator) {
      const next = nextIndicator.style.transform;
      nextIndicator.style.transition = "none";
      nextIndicator.style.transform = oldIndicator;
      requestAnimationFrame(() => { nextIndicator.style.transition = ""; nextIndicator.style.transform = next; });
    }
    prepare(nextList);
    if (!contact) {
      $$('a[data-folder-role]', root).forEach(link => {
        const active = new URL(link.getAttribute("href"), location.origin).searchParams.get("folder") === state.folder;
        link.setAttribute("aria-current", String(active));
        link.classList.toggle("bg-sidebar-accent", active);
        link.classList.toggle("text-sidebar-primary", active);
        link.classList.toggle("font-medium", active);
        link.classList.toggle("text-sidebar-foreground", !active);
      });
      $$('[data-email-id].mail-list-item', nextList).forEach(row => {
        row.firstElementChild.classList.toggle("envelope-active", row.dataset.emailId === state.message);
        row.firstElementChild.classList.toggle("envelope", row.dataset.emailId !== state.message);
      });
    }
    const input = contact ? $('[data-contact-search-input]', root) : $('[data-mail-search-input]', root);
    if (input) input.value = state.query;
    demoLists.set(scroll, { contact, folder: contact ? "contacts" : state.folder, rows: $$('.mail-list-item', scroll), list: null });
    filterList(true);
  }

  function filterList(initial = false) {
    const scroll = $("#mail-list-scroll,#contacts-list-scroll", root);
    const meta = demoLists.get(scroll);
    if (!meta) return;
    const visible = matchingRows(meta.rows);
    const transition = initial ? null : meta.list.captureListTransition();
    const next = initial ? scroll : scroll.cloneNode(false);
    if (!initial) scroll.replaceWith(next);
    hydrateDemoList(next, meta, visible, transition);
  }

  async function switchListView(button) {
    const scroll = $("#mail-list-scroll,#contacts-list-scroll", root);
    const meta = demoLists.get(scroll);
    if (!meta || meta.switching) return;
    const mode = (button.dataset.mailListViewButton || button.dataset.contactListViewButton) === "table" ? "table" : "cards";
    if (mode === meta.list.viewMode) return;
    const group = button.closest("[data-mail-list-view-toggle],[data-contact-list-view-toggle]");
    const syncToggle = mode => {
      $$('[data-mail-list-view-button],[data-contact-list-view-button]', group).forEach(control => {
        const active = (control.dataset.mailListViewButton || control.dataset.contactListViewButton) === mode;
        control.setAttribute("aria-pressed", String(active));
        control.classList.toggle("text-foreground", active);
        control.classList.toggle("text-muted-foreground", !active);
        control.classList.toggle("hover:text-foreground", !active);
      });
      $('[data-mail-list-view-indicator],[data-contact-list-view-indicator]', group).style.transform = mode === "table" ? "translateX(100%)" : "translateX(0)";
    };
    syncToggle(mode);
    meta.switching = true;
    try {
      // Keep the controller and its old geometry: Gofer owns the complete transition.
      await meta.list.switchViewMode(mode);
      if (!scroll.isConnected) return;
      if (meta.contact) state.contactView = mode;
      else state.mailView = mode;
      prepare(scroll);
    } catch (error) {
      console.error(error);
      syncToggle(meta.contact ? state.contactView : state.mailView);
      notice("This view couldn’t load. Please try again.");
    } finally { meta.switching = false; }
  }

  async function switchMailFolder(folder) {
    const scroll = $("#mail-list-scroll", root);
    const meta = demoLists.get(scroll);
    if (!meta || meta.switching) return;
    meta.switching = true;
    state.query = "";
    $('[data-mail-search-input]', root).value = "";
    meta.list.filters.query = "";
    try {
      // Native folder changes retain outgoing rows for the staggered exit/entrance.
      await meta.list.switchFolder(folder, false);
      if (!scroll.isConnected) return;
      state.folder = folder;
      const name = folder.replace(/^(work|personal)-/, "");
      $("h2", $("#mail-list", root)).textContent = name.charAt(0).toUpperCase() + name.slice(1);
      $$('a[data-folder-role]', root).forEach(link => {
        const active = new URL(link.getAttribute("href"), location.origin).searchParams.get("folder") === folder;
        link.setAttribute("aria-current", String(active));
        link.classList.toggle("bg-sidebar-accent", active);
        link.classList.toggle("text-sidebar-primary", active);
        link.classList.toggle("font-medium", active);
        link.classList.toggle("text-sidebar-foreground", !active);
      });
      prepare(scroll);
      const first = $('.mail-list-item[data-email-id]', scroll);
      if (first) selectMessage(first.dataset.emailId, false);
    } catch (error) {
      console.error(error);
      notice("This folder couldn’t load. Please try again.");
    } finally { meta.switching = false; }
  }

  function monday(date) {
    const at = new Date(`${date}T12:00:00Z`);
    at.setUTCDate(at.getUTCDate() - (at.getUTCDay() + 6) % 7);
    return at.toISOString().slice(0, 10);
  }

  async function showCalendar(view, date, animate = true) {
    const key = view === "week" ? `week:${monday(date)}` : `month:${date.slice(0, 7)}`;
    if (!data.calendars[key]) { notice("Explore September, October, and November in this demo."); return; }
    state.calendarView = view;
    state.date = date;
    const generation = ++calendarGeneration;
    let markup = calendarCache.get(key);
    if (!markup) {
      try {
        const response = await fetch(data.calendars[key]);
        if (!response.ok) throw new Error("Calendar period missing");
        markup = await response.json();
        calendarCache.set(key, markup);
      } catch (error) { console.error(error); notice("This calendar period couldn’t load. Please try again."); return; }
    }
    if (generation !== calendarGeneration || state.section !== "calendar") return;
    const main = $("#main-content", root);
    const template = document.createElement("template");
    template.innerHTML = markup;
    main.replaceWith(template.content);
    prepare(root);
    if (animate) animateSectionContent($("#main-content", root));
  }

  function navigateCalendar(href) {
    const url = new URL(href, location.origin);
    const view = url.searchParams.get("view") || "month";
    const date = url.searchParams.get("date") || (url.searchParams.get("month") ? `${url.searchParams.get("month")}-07` : data.date);
    showCalendar(view, date);
  }

  document.addEventListener("click", event => {
    // App links are handled locally, including buttons nested inside mail links.
    const link = event.target.closest("a[href]");
    if (link && root.contains(link)) event.preventDefault();
    const element = event.target.closest("button,a,[data-demo-hx-get],label,[data-demo-compose-action]");
    if (!element) return;
    if (event.target.closest("[data-translate-email],[data-translate-email-language],[data-compose-editor]")) return;
    if (element.dataset.demoScreen) {
      showSection(element.dataset.demoScreen === "main" ? mainSection : element.dataset.demoScreen);
      return;
    }
    if (element.dataset.demoComposeAction) {
      event.preventDefault();
      handleComposeAction(element);
      return;
    }
    const section = element.dataset.sidebarAppButton;
    if (section) { event.preventDefault(); showSection(section); return; }
    if (state.section.startsWith("settings-") && element.matches("[data-settings-sidebar-link]") && settingsScreens[element.dataset.settingsSidebarValue]) {
      event.preventDefault(); showSection(settingsScreens[element.dataset.settingsSidebarValue]); return;
    }
    if (state.section.startsWith("settings-") && element.matches('a[href="/"]') && root.contains(element)) {
      event.preventDefault(); showSection("mail"); return;
    }
    if (element.matches("[data-demo-unavailable]")) { event.preventDefault(); event.stopImmediatePropagation(); notice(); return; }
    if (element.matches("[data-mode]")) { GoferSettings.set("theme", element.dataset.mode); return; }
    if (element.matches("[data-mail-list-view-button],[data-contact-list-view-button]")) {
      event.preventDefault();
      switchListView(element); return;
    }
    if (element.matches("[data-thread-toggle]")) {
      event.preventDefault();
      event.stopPropagation();
      toggleThread(element);
      return;
    }
    if (element.matches("[data-email-body-mode-button]")) { state.bodyMode = element.dataset.emailBodyModeButton; hydrateBodies(); return; }
    if (element.matches("[data-calendar-event-trigger]")) {
      const id = element.dataset.demoHxGet.split("/").pop();
      dialogs.innerHTML = data.events[id];
      prepare(dialogs);
      window.tui.dialog.open($("[data-tui-dialog]", dialogs));
      return;
    }
    if (element.matches("[data-calendar-select-day],[data-calendar-agenda-clear]")) {
      const calendar = $("#calendar-main", root);
      window._calendarSelectedDay = element.matches("[data-calendar-agenda-clear]") ? null : {period:calendar.dataset.calendarPeriod,date:element.dataset.calendarSelectDay};
      initializeCalendarDaySelection();
      return;
    }
    if (element.matches("[data-calendar-week-zoom]")) {
      const action = element.dataset.calendarWeekZoom;
      setCalendarWeekZoom(action === "fit" ? 0 : Math.max(0, Math.min(3, window._calendarWeekZoom + (action === "in" ? 1 : -1))));
      return;
    }
    if (element.matches('[data-demo-hx-get^="/email/"]')) {
      const id = element.dataset.demoHxGet.split("/").pop().split("?")[0];
      event.preventDefault(); selectMessage(id); return;
    }
    const contact = element.closest("[data-contact-list-item]");
    if (contact) { event.preventDefault(); selectContact(contact.dataset.contactListItem); return; }
    const message = element.closest("[data-email-id].mail-list-item");
    if (message && !element.matches("button")) { event.preventDefault(); selectMessage(message.dataset.emailId); return; }
    if (element.matches("[data-sidebar-account-toggle]")) {
      const group = element.closest("[data-sidebar-account]");
      const collapsed = group.dataset.sidebarAccountCollapsed !== "true";
      group.dataset.sidebarAccountCollapsed = String(collapsed);
      element.setAttribute("aria-expanded", String(!collapsed));
      return;
    }
    if (element.tagName === "A") {
      event.preventDefault();
      const url = new URL(element.getAttribute("href"), location.origin);
      if (url.pathname === "/" && !url.search) { showSection("mail"); return; }
      if (url.pathname === "/contacts" && !url.searchParams.has("new")) { showList(); return; }
      if (url.pathname === "/" && url.searchParams.has("email")) {
        const id = url.searchParams.get("email");
        showSection("mail").then(() => { if (state.section === "mail") selectMessage(id); }); return;
      }
      if (url.pathname.startsWith("/settings")) { notice(); return; }
      if (url.pathname === "/calendar") { navigateCalendar(element.getAttribute("href")); return; }
      if (state.section === "mail" && url.searchParams.has("folder")) {
        const folder = url.searchParams.get("folder");
        if (!data.lists[`${folder}:${state.mailView}`]) { notice("Try Inbox, Sent, or Archive in this demo."); return; }
        closeMobileDetail(); switchMailFolder(folder);
        return;
      }
      notice();
    }
  });

  document.addEventListener("input", event => {
    if (event.target.matches("[data-mail-search-input],[data-contact-search-input]")) { state.query = event.target.value; filterList(); }
  });
  document.addEventListener("change", event => {
    const element = event.target;
    if (element.matches('input[name="theme_style"]')) GoferSettings.set("theme_style", element.value);
    if (element.matches("[data-demo-style]")) GoferSettings.set("theme_style", element.value);
    if (element.matches("[data-demo-mode]")) GoferSettings.set("theme", element.value);
    if (element.matches("[data-calendar-visibility]")) {
      window._calendarVisibility.set(element.dataset.calendarVisibility, {visible:element.checked,confirmed:element.checked,saving:false});
      initializeCalendarDaySelection();
    }
  });
  document.addEventListener("submit", event => {
    event.preventDefault();
    const form = event.target;
    if (form.matches("[data-contact-search-form]")) return;
    if (form.matches("[data-mail-sort-form],[data-contact-sort-form]")) {
      const fields = new FormData(form);
      const by = fields.get("sort_by");
      const order = fields.get("sort_order") === "asc" ? 1 : -1;
      const scroll = $("#mail-list-scroll,#contacts-list-scroll", root);
      const rows = demoLists.get(scroll)?.rows;
      if (!rows) return;
      const getText = (row) => {
        if (by === "sender" || by === "name") return $('[data-mail-card-field="from"],[data-mail-table-cell="from"],[data-contact-name]', row)?.textContent || "";
        if (by === "subject") return $('[data-mail-card-field="subject"],[data-mail-table-cell="subject"]', row)?.textContent || "";
        return "";
      };
      rows.sort((a, b) => {
        if (["sender", "name", "subject"].includes(by)) return order * getText(a).localeCompare(getText(b));
        return -order * (Number(a.dataset.position) - Number(b.dataset.position));
      });
      filterList();
      const trigger = form.closest('[data-tui-popover-root]')?.querySelector('[aria-label^="Sort"] span');
      if (trigger) trigger.textContent = {sender:"Sender",subject:"Subject",name:"Name",updated:"Recently updated",last_interaction:"Last interaction",date:"Date"}[by] || "Date";
      const popover = form.closest('[data-tui-popover-content]');
      if (popover) window.tui.popover.closeElement(popover);
      return;
    }
    notice();
  });
  document.body.addEventListener("gofer:settings-changed", event => {
    if (event.detail.key === "theme" || event.detail.key === "theme_style") { syncAppearance(); syncMailSelection(); hydrateBodies(); notifyParent(); }
  });
  back.addEventListener("click", closeMobileDetail);
  const header = $(".demo-standalone-tools");
  new ResizeObserver(() => {
    document.documentElement.style.setProperty("--demo-header-height", `${header.getBoundingClientRect().height}px`);
  }).observe(header);
  window.syncMailSelectionControls = syncMailSelection;
  window.addEventListener("resize", syncMailSelection);
  window.applyEmailBodyTheme = frame => hydrateBodies(frame);
  if (!["en", "cs", "es"].includes(GoferSettings.get("translation_target_language"))) GoferSettings.set("translation_target_language", "cs");
  setupEmailTranslation();
  window.addEventListener("message", event => {
    if (event.source !== window.parent || event.origin !== location.origin) return;
    if (event.data?.type === "gofer-demo-visibility") {
      previewVisible = event.data.visible === true;
      if (previewVisible && pendingEntrance) {
        const enter = pendingEntrance;
        pendingEntrance = null;
        enter();
      }
      return;
    }
    if (event.data?.type !== "gofer-demo-control" || !data) return;
    if (event.data.section) showSection(event.data.section);
    if (["classic", "minimal"].includes(event.data.style)) GoferSettings.set("theme_style", event.data.style);
    if (["light", "dark"].includes(event.data.mode)) GoferSettings.set("theme", event.data.mode);
  });
  fetch("/demo/fixtures.json").then(response => { if (!response.ok) throw new Error("Demo bundle missing"); return response.json(); }).then(bundle => {
    data = bundle;
    const section = new URLSearchParams(location.search).get("section");
    showSection(data.sections[section] ? section : "mail", false);
  }).catch(error => {
    console.error(error);
    $("#demo-loading").textContent = "The demo couldn’t load. Please refresh to try again.";
  });
})();
