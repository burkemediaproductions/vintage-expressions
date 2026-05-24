const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function revealVisible() {
  document.querySelectorAll('.reveal, .reveal-on-load').forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.88) el.classList.add('is-visible');
  });
}

function tryPlayVideo(video) {
  if (!video || prefersReducedMotion) return;

  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');

  const playPromise = video.play();

  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(() => {
      // iOS Safari may block one attempt and allow a later gesture/visibility retry.
    });
  }
}

function prepareAutoplayVideos() {
  const videos = document.querySelectorAll('video[autoplay]');

  videos.forEach((video) => {
    tryPlayVideo(video);

    video.addEventListener('loadedmetadata', () => tryPlayVideo(video), { once: true });
    video.addEventListener('canplay', () => tryPlayVideo(video), { once: true });
  });

  const retryAllVideos = () => {
    videos.forEach((video) => tryPlayVideo(video));
  };

  window.addEventListener('load', retryAllVideos, { once: true });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) retryAllVideos();
  });

  ['touchstart', 'click', 'scroll'].forEach((eventName) => {
    window.addEventListener(eventName, retryAllVideos, { once: true, passive: true });
  });

  window.setTimeout(retryAllVideos, 600);
}

window.addEventListener('DOMContentLoaded', () => {
  revealVisible();

  if (!prefersReducedMotion) {
    window.addEventListener('scroll', revealVisible, { passive: true });
  } else {
    document.querySelectorAll('.reveal, .reveal-on-load').forEach((el) => el.classList.add('is-visible'));
  }

  prepareAutoplayVideos();
});
