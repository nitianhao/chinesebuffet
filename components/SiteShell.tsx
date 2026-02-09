import type { ReactNode, ElementType } from 'react';

type SiteShellProps = {
  children: ReactNode;
  className?: string;
};

type SiteShellSectionProps = {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  surface?: 'base' | 'surface' | 'surface2';
};

type SiteShellContainerProps = {
  children: ReactNode;
  className?: string;
  as?: ElementType;
};

const joinClasses = (...classes: Array<string | undefined>) =>
  classes.filter(Boolean).join(' ');

export const siteShellContainerClass =
  'mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8';

export const siteShellSectionClass =
  'py-10 sm:py-12';

const surfaceClassMap: Record<NonNullable<SiteShellSectionProps['surface']>, string> = {
  base: 'bg-[var(--bg)]',
  surface: 'bg-[var(--surface)]',
  surface2: 'bg-[var(--surface2)]',
};

export default function SiteShell({ children, className }: SiteShellProps) {
  return (
    <div className={joinClasses('min-h-screen bg-[var(--bg)] text-[var(--text)]', className)}>
      {children}
    </div>
  );
}

export function SiteShellSection({
  children,
  className,
  as: Component = 'section',
  surface = 'base',
}: SiteShellSectionProps) {
  return (
    <Component
      className={joinClasses(surfaceClassMap[surface], siteShellSectionClass, className)}
    >
      {children}
    </Component>
  );
}

export function SiteShellContainer({
  children,
  className,
  as: Component = 'div',
}: SiteShellContainerProps) {
  return (
    <Component className={joinClasses(siteShellContainerClass, className)}>
      {children}
    </Component>
  );
}
