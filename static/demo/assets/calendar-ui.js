var _calendarSelectedDay = null
var _calendarViewSwitchRequest = null
var _calendarWeekScrollState = null
var _calendarWeekZoom = 0
var _calendarViewportObserver = null
var _calendarViewportPane = null
var _calendarLayoutFrame = null
var _calendarVisibility = new Map()
var _calendarPillSnapshot = null
var _calendarPillFades = new Map()
function _calendarWeekAxis(availableHeight, periods, zoom) {
  var busy = Array(24).fill(false)
  periods.forEach(function (period) {
    for (var hour = 0; hour < 24; hour++) {
      if (period.start < (hour + 1) * 60 && (period.end > hour * 60 ||
          (period.start === period.end && period.start >= hour * 60))) busy[hour] = true
    }
  })
  var hasEvents = busy.some(function (value) { return value })
  var expanded = busy.map(function (value, hour) { return value || (!hasEvents && hour >= 8 && hour < 18) })
  var height = Math.max(1, availableHeight)
  var heights
  if (zoom > 0) {
    height = Math.max(height * [1, 1.4, 2, 2.6][zoom], [0, 960, 1536, 2304][zoom])
    heights = Array(24).fill(height / 24)
  } else {
    var minimum = Math.min(4, height / 48)
    var weights = expanded.map(function (value) { return value ? 4 : 0.5 })
    var total = weights.reduce(function (sum, weight) { return sum + weight }, 0)
    heights = weights.map(function (weight) { return minimum + (height - minimum * 24) * weight / total })
  }
  var offsets = [0]
  heights.forEach(function (value) { offsets.push(offsets[offsets.length - 1] + value) })
  return { height: height, heights: heights, offsets: offsets, expanded: expanded, zoom: zoom }
}

function _calendarWeekMinutePosition(minute, axis) {
  minute = Math.max(0, Math.min(1440, minute))
  if (minute === 1440) return axis.height
  var hour = Math.floor(minute / 60)
  return axis.offsets[hour] + axis.heights[hour] * (minute % 60) / 60
}

function _calendarWeekMinuteAtPosition(position, axis) {
  position = Math.max(0, Math.min(axis.height, position))
  if (position === axis.height) return 1440
  for (var hour = 0; hour < 24; hour++) {
    if (position < axis.offsets[hour + 1]) return hour * 60 + (position - axis.offsets[hour]) * 60 / axis.heights[hour]
  }
  return 1440
}

function _calendarWeekBlockLayout(periods, axis) {
  var minimum = Math.min(22, axis.height)
  var blocks = periods.map(function (period, index) {
    var top = Math.min(_calendarWeekMinutePosition(period.start, axis), axis.height - minimum)
    var end = Math.min(axis.height, Math.max(_calendarWeekMinutePosition(period.end, axis), top + minimum))
    return { index: index, top: top, height: end - top, end: end, column: 0, columns: 1 }
  }).sort(function (left, right) { return left.top - right.top || right.end - left.end || left.index - right.index })
  for (var first = 0; first < blocks.length;) {
    var last = first, groupEnd = -1, columns = []
    while (last < blocks.length && (last === first || blocks[last].top < groupEnd - 0.01)) {
      var block = blocks[last]
      var column = 0
      while (column < columns.length && columns[column] > block.top + 0.01) column++
      columns[column] = block.end
      block.column = column
      groupEnd = Math.max(groupEnd, block.end)
      last++
    }
    for (var index = first; index < last; index++) blocks[index].columns = columns.length
    first = last
  }
  return blocks
}

function _calendarMonthVisibleCount(total, available, itemHeight, overflowHeight, gap) {
  var visible = Math.min(total, 3, Math.max(0, Math.floor((available + gap) / (itemHeight + gap))))
  if (total > visible) visible = Math.min(visible, Math.max(0, Math.floor((available - overflowHeight) / (itemHeight + gap))))
  return visible
}

