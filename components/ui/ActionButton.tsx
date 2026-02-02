import React from 'react';

interface ActionButtonProps {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  className?: string;
  icon?: React.ReactNode;
  target?: string;
  rel?: string;
  external?: boolean;
}

/**
 * ActionButton - Primary red gradient / Secondary warm glass
 */
export default function ActionButton({
  children,
  href,
  onClick,
  variant = 'primary',
  className = '',
  icon,
  target,
  rel,
  external = false,
}: ActionButtonProps) {
  // Auto-set target and rel for external links
  const linkTarget = target || (external ? '_blank' : undefined);
  const linkRel = rel || (external ? 'noopener noreferrer' : undefined);
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all active:translate-y-px';
  const variants = {
    primary:
      'bg-gradient-to-r from-[#C1121F] to-[#7F0A12] text-white shadow-[var(--shadow-pop)] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[#C1121F]',
    secondary:
      'bg-[var(--surface)] backdrop-blur text-[var(--text)] ring-1 ring-[var(--border-strong)] shadow-[var(--shadow-soft)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[#C1121F]',
  };

  const classes = `${base} ${variants[variant]} ${className}`;

  if (href) {
    return (
      <a href={href} className={classes} target={linkTarget} rel={linkRel}>
        {icon}
        {children}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} className={classes}>
      {icon}
      {children}
    </button>
  );
}
