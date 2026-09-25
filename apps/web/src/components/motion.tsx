"use client";

import { animate, motion, MotionConfig, useInView, useReducedMotion, type Variants } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Boîte à outils d'animation BEILE (Motion / Framer Motion).
 * Principe : le mouvement guide l'œil (d'où vient l'information, ce qui a changé) ; il n'est jamais décoratif.
 * La préférence système « réduire les animations » est respectée partout (MotionConfig reducedMotion="user").
 */

export const EASE = [0.22, 1, 0.36, 1] as const;

export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user" transition={{ duration: 0.35, ease: EASE }}>{children}</MotionConfig>;
}

/** Entrée de page : fondu, légère montée et netteté progressive. */
export function EntreePage({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none", transform: "none" } }} transition={{ duration: 0.42, ease: EASE }}>
      {children}
    </motion.div>
  );
}

const conteneur: Variants = { cache: {}, visible: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } } };
const element: Variants = {
  cache: { opacity: 0, y: 14, scale: 0.985 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: EASE } },
};

/** Cascade : les enfants `Element` apparaissent l'un après l'autre. */
export function Cascade({ children, className }: { children: ReactNode; className?: string }) {
  return <motion.div className={className} variants={conteneur} initial="cache" animate="visible">{children}</motion.div>;
}

export function Element({ children, className }: { children: ReactNode; className?: string }) {
  return <motion.div className={className ?? "h-full [&>*]:h-full"} variants={element}>{children}</motion.div>;
}

/** Compteur : le chiffre défile jusqu'à sa valeur quand il entre à l'écran, puis suit ses changements. */
export function Compteur({ valeur, format, duree = 1.1 }: { valeur: number; format: (n: number) => string; duree?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const visible = useInView(ref, { once: true, margin: "-40px" });
  const reduit = useReducedMotion();
  const [affiche, setAffiche] = useState(0);
  const precedent = useRef(0);
  useEffect(() => {
    if (!visible || reduit) return;
    const controles = animate(precedent.current, valeur, {
      duration: precedent.current === 0 ? duree : 0.6,
      ease: EASE,
      onUpdate: (v) => setAffiche(v),
    });
    precedent.current = valeur;
    return () => controles.stop();
  }, [valeur, visible, reduit, duree]);
  return <span ref={ref} className="tabular">{format(reduit ? valeur : affiche)}</span>;
}

/** Indicateur coulissant : l'élément actif d'une navigation glisse d'un item à l'autre. */
export function IndicateurActif({ id, className, style }: { id: string; className?: string; style?: React.CSSProperties }) {
  return <motion.span layoutId={id} className={className} style={style} transition={{ type: "spring", stiffness: 420, damping: 36 }} aria-hidden />;
}

export { AnimatePresence, motion } from "motion/react";
