document.addEventListener("DOMContentLoaded", function () {
  var virtualMailList = null

  initVirtualScroll()
  setupFolderClickInterception()
  setupEmailSelectionTracking()
  setupSSE()

  function setupSSE() {
    if (window.location.pathname === "/settings") return

    var source = new EventSource("/api/events")

    source.addEventListener("new-mail", function (e) {
      var data
      try { data = JSON.parse(e.data) } catch (_) { return }
      if (!data || !data.folder_id) return

      refreshSidebarUnread()
      if (virtualMailList && virtualMailList.folderID === data.folder_id) {
        virtualMailList.onNewEmail()
      }
    })

    source.onerror = function () {
      source.close()
      setTimeout(setupSSE, 5000)
    }
  }

  function refreshSidebarUnread() {
    fetch("/api/folders/unread").then(function (r) { return r.json() }).then(function (counts) {
      var badges = document.querySelectorAll("[data-folder-unread]")
      for (var i = 0; i < badges.length; i++) {
        var badge = badges[i]
        var id = badge.dataset.folderUnread
        if (counts[id] !== undefined) {
          var n = counts[id]
          badge.textContent = String(n)
          badge.style.display = n > 0 ? "" : "none"
        }
      }
      for (var id in counts) {
        if (counts[id] > 0) {
          var existing = document.querySelector('[data-folder-unread="' + id + '"]')
          if (!existing) {
            var link = document.querySelector('aside a[hx-get="/folder/' + id + '"]')
            if (link) {
              var span = link.querySelector("span.truncate")
              if (span) {
                var badge = document.createElement("span")
                badge.dataset.folderUnread = id
                badge.className = "min-w-5 h-5 px-1.5 flex items-center justify-center rounded-full text-[11px] font-semibold tabular-nums bg-sidebar-accent text-sidebar-foreground/80"
                badge.textContent = String(counts[id])
                link.insertBefore(badge, link.firstChild.nextSibling ? link.firstChild.nextSibling : null)
              }
            }
          }
        }
      }
    }).catch(function () {})
  }

  function initVirtualScroll() {
    var container = document.getElementById("mail-list-scroll")
    if (!container) return

    var folderID = container.dataset.folderId || "inbox"
    virtualMailList = new VirtualMailList(container, { folderID: folderID })
    virtualMailList.hydrateFromDOM()
  }

  function setupFolderClickInterception() {
    var sidebar = document.querySelector("aside")
    if (!sidebar) return

    sidebar.addEventListener("click", function (e) {
      var link = e.target.closest('a[hx-get^="/folder/"]')
      if (!link) return
      if (!virtualMailList) return

      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()

      var folderID = link.getAttribute("hx-get").replace("/folder/", "")

      var sidebarLinks = sidebar.querySelectorAll("a[hx-get^='/folder/']")
      for (var i = 0; i < sidebarLinks.length; i++) {
        sidebarLinks[i].classList.remove(
          "bg-sidebar-accent",
          "text-sidebar-primary",
          "font-medium"
        )
        sidebarLinks[i].classList.add("text-sidebar-foreground")
      }
      link.classList.add(
        "bg-sidebar-accent",
        "text-sidebar-primary",
        "font-medium"
      )
      link.classList.remove("text-sidebar-foreground")

      virtualMailList.switchFolder(folderID)
    })
  }

  function setupEmailSelectionTracking() {
    document.body.addEventListener("htmx:afterRequest", function (evt) {
      if (!virtualMailList) return

      if (
        evt.detail.pathInfo &&
        evt.detail.pathInfo.requestPath &&
        evt.detail.pathInfo.requestPath.startsWith("/email/")
      ) {
        var emailId = evt.detail.pathInfo.requestPath.replace("/email/", "")
        virtualMailList.onEmailSelected(emailId)
      }
    })
  }
})
