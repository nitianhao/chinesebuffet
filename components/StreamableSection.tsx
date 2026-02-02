/**
 * Async Server Component that yields before rendering.
 * Wraps heavy below-the-fold content so it streams after the shell.
 * Use with <Suspense fallback={...}> for progressive rendering.
 */
export default async function StreamableSection({
  children,
}: {
  children: React.ReactNode;
}) {
  await Promise.resolve();
  return <>{children}</>;
}
