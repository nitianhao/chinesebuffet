import dynamic from 'next/dynamic';

// Dynamically import SEO-related components to create separate bundle
const ModifierVariants = dynamic(() => import('@/components/ModifierVariants'), { ssr: false });

interface SEOContentBundleProps {
  buffet: any;
}

/**
 * SEOContentBundle Component
 * 
 * Separate bundle for SEO-enrichment content.
 * Includes:
 * - ModifierVariants (search modifier content)
 * 
 * Note: AnswerEngineQA (Common Questions) has been moved to the FAQs section.
 * 
 * Loads components dynamically to create isolated chunk.
 * These components are for SEO purposes and don't need to block LCP.
 */
export default function SEOContentBundle({ buffet }: SEOContentBundleProps) {
  return (
    <>
      {/* Modifier Variants - Structured Data for Search Engines */}
      <ModifierVariants buffet={buffet} />
    </>
  );
}
