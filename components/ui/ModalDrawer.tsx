'use client';

import React, { useEffect } from 'react';

interface ModalDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  side?: 'right' | 'top';
}

export default function ModalDrawer({ isOpen, onClose, title, children, side = 'right' }: ModalDrawerProps) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const panelClasses =
    side === 'right'
      ? 'right-0 top-0 h-full w-[85%] max-w-sm rounded-l-2xl'
      : 'left-0 right-0 top-0 w-full max-h-[90vh] rounded-b-2xl';

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`absolute ${panelClasses} overflow-y-auto border border-[var(--border)] bg-[var(--surface)]/95 p-5 shadow-xl backdrop-blur-xl`}
      >
        {children}
      </div>
    </div>
  );
}
