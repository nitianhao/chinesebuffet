import DisclosureCard from '@/components/ui/DisclosureCard';
import NearbyHighlights from '@/components/NearbyHighlights';
import { hasNearbyHighlightsContent } from '@/lib/poiUtils';

interface POIBundleProps {
  buffet: any;
}

/**
 * POIBundle Component
 * 
 * Renders the Nearby Places section with SignatureCard wrapper.
 * Only renders if there's actual content to display.
 */
export default function POIBundle({ buffet }: POIBundleProps) {
  // Collect all POI data (matches schema field names exactly)
  const poiData = {
    accommodationLodging: buffet.accommodationLodging,
    agriculturalFarming: buffet.agriculturalFarming,
    artsCulture: buffet.artsCulture,
    communicationsTechnology: buffet.communicationsTechnology,
    educationLearning: buffet.educationLearning,
    financialServices: buffet.financialServices,
    foodDining: buffet.foodDining,
    governmentPublicServices: buffet.governmentPublicServices,
    healthcareMedicalServices: buffet.healthcareMedicalServices,
    homeImprovementGarden: buffet.homeImprovementGarden,
    industrialManufacturing: buffet.industrialManufacturing,
    miscellaneousServices: buffet.miscellaneousServices,
    personalCareBeauty: buffet.personalCareBeauty,
    petCareVeterinary: buffet.petCareVeterinary,
    professionalBusinessServices: buffet.professionalBusinessServices,
    recreationEntertainment: buffet.recreationEntertainment,
    religiousSpiritual: buffet.religiousSpiritual,
    repairMaintenance: buffet.repairMaintenance,
    retailShopping: buffet.retailShopping,
    socialCommunityServices: buffet.socialCommunityServices,
    sportsFitness: buffet.sportsFitness,
    transportationAutomotive: buffet.transportationAutomotive,
    travelTourismServices: buffet.travelTourismServices,
    utilitiesInfrastructure: buffet.utilitiesInfrastructure,
  };

  // Check if there's actual content that will be displayed
  const hasContent = hasNearbyHighlightsContent(poiData);

  if (!hasContent) return null;

  return (
    <section id="nearby-places" className="scroll-mt-24">
      <DisclosureCard
        title="Nearby Places"
        summary="Local services, shops, and points of interest"
        defaultOpen={false}
        icon={
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        }
        className="page-block-gap"
      >
        <NearbyHighlights {...poiData} />
      </DisclosureCard>
    </section>
  );
}
