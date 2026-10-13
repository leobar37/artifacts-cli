/** Navigation is native links; this only marks the current page and adds ordered step links. */
export const PAGES_BOOT_SCRIPT = `<script>
(function mvBootPages() {
  document.querySelectorAll('.mv-pages').forEach(function(nav) {
    var links = Array.prototype.slice.call(nav.querySelectorAll('.mv-pages-items a'));
    var current = -1;
    links.forEach(function(link, index) {
      var target = new URL(link.getAttribute('href'), document.baseURI);
      var theme = new URLSearchParams(location.search).get('theme');
      if (theme === 'light' || theme === 'dark') {
        target.searchParams.set('theme', theme);
        link.href = target.href;
      }
      if (target.origin === location.origin && target.pathname === location.pathname) {
        link.setAttribute('aria-current', 'page');
        current = index;
      }
    });
    if (current < 0 || links.length < 2) return;
    var steps = nav.querySelector('.mv-pages-steps');
    if (current > 0) {
      var prev = document.createElement('a');
      prev.href = links[current - 1].getAttribute('href');
      prev.textContent = '← Previous page';
      prev.setAttribute('rel', 'prev');
      steps.appendChild(prev);
    }
    var status = document.createElement('span');
    status.textContent = 'Page ' + (current + 1) + ' of ' + links.length;
    steps.appendChild(status);
    if (current < links.length - 1) {
      var next = document.createElement('a');
      next.href = links[current + 1].getAttribute('href');
      next.textContent = 'Next page →';
      next.setAttribute('rel', 'next');
      steps.appendChild(next);
    }
    steps.hidden = false;
  });
})();
</script>`;