function _calendarAllDayEventRows(days) {
  var spans = new Map(), rows = new Map(), ends = []
  days.forEach(function (day, index) {
    day.buttons.forEach(function (button) {
      var event = button.dataset
      var id = event.calendarMonthEvent || event.calendarWeekAllDay
      if (event.calendarEventAllDay !== "true" || !id ||
          !(Date.parse(event.calendarEventEndDate) - Date.parse(event.calendarEventStartDate) > 86400000)) return
      var span = spans.get(id)
      if (!span) { span = { first: index, last: index, buttons: [] }; spans.set(id, span) }
      span.last = index
      span.buttons.push(button)
    })
  })
  Array.from(spans.values()).sort(function (a, b) { return a.first - b.first || b.last - a.last }).forEach(function (span) {
    var row = 0
    while (row < ends.length && ends[row] >= span.first) row++
    ends[row] = span.last
    span.buttons.forEach(function (button) { rows.set(button, row) })
  })
  days.forEach(function (day) {
    var occupied = new Set(day.buttons.filter(function (button) { return rows.has(button) }).map(function (button) { return rows.get(button) }))
    day.buttons.forEach(function (button) {
      if (rows.has(button)) return
      var row = 0
      while (occupied.has(row)) row++
      occupied.add(row)
      rows.set(button, row)
    })
  })
  return rows
}

function layoutCalendarMonth(calendar) {
  var grid = calendar.querySelector("[data-calendar-month-grid]")
  if (!grid || grid.clientHeight === 0) return
  var weeks = new Map()
  grid.querySelectorAll("[data-calendar-month-events]").forEach(function (container) {
    var allButtons = Array.from(container.querySelectorAll("[data-calendar-month-event]"))
    var buttons = allButtons.filter(_calendarSourceIsVisible)
    var overflow = container.querySelector("[data-calendar-day-overflow]")
    if (!overflow) return
    var total = buttons.length
    var day = container.closest("[data-calendar-day]")
    day.dataset.calendarDayEventCount = String(total)
    allButtons.forEach(function (button) {
      button.hidden = true
      button.style.display = "none"
    })
    container.hidden = total === 0
    if (!total) { overflow.hidden = true; return }
    var key = day.dataset.calendarWeekStart || ""
    if (!weeks.has(key)) weeks.set(key, [])
    weeks.get(key).push({ container: container, buttons: buttons, overflow: overflow })
  })
  weeks.forEach(function (days) {
    var rows = _calendarAllDayEventRows(days), spanLimits = new Map()
    days.forEach(function (day) {
      var buttons = day.buttons, overflow = day.overflow
      var totalRows = Math.max.apply(null, buttons.map(function (button) { return rows.get(button) })) + 1
      // Measuring a visible candidate avoids stale zero heights after a resize.
      buttons[0].hidden = false
      buttons[0].style.display = ""
      buttons[0].style.gridRow = "1"
      overflow.hidden = false
      day.limit = _calendarMonthVisibleCount(totalRows, day.container.clientHeight, buttons[0].offsetHeight, overflow.offsetHeight, 4)
      buttons.forEach(function (button) {
        var event = button.dataset
        if (event.calendarEventAllDay !== "true" || !event.calendarMonthEvent) return
        var previous = spanLimits.get(event.calendarMonthEvent)
        spanLimits.set(event.calendarMonthEvent, previous === undefined ? day.limit : Math.min(previous, day.limit))
      })
    })
    days.forEach(function (day) {
      var visible = 0
      day.buttons.forEach(function (button) {
        var row = rows.get(button), limit = spanLimits.get(button.dataset.calendarMonthEvent)
        var show = row < day.limit && (limit === undefined || row < limit)
        button.hidden = !show
        button.style.display = show ? "" : "none"
        button.style.gridRow = String(row + 1)
        if (show) visible++
      })
      day.overflow.hidden = day.buttons.length <= visible
      day.overflow.textContent = "+" + (day.buttons.length - visible) + " more"
    })
  })
}

