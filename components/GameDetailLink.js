"use client";

import Link, { useLinkStatus } from "next/link";
import { createPortal } from "react-dom";
import GameLoadingOverlay from "./GameLoadingOverlay";

function PendingOverlay() {
  const { pending } = useLinkStatus();
  return pending ? createPortal(<GameLoadingOverlay />, document.body) : null;
}

export default function GameDetailLink({ href, className, children }) {
  return (
    <Link href={href} className={className} prefetch={false}>
      {children}
      <PendingOverlay />
    </Link>
  );
}
