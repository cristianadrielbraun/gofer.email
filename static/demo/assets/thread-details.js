(function () {
  var DURATION = '0.2s'
  var EASING = 'cubic-bezier(0.4,0,0.2,1)'
  var FADE = '0.15s'

  function clearStyles(ct) {
    ct.style.height = ''
    ct.style.overflow = ''
    ct.style.transition = ''
    ct.style.opacity = ''
    ct.style.willChange = ''
  }

  function fadeIframes(ct, show) {
    var iframes = ct.querySelectorAll('iframe')
    for (var j = 0; j < iframes.length; j++) {
      if (show) {
        iframes[j].style.visibility = ''
        iframes[j].style.opacity = '0'
        iframes[j].style.transition = 'opacity ' + FADE + ' ease-out'
        void iframes[j].offsetHeight
        iframes[j].style.opacity = '1'
      } else {
        iframes[j].style.opacity = '1'
        iframes[j].style.transition = 'opacity ' + FADE + ' ease-out'
        void iframes[j].offsetHeight
        iframes[j].style.opacity = '0'
      }
      ;(function (iframe) {
        function done() {
          iframe.removeEventListener('transitionend', done)
          iframe.style.transition = ''
          iframe.style.opacity = ''
          if (!show) iframe.style.visibility = 'hidden'
        }
        iframe.addEventListener('transitionend', done)
      })(iframes[j])
    }
  }

  function collapseDetails(el) {
    var ct = el.querySelector('.thread-details-content')
    if (!ct || el._threadAnimating) return
    el._threadAnimating = true
    ct.style.willChange = 'height, opacity'

    var h = ct.scrollHeight
    ct.style.height = h + 'px'
    ct.style.overflow = 'hidden'
    ct.style.transition = 'none'
    void ct.offsetHeight

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        fadeIframes(ct, false)
        ct.style.transition = 'height ' + DURATION + ' ' + EASING + ', opacity ' + DURATION + ' ease-out'
        ct.style.height = '0px'
        ct.style.opacity = '0'

        function onEnd(ev) {
          if (ev.propertyName !== 'height') return
          ct.removeEventListener('transitionend', onEnd)
          el.open = false
          clearStyles(ct)
          el._threadAnimating = false
        }
        ct.addEventListener('transitionend', onEnd)
      })
    })
  }

  function expandDetails(el) {
    var ct = el.querySelector('.thread-details-content')
    if (!ct || el._threadAnimating) return
    el._threadAnimating = true
    ct.style.willChange = 'height, opacity'

    el.open = true
    ct.style.height = '0px'
    ct.style.overflow = 'hidden'
    ct.style.opacity = '0'
    ct.style.transition = 'none'
    void ct.offsetHeight

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        ct.style.transition = 'height ' + DURATION + ' ' + EASING + ', opacity ' + DURATION + ' ease-out'
        ct.style.height = ct.scrollHeight + 'px'
        ct.style.opacity = '1'

        function onEnd(ev) {
          if (ev.propertyName !== 'height') return
          ct.removeEventListener('transitionend', onEnd)
          clearStyles(ct)
          fadeIframes(ct, true)
          el._threadAnimating = false
        }
        ct.addEventListener('transitionend', onEnd)
      })
    })
  }

  function getSiblings(el) {
    var parent = el.parentElement
    if (!parent) return []
    var siblings = []
    var details = parent.querySelectorAll('details[data-thread-details]')
    for (var i = 0; i < details.length; i++) {
      if (details[i] !== el) siblings.push(details[i])
    }
    return siblings
  }

  function initThreadDetails(root) {
    var details = root.querySelectorAll('details[data-thread-details]')
    for (var i = 0; i < details.length; i++) {
      if (details[i]._threadInit) continue
      details[i]._threadInit = true

      details[i].addEventListener('click', function (e) {
        var el = this
        var target = e.target

        if (target.closest('[data-thread-show-exclusive]')) {
          e.preventDefault()
          e.stopPropagation()
          expandDetails(el)
          var siblings = getSiblings(el)
          for (var j = 0; j < siblings.length; j++) {
            if (siblings[j].open) collapseDetails(siblings[j])
          }
          return
        }

        if (target.closest('[data-thread-hide-others]')) {
          e.preventDefault()
          e.stopPropagation()
          var siblings = getSiblings(el)
          for (var j = 0; j < siblings.length; j++) {
            if (siblings[j].open) collapseDetails(siblings[j])
          }
          return
        }

        var summary = target.closest('summary')
        if (!summary || summary.parentElement !== el) return

        e.preventDefault()
        if (el.open) {
          collapseDetails(el)
        } else {
          expandDetails(el)
        }
      })
    }
  }

  initThreadDetails(document.body)
  new MutationObserver(function () { initThreadDetails(document.body) }).observe(document.body, { childList: true, subtree: true })
})()