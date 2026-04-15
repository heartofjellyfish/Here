"use client";

import { useState } from "react";

type Props = {
  onTap: () => void;
  disabled?: boolean;
};

export default function TapButton({ onTap, disabled }: Props) {
  const [pressed, setPressed] = useState(false);

  function handleClick() {
    if (disabled || pressed) return;
    setPressed(true);
    onTap();
  }

  return (
    <button
      type="button"
      dir="ltr"
      className={`tap${pressed ? " tap--pressed" : ""}`}
      onClick={handleClick}
      disabled={disabled}
      aria-label="+1"
    >
      <span className="tap__glyph">+1</span>
      <span className="tap__ripple" aria-hidden="true" />
    </button>
  );
}