function layoutCalendarWeekAllDay(grid) {
  var days = Array.from(grid.querySelectorAll("[data-calendar-all-day-column]")).map(function (column) {
    var buttons = Array.from(column.querySelectorAll("[data-calendar-week-all-day]"))
    buttons.forEach(function (button) {
      button.hidden = !_calendarSourceIsVisible(button)
      button.style.display = button.hidden ? "none" : ""
    })
    return { buttons: buttons.filter(_calendarSourceIsVisible) }
  })
  var rows = _calendarAllDayEventRows(days)
  rows.forEach(function (row, button) { button.style.gridRow = String(row + 1) })
}

function initializeCalendarWeekScroll() {
  var calendar = document.getElementById("calendar-main")
  var scroller = calendar && calendar.querySelector("[data-calendar-week-scroll]")
  if (!scroller || scroller.clientHeight === 0) return
  // Keep day widths stable as zoom adds or removes the vertical scrollbar.
  scroller.style.scrollbarGutter = "stable"
  scroller.style.overflowAnchor = "none"
  var grid = scroller.querySelector("[data-calendar-week-grid]")
  var header = grid && grid.querySelector("[data-calendar-week-header]")
  var timeline = grid && grid.querySelector("[data-calendar-week-timeline]")
  if (!header || !timeline) return
  layoutCalendarWeekAllDay(grid)
  var nodes = Array.from(grid.querySelectorAll("[data-calendar-week-event]"))
  var visibility = nodes.map(function (node) { return _calendarSourceIsVisible(node) ? "1" : "0" }).join("")
  var key = [scroller.clientHeight, scroller.clientWidth, header.offsetHeight, _calendarWeekZoom, visibility].join(":")
  if (scroller.dataset.calendarLayoutKey === key) return
  cancelCalendarWeekZoom(scroller)
  var previousAxis = grid._calendarWeekAxis
  var previousTop = scroller.scrollTop
  var wasInitialized = !!scroller.dataset.calendarLayoutKey
  nodes = nodes.filter(_calendarSourceIsVisible)
  var periods = nodes.map(function (node) { return { start: Number(node.dataset.calendarWeekStart), end: Number(node.dataset.calendarWeekEnd) } })
  var axis = _calendarWeekAxis(Math.max(1, scroller.clientHeight - header.offsetHeight - 2), periods, _calendarWeekZoom)
  grid.style.height = (axis.height + header.offsetHeight + 2) + "px"
  grid._calendarWeekAxis = axis
  timeline.style.height = axis.height + "px"
  timeline.style.flex = "0 0 auto"
  grid.querySelectorAll("[data-calendar-week-hour]").forEach(function (row) {
    var hour = Number(row.dataset.calendarWeekHour)
    var compact = _calendarWeekZoom === 0 && !axis.expanded[hour]
    var first = hour === 0 || axis.expanded[hour - 1]
    row.style.height = axis.heights[hour] + "px"
    row.style.borderTopStyle = compact && !first ? "none" : "solid"
    row.querySelector("[data-calendar-half-hour]").hidden = compact || axis.heights[hour] < 28
  })
  grid.querySelectorAll("[data-calendar-week-hour-label]").forEach(function (row) {
    var hour = Number(row.dataset.calendarWeekHourLabel)
    var text = row.querySelector("[data-calendar-week-hour-text]")
    row.style.height = axis.heights[hour] + "px"
    text.hidden = false
    text.textContent = String(hour).padStart(2, "0") + ":00"
    text.title = ""
    if (_calendarWeekZoom === 0 && !axis.expanded[hour]) {
      var end = hour + 1
      while (end < 24 && !axis.expanded[end]) end++
      text.hidden = (hour > 0 && !axis.expanded[hour - 1]) || axis.offsets[end] - axis.offsets[hour] < 15
      text.textContent = String(hour).padStart(2, "0") + "–" + String(end).padStart(2, "0")
      text.title = "Empty hours condensed. Zoom in to expand."
    } else if (axis.heights[hour] < 15) text.hidden = hour % 2 !== 0
  })
  grid.querySelectorAll("[data-calendar-timed-column]").forEach(function (column) {
    var buttons = Array.from(column.querySelectorAll("[data-calendar-week-event]")).filter(_calendarSourceIsVisible)
    var columnPeriods = buttons.map(function (node) { return { start: Number(node.dataset.calendarWeekStart), end: Number(node.dataset.calendarWeekEnd) } })
    _calendarWeekBlockLayout(columnPeriods, axis).forEach(function (block) {
      var button = buttons[block.index]
      button.style.top = block.top + "px"
      button.style.height = block.height + "px"
      button.style.left = "calc(" + (block.column * 100 / block.columns) + "% + 2px)"
      button.style.width = "calc(" + (100 / block.columns) + "% - 4px)"
      var time = button.querySelector("[data-calendar-week-event-time]")
      if (time) time.hidden = block.height < 42
    })
  })
  scroller.dataset.calendarLayoutKey = key
  var saved = _calendarWeekScrollState && _calendarWeekScrollState.period === calendar.dataset.calendarPeriod ? _calendarWeekScrollState : null
  if (_calendarWeekZoom === 0) scroller.scrollTop = 0
  else if (!wasInitialized) scroller.scrollTop = saved && saved.zoom === _calendarWeekZoom ? saved.top : _calendarWeekMinutePosition(7 * 60, axis)
  else if (previousAxis && previousAxis.zoom !== _calendarWeekZoom) {
    var center = _calendarWeekMinuteAtPosition(previousTop + (scroller.clientHeight - header.offsetHeight - 2) / 2, previousAxis)
    scroller.scrollTop = Math.max(0, _calendarWeekMinutePosition(center, axis) - (scroller.clientHeight - header.offsetHeight - 2) / 2)
  } else if (previousAxis) scroller.scrollTop = previousTop * axis.height / previousAxis.height
  if (!wasInitialized) scroller.scrollLeft = saved ? saved.left : 0
  var status = calendar.querySelector("[data-calendar-week-scale-status]")
  if (status) status.textContent = _calendarWeekZoom === 0 ? "Fit · Empty hours condensed" : "Zoom · " + Math.round(axis.height / 24) + " px/hour"
  calendar.querySelectorAll("[data-calendar-week-zoom]").forEach(function (button) {
    var action = button.dataset.calendarWeekZoom
    button.disabled = action === "out" ? _calendarWeekZoom === 0 : action === "in" && _calendarWeekZoom === 3
    if (action === "fit") {
      button.setAttribute("aria-pressed", _calendarWeekZoom === 0 ? "true" : "false")
      button.classList.toggle("bg-accent", _calendarWeekZoom === 0)
    }
  })
}

