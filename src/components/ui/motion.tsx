"use client";

import { motion, useInView, useReducedMotion, animate } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const ease = [0.22, 1, 0.36, 1] as const;

export function FadeIn({
  children,
  delay = 0,
  y = 12,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: Math.min(y, 8) }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay, ease }}
    >
      {children}
    </motion.div>
  );
}

export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.4, delay, ease }}
    >
      {children}
    </motion.div>
  );
}

export function Stagger({ children, className, gap = 0.035 }: { children: ReactNode; className?: string; gap?: number }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={{
        hidden: reduce ? { opacity: 1 } : { opacity: 0, y: 6 },
        show: { opacity: 1, y: 0, transition: { duration: 0.26, ease } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedBar({
  value,
  color,
  height = 8,
  className,
  delay = 0.1,
}: {
  value: number;
  color: string;
  height?: number;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  return (
    <div
      ref={ref}
      className={cn("w-full overflow-hidden rounded-full bg-[#f1f2f4]", className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: inView ? `${Math.max(0, Math.min(100, value))}%` : 0 }}
        transition={{ duration: 0.6, delay: Math.min(delay, 0.25), ease }}
      />
    </div>
  );
}

export function CountUp({ to, suffix = "", className }: { to: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, to, { duration: 0.7, ease, onUpdate: (v) => setValue(Math.round(v)) });
    return () => controls.stop();
  }, [inView, to]);
  return (
    <span ref={ref} className={className}>
      {value}
      {suffix}
    </span>
  );
}
