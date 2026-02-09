/**
 * Server-only JSON-LD script renderer.
 * Use in server components only. Do NOT use in "use client" components.
 */

export function JsonLdServer({ data }: { data: any }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
