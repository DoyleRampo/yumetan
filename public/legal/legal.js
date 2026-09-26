// Shows the section for ?lang= (ja / en); Korean and Chinese readers see the English text.
(function () {
  var wanted = new URLSearchParams(location.search).get("lang") || (navigator.language || "en").slice(0, 2);
  var lang = wanted === "ja" ? "ja" : "en";
  document.documentElement.lang = lang;
  document.querySelectorAll("section[data-lang]").forEach(function (s) {
    s.hidden = s.dataset.lang !== lang;
  });
  document.querySelectorAll(".lang a").forEach(function (a) {
    a.setAttribute("aria-current", a.dataset.lang === lang ? "true" : "false");
  });
})();
