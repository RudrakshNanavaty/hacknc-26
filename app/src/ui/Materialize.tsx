// A surface that arrives as a material: it scales up from its trigger while the glass blur grows
// in, and leaves the same way. Under reduced motion it only cross-fades.
//
// The element animated is the glass element itself (a `filter` on a wrapper would make it the
// backdrop root and the glass inside would stop blurring the scene).
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

export interface MaterializeProps {
  show: boolean;
  /** CSS transform-origin: where the surface comes from (its trigger). */
  origin?: string;
  className?: string;
  /** Change this to animate a swap of content (a new toast). */
  id?: string;
  role?: string;
  'aria-label'?: string;
  children: ReactNode;
}

const HIDDEN = { opacity: 0, scale: 0.96, '--glass-blur': '0px' } as const;
const SHOWN = { opacity: 1, scale: 1, '--glass-blur': '18px' } as const;

export function Materialize({ show, origin = 'top right', className, id = 'surface', children, ...rest }: MaterializeProps) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key={id}
          className={className}
          style={{ transformOrigin: origin }}
          initial={reduce ? { opacity: 0 } : HIDDEN}
          animate={reduce ? { opacity: 1 } : SHOWN}
          exit={reduce ? { opacity: 0 } : HIDDEN}
          transition={reduce ? { duration: 0.15 } : { type: 'spring', bounce: 0, duration: 0.35 }}
          {...rest}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
