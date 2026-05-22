const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function revealVisible() {
  document.querySelectorAll('.reveal, .reveal-on-load').forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.88) el.classList.add('is-visible');
  });
}

window.addEventListener('DOMContentLoaded', () => {
  revealVisible();

  if (!prefersReducedMotion) {
    window.addEventListener('scroll', revealVisible, { passive: true });
  } else {
    document.querySelectorAll('.reveal, .reveal-on-load').forEach((el) => el.classList.add('is-visible'));
  }

  document.querySelectorAll('video[autoplay]').forEach((video) => {
    video.muted = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  });
});