function cancelCalendarWeekZoom(scroller) {
  var animation = scroller && scroller._calendarZoomAnimation
  if (!animation) return
  cancelAnimationFrame(animation.frame)
  scroller._calendarZoomAnimation = null
}

function setCalendarWeekZoom(zoom) {
  if (zoom === _calendarWeekZoom) return
  var calendar = document.getElementById("calendar-main")
  var scroller = calendar && calendar.querySelector("[data-calendar-week-scroll]")
  var grid = scroller && scroller.querySelector("[data-calendar-week-grid]")
  cancelCalendarWeekZoom(scroller)
  var fromAxis = grid && grid._calendarWeekAxis
  var animate = fromAxis && scroller.clientHeight > 0 &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  var fromTop = scroller ? scroller.scrollTop : 0
  var frames = []
  if (animate) {
    grid.querySelectorAll("[data-calendar-week-timeline], [data-calendar-week-hour], [data-calendar-week-hour-label], [data-calendar-week-event]").forEach(function (element) {
      if (element.hasAttribute("data-calendar-week-event") && !_calendarSourceIsVisible(element)) return
      var properties = element.hasAttribute("data-calendar-week-event") ? ["top", "height", "left", "width"] : ["height"]
      frames.push({ element: element, properties: properties })
    })
    frames.push({ element: grid, properties: ["height"] })
    frames.forEach(function (frame) {
      var computed = window.getComputedStyle(frame.element)
      frame.from = frame.properties.map(function (property) { return parseFloat(computed[property]) })
    })
  }
  _calendarWeekZoom = zoom
  initializeCalendarViewport()
  if (!animate) return
  var toAxis = grid._calendarWeekAxis
  var toTop = scroller.scrollTop
  frames.forEach(function (frame) {
    var computed = window.getComputedStyle(frame.element)
    frame.to = frame.properties.map(function (property) { return parseFloat(computed[property]) })
    frame.styles = frame.properties.map(function (property) { return frame.element.style[property] })
  })
  var animation = { frame: null, started: null }
  scroller._calendarZoomAnimation = animation
  function render(progress) {
    function mix(from, to) { return from + (to - from) * progress }
    frames.forEach(function (frame) {
      frame.properties.forEach(function (property, index) {
        frame.element.style[property] = progress === 1 ? frame.styles[index] : mix(frame.from[index], frame.to[index]) + "px"
      })
    })
    // A second zoom starts from the visible axis, not the previous destination.
    grid._calendarWeekAxis = progress === 1 ? toAxis : {
      height: mix(fromAxis.height, toAxis.height),
      heights: fromAxis.heights.map(function (height, hour) { return mix(height, toAxis.heights[hour]) }),
      offsets: fromAxis.offsets.map(function (offset, hour) { return mix(offset, toAxis.offsets[hour]) }),
      expanded: toAxis.expanded,
      zoom: toAxis.zoom,
    }
    scroller.scrollTop = mix(fromTop, toTop)
  }
  function step(now) {
    if (scroller._calendarZoomAnimation !== animation) return
    if (!scroller.isConnected) { cancelCalendarWeekZoom(scroller); return }
    if (animation.started === null) animation.started = now
    var progress = Math.min(1, (now - animation.started) / 220)
    render(1 - Math.pow(1 - progress, 3))
    if (progress === 1) scroller._calendarZoomAnimation = null
    else animation.frame = requestAnimationFrame(step)
  }
  // Restore the starting geometry before the browser paints the new layout.
  render(0)
  animation.frame = requestAnimationFrame(step)
}

