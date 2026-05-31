import { AnimatePresence, motion } from "framer-motion";
import type { ReactElement } from "react";
import React, { useEffect, useMemo, useState } from "react";

export function AnimatedListItem({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ scale: 0.97, opacity: 0, y: 4 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.97, opacity: 0, y: 4 }}
      transition={{ type: "spring", stiffness: 400, damping: 40, duration: 0.15 }}
      layout
    >
      {children}
    </motion.div>
  );
}

export interface AnimatedListProps {
  className?: string;
  children: React.ReactNode;
  delay?: number;
}

export function AnimatedList({ className, children, delay = 0 }: AnimatedListProps) {
  const [index, setIndex] = useState(0);
  const childrenArray = useMemo(
    () => React.Children.toArray(children) as ReactElement[],
    [children],
  );

  useEffect(() => {
    if (index < childrenArray.length) {
      const timeout = setTimeout(() => {
        setIndex((prev) => prev + 1);
      }, delay);
      return () => {
        clearTimeout(timeout);
      };
    }
  }, [index, delay, childrenArray.length]);

  const itemsToShow = useMemo(() => childrenArray.slice(0, index), [index, childrenArray]);

  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      <AnimatePresence>
        {itemsToShow.map((item) => (
          <AnimatedListItem key={item.key}>{item}</AnimatedListItem>
        ))}
      </AnimatePresence>
    </div>
  );
}
