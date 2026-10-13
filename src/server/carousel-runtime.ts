/** Progressive enhancement: slides remain scrollable and readable without JavaScript. */
export const CAROUSEL_BOOT_SCRIPT = `<script>
(function mvBootCarousels() {
  document.querySelectorAll('.mv-carousel').forEach(function(carousel) {
    var track = carousel.querySelector('.mv-carousel-track');
    var controls = carousel.querySelector('.mv-carousel-controls');
    var prev = controls.querySelector('[data-carousel-prev]');
    var next = controls.querySelector('[data-carousel-next]');
    var status = controls.querySelector('[data-carousel-status]');
    var items = Array.prototype.slice.call(track.children);
    if (!items.length) return;
    items.forEach(function(item, i) {
      item.setAttribute('role', 'group');
      item.setAttribute('aria-roledescription', 'slide');
      item.setAttribute('aria-label', (i + 1) + ' of ' + items.length);
    });
    var index = 0;
    function update() {
      var left = track.getBoundingClientRect().left;
      var distance = Infinity;
      items.forEach(function(item, i) {
        var current = Math.abs(item.getBoundingClientRect().left - left);
        if (current < distance) { distance = current; index = i; }
      });
      prev.disabled = track.scrollLeft <= 1;
      next.disabled = Math.ceil(track.scrollLeft + track.clientWidth) >= track.scrollWidth - 1;
      controls.hidden = track.scrollWidth <= track.clientWidth + 1;
      status.textContent = (index + 1) + ' / ' + items.length;
      track.setAttribute('data-carousel-index', String(index));
    }
    function go(target) {
      var item = items[Math.max(0, Math.min(items.length - 1, target))];
      var left = track.scrollLeft + item.getBoundingClientRect().left - track.getBoundingClientRect().left;
      var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      track.scrollTo({ left: left, behavior: reduced ? 'auto' : 'smooth' });
    }
    prev.addEventListener('click', function() { go(index - 1); });
    next.addEventListener('click', function() { go(index + 1); });
    track.addEventListener('scroll', update, { passive: true });
    track.addEventListener('keydown', function(event) {
      if (event.target !== track) return;
      var target;
      if (event.key === 'ArrowLeft') target = index - 1;
      else if (event.key === 'ArrowRight') target = index + 1;
      else if (event.key === 'Home') target = 0;
      else if (event.key === 'End') target = items.length - 1;
      else return;
      event.preventDefault();
      go(target);
    });
    window.addEventListener('resize', update);
    update();
  });
})();
</script>`;