function captureCalendarPills(calendar) {
  var pills = new Map(), counts = new Map()
  var bounds = calendar.getBoundingClientRect()
  calendar.querySelectorAll("[data-calendar-month-event], [data-calendar-week-all-day], [data-calendar-week-event]").forEach(function (node) {
    if (node.dataset.calendarPillExit) return
    var kind = node.dataset.calendarMonthEvent !== undefined ? "month" : node.dataset.calendarWeekAllDay !== undefined ? "all-day" : "timed"
    var id = node.dataset.calendarMonthEvent || node.dataset.calendarWeekAllDay || node.dataset.calendarWeekEvent
    var base = JSON.stringify([kind, node.dataset.calendarSourceId, id])
    var index = counts.get(base) || 0
    counts.set(base, index + 1) // Count hidden segments too, keeping multi-day keys stable.
    if (node.hidden || node.style.display === "none" || !node.getClientRects().length) return
    var rect = node.getBoundingClientRect()
    var style = window.getComputedStyle(node)
    var scroll = node.closest("[data-calendar-week-scroll], [data-calendar-all-day-row]")
    var clip = scroll && scroll.getBoundingClientRect()
    var inset = clip ? [Math.max(0, clip.top - rect.top), Math.max(0, rect.right - clip.right),
      Math.max(0, rect.bottom - clip.bottom), Math.max(0, clip.left - rect.left)] : [0, 0, 0, 0]
    pills.set(base + ":" + index, { node: node, top: rect.top - bounds.top, left: rect.left - bounds.left,
      width: rect.width, height: rect.height, opacity: style.opacity, dayPadding: style.getPropertyValue("--calendar-day-padding"),
      clipPath: inset.some(function (value) { return value > 0 }) ? "inset(" + inset.map(function (value) { return value + "px" }).join(" ") + ")" : "none" })
  })
  return { calendar: calendar, period: calendar.dataset.calendarPeriod, view: calendar.dataset.calendarView, pills: pills }
}

