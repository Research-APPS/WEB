
(function () {
  var sidebar = document.getElementById("sidebar");
  var toggle = document.getElementById("sidebar-toggle");
  var backdrop = document.getElementById("sidebar-backdrop");
  if (!sidebar || !toggle) return;

  var isMobile = function () {
    return window.matchMedia("(max-width: 860px)").matches;
  };

  function apply(collapsed) {
    sidebar.classList.toggle("collapsed", collapsed);
    sidebar.inert = collapsed;
    toggle.setAttribute("aria-expanded", String(!collapsed));
    document.body.classList.toggle("sidebar-open", !collapsed && isMobile());
  }

  var preferCollapsed =
    document.body.classList.contains("page-lab-focus") ||
    document.body.getAttribute("data-sidebar") === "collapsed";

  var saved = null;
  try {
    saved = localStorage.getItem("rm-sidebar-collapsed");
  } catch (e) {}

  if (isMobile()) {
    apply(true);
  } else if (preferCollapsed && saved === null) {
    apply(true);
  } else {
    apply(saved === "1");
  }

  toggle.addEventListener("click", function () {
    var collapsed = !sidebar.classList.contains("collapsed");
    apply(collapsed);
    if (!isMobile()) {
      try {
        localStorage.setItem("rm-sidebar-collapsed", collapsed ? "1" : "0");
      } catch (e) {}
    }
  });

  if (backdrop) {
    backdrop.addEventListener("click", function () {
      apply(true);
    });
  }
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !sidebar.classList.contains("collapsed")) {
      apply(true);
      toggle.focus();
    }
  });
  window.matchMedia("(max-width: 860px)").addEventListener("change", function () {
    apply(isMobile() || sidebar.classList.contains("collapsed"));
  });
})();
