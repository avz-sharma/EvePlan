import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";

/** Adapted from the supplied Magic UI particles: one bounded canvas, no render per pointer move. */
export function Particles() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced || !canvas.current || typeof ResizeObserver === "undefined" || typeof IntersectionObserver === "undefined") return;
    const element = canvas.current;
    const ctx = element.getContext("2d");
    if (!ctx) return;
    let width = 0, height = 0, frame = 0, visible = true, previous = 0;
    const pointer = { x: 0, y: 0 };
    const dots = Array.from({ length: 65 }, () => ({ x: Math.random(), y: Math.random(), radius: .6 + Math.random() * 1.4, phase: Math.random() * Math.PI * 2 }));
    const resize = () => {
      const bounds = element.getBoundingClientRect(); width = bounds.width; height = bounds.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      element.width = width * ratio; element.height = height * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const draw = (time: number) => {
      frame = 0;
      if (!visible || document.hidden) return;
      if (time - previous > 32) {
        previous = time; ctx.clearRect(0, 0, width, height);
        dots.forEach((dot, i) => {
          ctx.beginPath(); ctx.arc(dot.x * width + Math.sin(time / 7000 + dot.phase) * 10 + pointer.x * 7, dot.y * height + Math.cos(time / 9000 + dot.phase) * 8 + pointer.y * 7, dot.radius, 0, Math.PI * 2);
          ctx.fillStyle = i % 4 === 0 ? "rgba(255,145,204,.65)" : "rgba(255,255,255,.35)"; ctx.fill();
        });
      }
      frame = requestAnimationFrame(draw);
    };
    const resume = () => { if (!frame && visible && !document.hidden) frame = requestAnimationFrame(draw); };
    const move = (e: PointerEvent) => { const b = element.getBoundingClientRect(); pointer.x = (e.clientX - b.left) / Math.max(width, 1) - .5; pointer.y = (e.clientY - b.top) / Math.max(height, 1) - .5; };
    const observer = new ResizeObserver(resize); observer.observe(element);
    const intersection = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; resume(); }); intersection.observe(element);
    document.addEventListener("visibilitychange", resume); window.addEventListener("pointermove", move, { passive: true });
    resize(); resume();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); intersection.disconnect(); document.removeEventListener("visibilitychange", resume); window.removeEventListener("pointermove", move); };
  }, [reduced]);
  return <canvas ref={canvas} aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 size-full" />;
}

export function SmoothCursor() {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => document.documentElement.classList.toggle("custom-cursor-active", visible && !media.matches && !reduced);
    sync();
    media.addEventListener?.("change", sync);
    return () => { media.removeEventListener?.("change", sync); document.documentElement.classList.remove("custom-cursor-active"); };
  }, [visible, reduced]);
  const x = useMotionValue(-100), y = useMotionValue(-100);
  const smoothX = useSpring(x, { stiffness: 420, damping: 35 }), smoothY = useSpring(y, { stiffness: 420, damping: 35 });
  useEffect(() => {
    if (reduced || !window.matchMedia("(pointer: fine)").matches) return;
    const move = (e: PointerEvent) => { if (e.pointerType === "touch") return; x.set(e.clientX); y.set(e.clientY); setVisible(true); };
    const hide = () => setVisible(false);
    window.addEventListener("pointermove", move, { passive: true }); document.addEventListener("pointerleave", hide); window.addEventListener("blur", hide);
    return () => { window.removeEventListener("pointermove", move); document.removeEventListener("pointerleave", hide); window.removeEventListener("blur", hide); };
  }, [reduced, x, y]);
  return <motion.div aria-hidden="true" className="cursor-halo" style={{ x: smoothX, y: smoothY, opacity: visible ? 1 : 0 }} />;
}