function rememberCalendarPillGeometry(calendar) {
  if (!calendar || !_calendarPillSnapshot || _calendarPillSnapshot.calendar !== calendar) return
  var current = captureCalendarPills(calendar)
  // Preserve entries already hidden by another layout pass until reconciliation.
  current.pills.forEach(function (pill, key) {
    if (_calendarPillSnapshot.pills.has(key)) _calendarPillSnapshot.pills.set(key, pill)
  })
}

function finishCalendarPillFade(key) {
  var fade = _calendarPillFades.get(key)
  if (!fade) return
  _calendarPillFades.delete(key)
  fade.animation.cancel()
  if (fade.ghost) fade.node.remove()
}

function clearCalendarPillFades() {
  Array.from(_calendarPillFades.keys()).forEach(finishCalendarPillFade)
}

function fadeCalendarPill(key, node, from, to, ghost) {
  var fade = { node: node, ghost: ghost, animation: node.animate([{ opacity: from }, { opacity: to }], {
    duration: 300, easing: "ease", fill: "both", // Same easing as tabs, with a gentler pill fade.
  }) }
  _calendarPillFades.set(key, fade)
  fade.animation.onfinish = function () {
    if (_calendarPillFades.get(key) === fade) finishCalendarPillFade(key)
  }
}

function animateCalendarPills(calendar) {
  if (!calendar || calendar.hasAttribute("data-calendar-loading")) {
    clearCalendarPillFades()
    _calendarPillSnapshot = null
    return
  }
  var current = captureCalendarPills(calendar), previous = _calendarPillSnapshot
  var samePeriod = previous && previous.period === current.period && previous.view === current.view
  _calendarPillSnapshot = current
  if (!samePeriod) clearCalendarPillFades()
  if ((window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) || !calendar.animate) {
    clearCalendarPillFades()
    return
  }
  // A cache refresh can replace the calendar during an exit fade. Keep its
  // inert copy on the current root until the same animation finishes.
  if (samePeriod) _calendarPillFades.forEach(function (fade) {
    if (fade.ghost && fade.node.parentElement !== calendar) calendar.appendChild(fade.node)
  })
  if (samePeriod) previous.pills.forEach(function (pill, key) {
    if (current.pills.has(key)) return
    var fade = _calendarPillFades.get(key)
    var opacity = fade ? window.getComputedStyle(fade.node).opacity || pill.opacity : pill.opacity
    finishCalendarPillFade(key)
    var ghost = pill.node.cloneNode(true)
    // Keep visual data attributes for theme/RSVP styles, but no IDs or HTMX
    // actions. The exit copy never participates in layout or user interaction.
    ;[ghost].concat(Array.from(ghost.querySelectorAll("*"))).forEach(function (node) {
      Array.from(node.attributes).forEach(function (attr) {
        if (attr.name === "id" || /^(?:data-)?hx-/.test(attr.name) || /^on/i.test(attr.name)) node.removeAttribute(attr.name)
      })
    })
    ghost.removeAttribute("data-calendar-event-hover")
    ghost.dataset.calendarPillExit = "true"
    ghost.hidden = false
    ghost.inert = true
    ghost.setAttribute("aria-hidden", "true")
    Object.assign(ghost.style, { position: "absolute", display: "flex", pointerEvents: "none", margin: "0",
      top: pill.top + "px", left: pill.left + "px", width: pill.width + "px", height: pill.height + "px", zIndex: "30", clipPath: pill.clipPath })
    ghost.style.setProperty("--calendar-day-padding", pill.dayPadding)
    calendar.appendChild(ghost)
    fadeCalendarPill(key, ghost, opacity, 0, true)
  })
  current.pills.forEach(function (pill, key) {
    var before = samePeriod && previous.pills.get(key)
    var fade = _calendarPillFades.get(key)
    if (before && (!fade || fade.node === pill.node)) return
    var opacity = fade ? window.getComputedStyle(fade.node).opacity || (before ? before.opacity : 0) : before ? before.opacity : 0
    finishCalendarPillFade(key)
    fadeCalendarPill(key, pill.node, opacity, pill.opacity, false)
  })
}

