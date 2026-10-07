  function setupEmailTranslation() {
    function setting(key, fallback) {
      if (window.GoferSettings && GoferSettings.get(key)) return GoferSettings.get(key)
      return fallback
    }

    function provider() {
      return setting("translation_provider", "demo") || "demo"
    }

    function targetLanguage() {
      return setting("translation_target_language", "en") || "en"
    }

    var translationLanguages = [
      { code: "en", label: "English" },
      { code: "cs", label: "Czech" },
      { code: "de", label: "German" },
      { code: "es", label: "Spanish" },
      { code: "fr", label: "French" },
      { code: "it", label: "Italian" },
      { code: "nl", label: "Dutch" },
      { code: "pl", label: "Polish" },
      { code: "pt", label: "Portuguese" },
      { code: "uk", label: "Ukrainian" },
      { code: "zh-cn", label: "Chinese" },
      { code: "ja", label: "Japanese" },
      { code: "ko", label: "Korean" }
    ]

    function normalizeTranslationLanguageCode(code) {
      var normalized = String(code || "").toLowerCase()
      if (normalized === "zh") normalized = "zh-cn"
      return normalized
    }

    function languageLabel(code) {
      var normalized = normalizeTranslationLanguageCode(code)
      for (var i = 0; i < translationLanguages.length; i++) {
        if (translationLanguages[i].code === normalized) return translationLanguages[i].label
      }
      return code || "selected language"
    }

    function translationEnabled() {
      return setting("translation_button_enabled", "true") !== "false"
    }

    function emailSelector(attr, emailId) {
      return "[" + attr + '="' + String(emailId).replace(/"/g, '\\"') + '"]'
    }

    function frameForEmail(emailId) {
      return document.querySelector('[data-email-body-frame][data-email-id="' + String(emailId).replace(/"/g, '\\"') + '"]')
    }

    function buttonForEmail(emailId) {
      return document.querySelector(emailSelector("data-translate-email", emailId))
    }

    function idleButtonLabel() {
      var target = targetLanguage()
      return target ? "Translate to " + languageLabel(target) : "Translate"
    }

    function activeTargetLanguage(emailId) {
      var frame = frameForEmail(emailId)
      return frame && frame.dataset.translationTargetLanguage ? frame.dataset.translationTargetLanguage : targetLanguage()
    }

    function syncTranslationLanguageItems(emailId) {
      if (!emailId) return
      var active = normalizeTranslationLanguageCode(activeTargetLanguage(emailId))
      var items = document.querySelectorAll(emailSelector("data-translate-email-language", emailId))
      for (var i = 0; i < items.length; i++) {
        items[i].dataset.translationLanguageSelected = normalizeTranslationLanguageCode(items[i].dataset.translationLanguage) === active ? "true" : "false"
      }
    }

    function setButtonState(emailId, state, data) {
      var button = buttonForEmail(emailId)
      if (!button) return
      var label = button.querySelector("[data-translate-email-label]")
      var shell = button.closest("[data-email-translation-button]")
      var text = idleButtonLabel()
      var translated = state === "translated"
      if (state === "loading") text = "Translating..."
      if (state === "error") text = "Translation failed"
      if (translated) text = "Show original"
      if (label && label.textContent !== text) label.textContent = text
      button.disabled = state === "loading"
      button.dataset.translationState = state
      button.dataset.translated = translated ? "true" : "false"
      if (shell) shell.dataset.translated = translated ? "true" : "false"
      button.setAttribute("aria-pressed", translated ? "true" : "false")
      button.setAttribute("aria-label", translated ? "Show original email" : idleButtonLabel())
      button.classList.toggle("opacity-60", state === "loading")
      syncTranslationLanguageItems(emailId)
      if (translated && data) {
        button.title = "Translated to " + languageLabel(activeTargetLanguage(emailId))
      } else {
        button.removeAttribute("title")
      }
    }

    function syncTranslationButton(button) {
      if (!button || !button.dataset) return
      var frame = frameForEmail(button.dataset.translateEmail)
      if (frame && frame.dataset.translationActive === "true") {
        setButtonState(button.dataset.translateEmail, button.dataset.translationState === "loading" ? "loading" : "translated", true)
        return
      }
      if (!button.disabled) setButtonState(button.dataset.translateEmail, "idle")
    }

    function syncTranslationControls(root) {
      var enabled = translationEnabled()
      var scope = root || document
      if (!scope.querySelectorAll) scope = document
      if (scope.matches && scope.matches("[data-email-translation-shell]")) {
        scope.classList.toggle("hidden", !enabled)
      }
      var shells = scope.querySelectorAll("[data-email-translation-shell]")
      for (var i = 0; i < shells.length; i++) shells[i].classList.toggle("hidden", !enabled)

      if (scope.matches && scope.matches("[data-translate-email]")) {
        syncTranslationButton(scope)
      }
      var buttons = scope.querySelectorAll("[data-translate-email]")
      for (var j = 0; j < buttons.length; j++) syncTranslationButton(buttons[j])
    }

    function showOriginal(emailId) {
      var frame = frameForEmail(emailId)
      if (frame) {
        delete frame.dataset.translationActive
        delete frame.dataset.translationProvider
        delete frame.dataset.translationTargetLanguage
        delete frame.dataset.translationCacheKey
        if (typeof applyEmailBodyTheme === "function") applyEmailBodyTheme(frame)
      }
      setButtonState(emailId, "idle")
    }

    function setTranslationLoading(emailId) {
      setButtonState(emailId, "loading")
    }

    function setTranslationError(emailId, message) {
      setButtonState(emailId, "error")
      window.setTimeout(function () {
        var button = buttonForEmail(emailId)
        if (button && button.dataset.translationState === "error") syncTranslationButton(button)
      }, message ? 3000 : 1800)
    }

    function translateEmail(emailId, button, targetOverride) {
      var frame = frameForEmail(emailId)
      if (!frame) {
        setTranslationError(emailId)
        return
      }
      if (frame && frame.dataset.translationActive === "true" && !targetOverride) {
        showOriginal(emailId)
        return
      }

      var currentProvider = provider()
      var target = targetOverride || targetLanguage()
      var cacheKey = currentProvider + "|" + target
      frame.dataset.translationActive = "true"
      frame.dataset.translationProvider = currentProvider
      frame.dataset.translationTargetLanguage = target
      frame.dataset.translationCacheKey = cacheKey
      setTranslationLoading(emailId)
      if (button) button.classList.add("opacity-60")
      if (typeof applyEmailBodyTheme === "function") applyEmailBodyTheme(frame)
    }

    window.goferEmailTranslationFrameLoaded = function (emailId) {
      var frame = frameForEmail(emailId)
      if (frame && frame.dataset.translationActive === "true") setButtonState(emailId, "translated", true)
    }

    window.initializeEmailTranslationControls = syncTranslationControls
    syncTranslationControls(document)

    document.body.addEventListener("htmx:afterSwap", function (event) {
      syncTranslationControls(event.target || document)
    })
    document.body.addEventListener("htmx:oobAfterSwap", function (event) {
      syncTranslationControls(event.target || document)
    })
    document.body.addEventListener("gofer:settings-changed", function () {
      syncTranslationControls(document)
    })

    document.addEventListener("click", function (e) {
      var language = e.target.closest("[data-translate-email-language]")
      if (language) {
        e.preventDefault()
        if (!translationEnabled()) return
        translateEmail(language.dataset.translateEmailLanguage, buttonForEmail(language.dataset.translateEmailLanguage), language.dataset.translationLanguage)
        return
      }

      var translate = e.target.closest("[data-translate-email]")
      if (translate) {
        e.preventDefault()
        if (!translationEnabled()) return
        translateEmail(translate.dataset.translateEmail, translate)
        return
      }
    })
  }
