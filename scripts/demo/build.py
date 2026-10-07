#!/usr/bin/env python3
"""Export real Gofer UI into this static website, using a disposable snapshot."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(__file__).resolve().parent
SOURCE = json.loads((TOOLS / "source.json").read_text())


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="Read the pinned commit from a local Gofer Git checkout (ignores dirty files).")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-f0-9]{40}", SOURCE["revision"]):
        raise SystemExit("source.json must pin a full Git commit")
    for tool in ("git", "go", "tailwindcss"):
        if not shutil.which(tool):
            raise SystemExit(f"Missing required tool: {tool}")
    help_text = subprocess.check_output(["tailwindcss", "--help"], stderr=subprocess.STDOUT, text=True)
    if f"v{SOURCE['tailwind_version']}" not in help_text:
        raise SystemExit(f"Use Tailwind CSS {SOURCE['tailwind_version']} to reproduce the exported styles")

    with tempfile.TemporaryDirectory(prefix="gofer-website-demo-") as temp:
        temp = Path(temp)
        snapshot = temp / "gofer"
        snapshot.mkdir()
        if args.source:
            source = args.source.resolve()
        else:
            source = temp / "source.git"
            run(["git", "init", "--bare", str(source)], stdout=subprocess.DEVNULL)
            run(["git", "-C", str(source), "fetch", "--depth=1", SOURCE["repository"], SOURCE["revision"]])
        archive = subprocess.check_output(["git", "-C", str(source), "archive", SOURCE["revision"]])
        run(["tar", "-x", "-C", str(snapshot)], input=archive)
        command = snapshot / "cmd" / "website-demo-export"
        command.mkdir(parents=True)
        shutil.copy2(TOOLS / "export.go", command / "main.go")
        generated = temp / "generated"
        assets = generated / "assets"
        assets.mkdir(parents=True)
        env = os.environ.copy()
        env.setdefault("GOCACHE", str(Path(tempfile.gettempdir()) / "gofer-website-demo-go-cache"))
        run(["go", "run", "./cmd/website-demo-export", str(generated / "fixtures.json"), SOURCE["revision"]], cwd=snapshot, env=env)
        # Calendar grids are large: fetch only the period the visitor opens.
        bundle = json.loads((generated / "fixtures.json").read_text())
        translations = json.loads((TOOLS / "translations.json").read_text())
        if set(translations) != set(bundle["bodies"]) or any(set(languages) != {"cs", "es"} for languages in translations.values()):
            raise SystemExit("Every demo email needs saved Czech and Spanish translations")
        (assets / "responsive.css").write_text(bundle["responsiveCSS"])
        calendar_dir = generated / "calendar"
        calendar_dir.mkdir()
        for key, markup in bundle["calendars"].items():
            name = key.replace(":", "-") + ".json"
            (calendar_dir / name).write_text(json.dumps(markup, ensure_ascii=False, separators=(",", ":")))
            bundle["calendars"][key] = "/demo/calendar/" + name
        # Load each app section on demand; the landing page starts with Mail only.
        sections = generated / "sections"
        sections.mkdir()
        manifest = {"revision": bundle["revision"], "date": bundle["date"], "calendars": bundle["calendars"], "sections": {}}
        for section in ("mail", "contacts", "calendar", "compose", "settings-accounts", "settings-sync"):
            part = {"shells": {section: bundle["shells"][section]}}
            if section == "compose":
                part["compose"] = bundle["compose"]
            if section == "mail":
                part.update({key: bundle[key] for key in ("messages", "bodies", "threads", "mailIndex")})
                part["translations"] = {
                    email_id: {"en": bundle["bodies"][email_id], **languages}
                    for email_id, languages in translations.items()
                }
                part["lists"] = {key: value for key, value in bundle["lists"].items() if not key.startswith("contacts:")}
            if section == "contacts":
                part["contacts"] = bundle["contacts"]
                part["activities"] = bundle["activities"]
                part["lists"] = {key: value for key, value in bundle["lists"].items() if key.startswith("contacts:")}
            if section == "calendar":
                part["events"] = bundle["events"]
            name = section + ".json"
            (sections / name).write_text(json.dumps(part, ensure_ascii=False, separators=(",", ":")))
            manifest["sections"][section] = "/demo/sections/" + name
        (generated / "fixtures.json").write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")))
        run(["tailwindcss", "-i", "assets/css/input.css", "-o", str(assets / "app.css"), "--minify"], cwd=snapshot)
        scripts = ["floating_ui_core", "floating_ui_dom", "dialog", "dropdown", "popover", "selectbox", "checkbox", "input", "tabs", "resize", "ui-settings"]
        for script in scripts:
            text = (snapshot / "assets" / "js" / f"{script}.js").read_text()
            if script == "ui-settings":
                text = text.replace('"gofer:ui_settings"', '"gofer:website-demo:ui_settings"')
                text = text.replace("Object.assign({}, _cache, serverSettings)", "Object.assign({}, serverSettings, _cache)")
                # Keep theme preferences, but never restore or persist pane sizes.
                pane_keys = ("sidebar_width", "mail_list_width", "mail_list_height")
                discard_sizes = "\n".join(f"        delete _cache.{key};" for key in pane_keys)
                text = text.replace("_cache = JSON.parse(raw);", "_cache = JSON.parse(raw);\n" + discard_sizes)
                saved_sizes = "\n".join(f"      delete saved.{key};" for key in pane_keys)
                text = text.replace(
                    "localStorage.setItem(LS_KEY, JSON.stringify(_cache));",
                    "var saved = Object.assign({}, _cache);\n" + saved_sizes + "\n      localStorage.setItem(LS_KEY, JSON.stringify(saved));",
                )
            (assets / f"{script}.js").write_text(text)
        # Use the exact app section motion, without loading its network/session code.
        app = (snapshot / "assets/js/app.js").read_text()
        # Export browser-only composing behavior. The website supplies local state
        # adapters; no autosave, send, signature lookup, or upload handlers are loaded.
        compose_names = [
            "_composeRecipientEmail", "_isComposeRecipientValid", "_splitComposeRecipients",
            "focusComposeRecipientField", "_composeRecipientValueInput", "_composeRecipientValues",
            "_syncComposeRecipientField", "_makeComposeRecipientChip", "removeComposeRecipientChip",
            "renderComposeRecipientField", "renderComposeRecipientFields", "finalizeComposeRecipientInput",
            "handleComposeRecipientKeydown", "handleComposeRecipientInput", "finalizeComposeRecipients",
            "_composeFormFrom", "_composeEditorFrom", "setActiveComposeEditor", "_saveComposeSelection",
            "_restoreComposeSelection", "_escapeComposeHTML", "_composePlainToHTML",
            "_sanitizeComposeImageStyle", "_sanitizeComposeStyle", "_mergeComposeStyle",
            "_inlineComposeStyleRules", "_sanitizeComposeHTML", "_composeEditorText", "composeChanged",
            "composeExec", "composeCreateLink", "updateComposeToolbar", "selectComposeAccount",
            "syncComposeAccountItems", "closeComposeSignatureMenu", "showComposeSignaturePicker",
            "_composeHiddenInput", "composeAttachmentKind", "toggleComposeAttachments",
            "updateComposeAttachmentSummary", "addComposeAttachment", "formatComposeAttachmentSize",
            "renderComposeAttachments", "readComposeAttachments",
            "isStackedComposeLayout", "applyComposeFullWidthInstant",
            "expandComposeFullWidth", "collapseComposeFullWidth",
        ]
        compose_script = ["var _activeComposeEditor = null; var _composeSignatureMenu = null; var _composeSignatureDismiss = null;"]
        for name in compose_names:
            start = app.index("function " + name + "(")
            end = app.index("\n}\n", start) + 3
            function = app[start:end]
            if name in ("expandComposeFullWidth", "collapseComposeFullWidth"):
                # Retain the app's sizing/fade choreography, using pixel endpoints
                # while clipping fixed-size content. Never measure by resizing the
                # live mail list, which would also move its flex sibling.
                if name == "expandComposeFullWidth":
                    saved_width = '  mailList._savedWidth = axis === "height" ? mailList.style.height : mailList.style.width'
                    function = function.replace(saved_width, saved_width + '\n  if (axis === "width") _freezeComposeMailList(mailList, false);')
                    animation_start = function.index('  var composePane = document.querySelector("[data-compose-pane]")')
                    animation_end = function.index('\n  function onEnd(ev)', animation_start)
                    function = function[:animation_start] + "  _animateComposePane(axis);\n" + function[animation_end:]
                else:
                    function = function.replace('  var axis = mailList._composeFullWidthAxis', '  mailList._animating = true;\n  var axis = mailList._composeFullWidthAxis')
                    function = function.replace('  mailList.style.display = ""', '  mailList.style.display = ""\n  if (axis === "width") _freezeComposeMailList(mailList, true);')
                    function = function.replace('    mailList.style[axis] = mailList._savedWidth', '    mailList.style[axis] = axis === "width" ? mailList._demoTargetWidth + "px" : mailList._savedWidth')
                    function = function.replace('    mailList.style.transition = ""', '    mailList._animating = false;\n    mailList.style.transition = ""\n    mailList.style[axis] = mailList._savedWidth')
                    function = function.replace('  var normal = document.getElementById("pane-btns-normal")', '  _animateComposePane(axis);\n  var normal = document.getElementById("pane-btns-normal")')
                function = function.replace('    mailList.style.transition = ""', '    _releaseComposeMailList(mailList);\n    mailList.style.transition = ""')
                # Complete once even when hidden/mobile panes emit no transition.
                function = function.replace("  function onEnd(ev) {", "  var animationFinished = false;\n  function onEnd(ev) {\n    if (animationFinished) return;")
                function = function.replace('    mailList.removeEventListener("transitionend", onEnd)', '    animationFinished = true;\n    mailList.removeEventListener("transitionend", onEnd)')
                function = function.replace('  mailList.addEventListener("transitionend", onEnd)', '  mailList.addEventListener("transitionend", onEnd)\n  setTimeout(function () { onEnd({ target: mailList, propertyName: axis }); }, 400)')
            if name == "closeComposeSignatureMenu":
                function = function.replace(
                    "  if (_composeSignatureMenu)",
                    '  document.removeEventListener("mousedown", _composeSignatureDismiss);\n  _composeSignatureDismiss = null;\n  if (_composeSignatureMenu)',
                )
            if name == "showComposeSignaturePicker":
                function = function.replace("document.body.appendChild(menu)", '(el.closest("dialog") || document.body).appendChild(menu)')
                # Keep a real mouse press inside the menu from removing it before
                # its button's click can insert the signature.
                function = function.replace(
                    'setTimeout(function () { document.addEventListener("mousedown", closeComposeSignatureMenu, { once: true }) }, 0)',
                    '_composeSignatureDismiss = function (event) {\n      if (!menu.contains(event.target) && !el.contains(event.target)) closeComposeSignatureMenu();\n    };\n    document.addEventListener("mousedown", _composeSignatureDismiss);',
                )
            compose_script.append(function)
        (assets / "compose-ui.js").write_text("\n".join(compose_script))
        start = app.index("function animateSectionContent(section) {")
        end = app.index('\n}\n', start) + 3
        (assets / "motion.js").write_text(app[start:end])
        # Keep the complete native list renderers. The demo supplies local rows
        # and thread fixtures; omit only the app's browser-history integration.
        virtual_list = (snapshot / "assets/js/virtual-scroll.js").read_text()
        history_start = virtual_list.index('window.addEventListener("popstate",')
        (assets / "virtual-scroll.js").write_text(virtual_list[:history_start])
        # Reading-pane thread disclosure has its own native height/fade animation.
        start = app.index("(function () {\n  var DURATION = '0.2s'")
        end = app.index("\n})()", start) + len("\n})()")
        (assets / "thread-details.js").write_text(app[start:end])
        # Keep the app's translation controls; demo.js supplies saved iframe bodies.
        start = app.index("  function setupEmailTranslation() {")
        end = app.index("\n  function setupSidebarAccountCollapse()", start)
        translation_ui = app[start:end].replace('"google_web_basic"', '"demo"').replace(
            "    syncTranslationControls(document)",
            "    window.initializeEmailTranslationControls = syncTranslationControls\n    syncTranslationControls(document)",
            1,
        )
        (assets / "translation-ui.js").write_text(translation_ui)
        # Reuse calendar layout, zoom and pill animations without its API handlers.
        calendar_start = app.index("function _calendarWeekAxis(")
        calendar_end = app.index('\ndocument.addEventListener("scroll",', calendar_start)
        calendar_names = re.findall(r"^function (\w+)\(", app[calendar_start:calendar_end], re.MULTILINE)
        calendar_names += ["_calendarSourceIsVisible", "_calendarAgendaEventMatchesDay", "_calendarAgendaEventIsUpcoming", "initializeCalendarVisibility", "setCalendarViewSwitch", "initializeCalendarDaySelection"]
        calendar_script = re.findall(r"^var _calendar(?:SelectedDay|ViewSwitchRequest|WeekScrollState|WeekZoom|ViewportObserver|ViewportPane|LayoutFrame|Visibility|PillSnapshot|PillFades) = .*?$", app, re.MULTILINE)
        for name in calendar_names:
            start = app.index("function " + name + "(")
            end = app.index("\n}\n", start) + 3
            function = app[start:end]
            if name == "_calendarAgendaEventIsUpcoming":
                function = function.replace("Date.now()", 'Date.parse("2026-10-07T09:00:00+02:00")')
            function = function.replace('"hx-get"', '"data-demo-hx-get"').replace('"hx-push-url"', '"data-demo-hx-push-url"')
            calendar_script.append(function)
        (assets / "calendar-ui.js").write_text("\n".join(calendar_script))
        shutil.copy2(snapshot / "assets/logo.svg", assets / "logo.svg")
        shutil.copy2(snapshot / "LICENSE", generated / "GOFER-LICENSE.txt")
        (generated / "source.json").write_text(json.dumps(SOURCE, indent=2) + "\n")
        # Publish only after both rendering and CSS generation succeed.
        destination = ROOT / "static/demo"
        destination.mkdir(parents=True, exist_ok=True)
        for name in ("assets", "calendar", "sections", "fixtures.json", "GOFER-LICENSE.txt", "source.json"):
            target = destination / name
            if target.is_dir():
                shutil.rmtree(target)
            elif target.exists():
                target.unlink()
            shutil.move(str(generated / name), target)
        print(f"Exported Gofer {SOURCE['revision']} into {destination}")


if __name__ == "__main__":
    main()