function initializeCalendarViewport() {
  var calendar = document.getElementById("calendar-main")
  rememberCalendarPillGeometry(calendar)
  var pane = calendar && calendar.closest("#mail-list")
  if (_calendarViewportPane !== pane) {
    if (_calendarViewportObserver) _calendarViewportObserver.disconnect()
    _calendarViewportPane = pane
    if (pane && window.ResizeObserver) {
      _calendarViewportObserver = new ResizeObserver(function () {
        if (_calendarLayoutFrame) cancelAnimationFrame(_calendarLayoutFrame)
        _calendarLayoutFrame = requestAnimationFrame(function () {
          _calendarLayoutFrame = null
          initializeCalendarViewport()
        })
      })
      _calendarViewportObserver.observe(pane)
      var scroller = pane.querySelector("[data-calendar-week-scroll]")
      if (scroller) _calendarViewportObserver.observe(scroller)
    }
  }
  if (!calendar) { animateCalendarPills(null); return }
  layoutCalendarMonth(calendar)
  initializeCalendarWeekScroll()
  animateCalendarPills(calendar)
}

function _calendarSourceIsVisible(node) {
  var state = _calendarVisibility.get(node.dataset.calendarSourceId)
  return state ? state.visible : node.dataset.calendarSourceHidden !== "true"
}

function _calendarAgendaEventMatchesDay(event, day) {
  if (event.calendarEventAllDay === "true") {
    return !!event.calendarEventStartDate && !!event.calendarEventEndDate &&
      event.calendarEventStartDate <= day.calendarDay && event.calendarEventEndDate > day.calendarDay
  }
  var start = Date.parse(event.calendarEventStart)
  var end = Date.parse(event.calendarEventEnd)
  var dayStart = Date.parse(day.calendarDayStart)
  var dayEnd = Date.parse(day.calendarDayEnd)
  return start < dayEnd && (end > dayStart || (start === end && start >= dayStart))
}

function _calendarAgendaEventIsUpcoming(event, today) {
  if (event.calendarEventAllDay === "true") {
    return !event.calendarEventEndDate || event.calendarEventEndDate > today
  }
  var end = Date.parse(event.calendarEventEnd)
  return isNaN(end) || end >= Date.parse("2026-10-07T09:00:00+02:00")
}

function initializeCalendarVisibility() {
  document.querySelectorAll("[data-calendar-visibility]").forEach(function (input) {
    var state = _calendarVisibility.get(input.dataset.calendarVisibility)
    input.checked = _calendarSourceIsVisible(input)
    input.setAttribute("aria-busy", state && state.saving ? "true" : "false")
    var row = input.closest("[data-calendar-source-row]")
    var label = row && row.querySelector("[data-calendar-source-name]")
    if (label) label.classList.toggle("opacity-50", !input.checked)
    var status = row && row.querySelector("[data-calendar-visibility-status]")
    if (status) status.style.opacity = state && state.saving ? "1" : "0"
    var sync = row && row.querySelector("[data-calendar-source-sync]")
    if (sync) sync.style.visibility = state && state.saving ? "hidden" : ""
  })
  document.querySelectorAll("#calendar-main [data-calendar-week-all-day], #calendar-main [data-calendar-week-event]").forEach(function (node) {
    if (node.dataset.calendarPillExit) return
    node.hidden = !_calendarSourceIsVisible(node)
  })
}

function setCalendarViewSwitch(view) {
  var group = document.querySelector("[data-calendar-view-nav]")
  if (!group) return
  group.querySelectorAll("[data-calendar-view-switch]").forEach(function (link) {
    var active = link.dataset.calendarViewSwitch === view
    link.classList.toggle("text-foreground", active)
    link.classList.toggle("text-muted-foreground", !active)
    link.classList.toggle("hover:text-foreground", !active)
    link.setAttribute("aria-current", active ? "page" : "false")
  })
  var indicator = group.querySelector("[data-calendar-view-indicator]")
  if (indicator) indicator.style.transform = view === "week" ? "translateX(calc(100% + 2px))" : "translateX(0)"
}

