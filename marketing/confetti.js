/**
 * One burst of confetti on visit — brand palette, no deps.
 * Skips when the visitor prefers reduced motion.
 */
(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const COLORS = ["#c45c26", "#9a3f12", "#14110f", "#f3efe6", "#e4ddd0", "#d4a574"];
  const COUNT = 120;
  const DURATION_MS = 3200;

  const canvas = document.createElement("canvas");
  canvas.className = "confetti-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let w = 0;
  let h = 0;
  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize, { passive: true });

  const pieces = Array.from({ length: COUNT }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 9;
    return {
      x: w * 0.5 + (Math.random() - 0.5) * w * 0.25,
      y: h * 0.15 + Math.random() * h * 0.1,
      vx: Math.cos(angle) * speed * (0.4 + Math.random()),
      vy: Math.sin(angle) * speed - 6 - Math.random() * 6,
      w: 5 + Math.random() * 7,
      h: 7 + Math.random() * 10,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.35,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      gravity: 0.12 + Math.random() * 0.08,
      drag: 0.985,
      opacity: 1,
    };
  });

  const start = performance.now();

  function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, w, h);

    for (const p of pieces) {
      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.opacity = Math.max(0, 1 - t / DURATION_MS);

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }

    if (t < DURATION_MS) {
      requestAnimationFrame(frame);
    } else {
      canvas.remove();
      window.removeEventListener("resize", resize);
    }
  }

  requestAnimationFrame(frame);
})();
