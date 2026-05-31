import { useEffect, useState } from "react";

interface TypingAnimationProps {
  text: string;
  className?: string;
}

export function TypingAnimation({ text, className }: TypingAnimationProps) {
  const [displayed, setDisplayed] = useState(text);

  useEffect(() => {
    setDisplayed(text);
  }, [text]);

  return <span className={className}>{displayed}</span>;
}