function initializeCalendarDaySelection() {
  rememberCalendarPillGeometry(document.getElementById("calendar-main"))
  initializeCalendarVisibility()
  var calendar = document.getElementById("calendar-main")
  var agenda = document.querySelector("[data-calendar-agenda]")
  if (!calendar || !agenda) {
    _calendarSelectedDay = null
    _calendarViewSwitchRequest = null
    return
  }
  if (calendar.hasAttribute("data-calendar-loading")) return
  setCalendarViewSwitch(_calendarViewSwitchRequest ? _calendarViewSwitchRequest.goferCalendarViewSwitch : calendar.dataset.calendarView)
  if (_calendarSelectedDay && _calendarSelectedDay.period !== calendar.dataset.calendarPeriod) _calendarSelectedDay = null
  var selected = _calendarSelectedDay && calendar.querySelector('[data-calendar-day="' + _calendarSelectedDay.date + '"]')
  if (!selected) _calendarSelectedDay = null
  calendar.querySelectorAll("[data-calendar-day]").forEach(function (day) {
    day.setAttribute("data-calendar-day-selected", day === selected ? "true" : "false")
    day.querySelectorAll("[data-calendar-select-day]").forEach(function (button) {
      button.setAttribute("aria-pressed", day === selected ? "true" : "false")
    })
  })
  var visible = 0
  agenda.querySelectorAll("[data-calendar-agenda-event]").forEach(function (event) {
    var show = _calendarSourceIsVisible(event) && (selected ? _calendarAgendaEventMatchesDay(event.dataset, selected.dataset) :
      _calendarAgendaEventIsUpcoming(event.dataset, calendar.dataset.calendarTodayDate))
    event.hidden = !show
    if (show) visible++
  })
  agenda.querySelector("#calendar-agenda-heading").textContent = selected ? selected.dataset.calendarDayTitle : "Upcoming"
  agenda.querySelector("[data-calendar-agenda-context]").textContent = selected ?
    visible + (visible === 1 ? " event" : " events") : calendar.dataset.calendarMonthLabel
  agenda.querySelector("[data-calendar-agenda-clear]").hidden = !selected
  agenda.querySelector("#calendar-agenda-list").hidden = visible === 0
  agenda.querySelector("[data-calendar-agenda-empty]").hidden = visible !== 0
  var sources = Array.from(document.querySelectorAll("[data-calendar-visibility]"))
  var allHidden = sources.length > 0 && sources.every(function (input) { return !_calendarSourceIsVisible(input) })
  agenda.querySelector("[data-calendar-agenda-empty-title]").textContent = allHidden ? "All calendars are hidden" : selected ? "No events for this day" : "No upcoming events"
  agenda.querySelector("[data-calendar-agenda-empty-detail]").textContent = allHidden ?
    "Show a calendar in the sidebar to see its events. Hidden calendars continue syncing." : selected ?
    "Choose another date to browse your cached calendar events." :
    "Events from Google, Microsoft, or CalDAV will appear here after your selected calendars are synchronized."
  agenda.querySelector("[data-calendar-agenda-providers]").hidden = !!selected || allHidden
  // Switch views around the selected date rather than an unrelated week.
  var focusDate = selected ? selected.dataset.calendarDay : calendar.dataset.calendarDate
  calendar.querySelectorAll("[data-calendar-view-switch]").forEach(function (link) {
    var url = link.dataset.calendarViewSwitch === "week" ?
      "/calendar?date=" + encodeURIComponent(focusDate) + "&view=week" : "/calendar?month=" + focusDate.slice(0, 7)
    if (link.getAttribute("data-demo-hx-get") === url) return
    link.setAttribute("href", url)
    link.setAttribute("data-demo-hx-get", url)
    link.setAttribute("data-demo-hx-push-url", url)
    if (window.htmx) window.htmx.process(link)
  })
  // Desktop keeps the two panes; small screens use the agenda as the day view.
  var mainPane = calendar.closest("#mail-list")
  mainPane.classList.toggle("hidden", !!selected)
  mainPane.classList.toggle("flex", !selected)
  agenda.classList.toggle("hidden", !selected)
  agenda.classList.toggle("flex", !!selected)
  initializeCalendarViewport()
}
