/**
 * Server-only JSON-LD script renderer.
 * Renders a single <script type="application/ld+json"> from a plain object.
 * No client component, no useEffect — safe for SSR and static export.
 */

interface JsonLdProps {
  /** Schema object (will be JSON.stringify'd). */
  data: object;
}

export default function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
