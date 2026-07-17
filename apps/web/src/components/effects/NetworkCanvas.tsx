'use client';

import { useEffect, useRef } from 'react';

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
  pulsePhase: number;
}

const NODE_COUNT = 34;
const CONNECTION_DISTANCE = 210;
const MOUSE_REPEL_RADIUS = 150;
const MOUSE_REPEL_FORCE = 0.8;
const PALETTE = {
  node: '255, 153, 85',
  line: '255, 122, 46',
  nodeAlpha: 0.92,
  lineAlpha: 0.22,
} as const;

function createNode(width: number, height: number): Node {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
    radius: Math.random() * 1.5 + 0.5,
    opacity: Math.random() * 0.35 + 0.18,
    pulsePhase: Math.random() * Math.PI * 2,
  };
}

export function NetworkCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const frameRef = useRef(0);
  const reducedMotionRef = useRef(false);
  const visibleRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasElement: HTMLCanvasElement = canvas;
    const canvasContext = canvasElement.getContext('2d');
    if (!canvasContext) return;
    const ctx: CanvasRenderingContext2D = canvasContext;

    let destroyed = false;
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionRef.current = motionQuery.matches;
    visibleRef.current = document.visibilityState === 'visible';

    function stop() {
      if (frameRef.current === 0) return;
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    }

    function drawFrame(advance: boolean) {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const mouse = mouseRef.current;
      const palette = PALETTE;
      const nodes = nodesRef.current;

      ctx.clearRect(0, 0, width, height);
      if (advance) {
        for (const node of nodes) {
          node.vx += (Math.random() - 0.5) * 0.02;
          node.vy += (Math.random() - 0.5) * 0.02;
          node.vx *= 0.99;
          node.vy *= 0.99;

          const dx = node.x - mouse.x;
          const dy = node.y - mouse.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < MOUSE_REPEL_RADIUS && distance > 0) {
            const force = (1 - distance / MOUSE_REPEL_RADIUS) * MOUSE_REPEL_FORCE;
            node.vx += (dx / distance) * force;
            node.vy += (dy / distance) * force;
          }

          node.x += node.vx;
          node.y += node.vy;
          if (node.x < -50) node.x = width + 50;
          if (node.x > width + 50) node.x = -50;
          if (node.y < -50) node.y = height + 50;
          if (node.y > height + 50) node.y = -50;
          node.pulsePhase += 0.01;
        }
      }

      ctx.lineWidth = 0.65;
      for (let firstIndex = 0; firstIndex < nodes.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < nodes.length; secondIndex += 1) {
          const first = nodes[firstIndex];
          const second = nodes[secondIndex];
          const dx = first.x - second.x;
          const dy = first.y - second.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance >= CONNECTION_DISTANCE) continue;
          const alpha = (1 - distance / CONNECTION_DISTANCE) * palette.lineAlpha;
          ctx.strokeStyle = `rgba(${palette.line}, ${alpha})`;
          ctx.beginPath();
          ctx.moveTo(first.x, first.y);
          ctx.lineTo(second.x, second.y);
          ctx.stroke();
        }
      }

      for (const node of nodes) {
        const pulse = advance ? Math.sin(node.pulsePhase) * 0.15 + 0.85 : 1;
        const alpha = node.opacity * pulse * palette.nodeAlpha;
        ctx.fillStyle = `rgba(${palette.node}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(${palette.node}, ${alpha * 0.2})`;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius * 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawStatic() {
      if (!visibleRef.current) return;
      drawFrame(false);
    }

    function tick() {
      frameRef.current = 0;
      if (destroyed || !visibleRef.current || reducedMotionRef.current) return;
      drawFrame(true);
      start();
    }

    function start() {
      if (destroyed || frameRef.current !== 0 || !visibleRef.current || reducedMotionRef.current) {
        return;
      }
      frameRef.current = window.requestAnimationFrame(tick);
    }

    function resize() {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      canvasElement.width = Math.floor(width * dpr);
      canvasElement.height = Math.floor(height * dpr);
      ctx.scale(dpr, dpr);

      const existing = nodesRef.current;
      const needed = NODE_COUNT - existing.length;
      if (needed > 0) {
        nodesRef.current = [
          ...existing,
          ...Array.from({ length: needed }, () => createNode(width, height)),
        ];
      }
      for (const node of nodesRef.current) {
        if (node.x > width + 50) node.x = width - 50;
        if (node.y > height + 50) node.y = height - 50;
      }

      if (!visibleRef.current) return;
      if (reducedMotionRef.current) drawStatic();
      else start();
    }

    const handleMotionChange = (event: MediaQueryListEvent) => {
      reducedMotionRef.current = event.matches;
      if (event.matches) {
        stop();
        drawStatic();
      } else {
        start();
      }
    };
    const handleVisibility = () => {
      visibleRef.current = document.visibilityState === 'visible';
      if (!visibleRef.current) {
        stop();
      } else if (reducedMotionRef.current) {
        drawStatic();
      } else {
        start();
      }
    };
    const handleMouseMove = (event: MouseEvent) => {
      mouseRef.current = { x: event.clientX, y: event.clientY };
    };
    const handleMouseLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 };
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);
    motionQuery.addEventListener('change', handleMotionChange);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      destroyed = true;
      stop();
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      motionQuery.removeEventListener('change', handleMotionChange);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      aria-hidden="true"
    />
  );
}
