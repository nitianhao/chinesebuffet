import PageContainer from '@/components/ui/PageContainer';
import SectionCard from '@/components/ui/SectionCard';
import Chip from '@/components/ui/Chip';
import StatRow, { StatItem } from '@/components/ui/StatRow';
import Divider from '@/components/ui/Divider';

/**
 * Design System Test Page
 * 
 * This page demonstrates all the new UI primitives.
 * Visit: /design-test
 */
export default function DesignTestPage() {
  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Design System Test</h1>
        <p className="text-gray-600 mb-8">
          Testing the new UI primitives: SectionCard, Chip, StatRow, Divider
        </p>

        {/* Hero Example */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Hero Section Example</h2>
          <div className="mb-3">
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 mb-1">
              Golden Dragon Buffet
            </h1>
            <p className="text-base md:text-lg text-gray-600">
              San Francisco, CA
            </p>
          </div>

          {/* Compact Stats Row */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="flex items-center gap-1.5 text-sm">
              <svg className="w-5 h-5 text-yellow-400 fill-current" viewBox="0 0 20 20">
                <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
              </svg>
              <span className="font-semibold text-gray-900">4.5</span>
              <span className="text-gray-600">(234)</span>
            </div>
            <Chip variant="default" size="sm">$$</Chip>
            <Chip variant="success" size="sm">Open</Chip>
            <Chip variant="accent" size="sm">Chinese</Chip>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <button className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              Directions
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              Call
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              Website
            </button>
          </div>
        </div>

        <Divider className="my-8" />

        {/* Chip Examples */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Chip Component</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-2">Variants (size: md)</p>
              <div className="flex flex-wrap gap-2">
                <Chip variant="default">Default</Chip>
                <Chip variant="accent">Accent</Chip>
                <Chip variant="success">Success</Chip>
                <Chip variant="warning">Warning</Chip>
                <Chip variant="error">Error</Chip>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-2">Small size</p>
              <div className="flex flex-wrap gap-2">
                <Chip variant="default" size="sm">Default</Chip>
                <Chip variant="accent" size="sm">Accent</Chip>
                <Chip variant="success" size="sm">Success</Chip>
                <Chip variant="warning" size="sm">Warning</Chip>
                <Chip variant="error" size="sm">Error</Chip>
              </div>
            </div>
          </div>
        </div>

        <Divider className="my-8" />

        {/* SectionCard Examples */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">SectionCard Component</h2>
          
          <div className="space-y-4">
            <SectionCard title="Basic Card">
              <p className="text-gray-700">
                This is a basic section card with just a title and content.
              </p>
            </SectionCard>

            <SectionCard 
              title="Card with Description" 
              description="This card has both a title and a subtitle"
            >
              <p className="text-gray-700">
                Card content goes here. The design is minimal and clean.
              </p>
            </SectionCard>

            <SectionCard 
              title="Card with Action"
              action={
                <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                  View all
                </button>
              }
            >
              <p className="text-gray-700">
                This card has an action button in the header.
              </p>
            </SectionCard>
          </div>
        </div>

        <Divider className="my-8" />

        {/* StatRow Examples */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">StatRow Component</h2>
          
          <SectionCard title="Quick facts">
            <StatRow>
              <StatItem
                label="Address"
                value="123 Main Street, San Francisco, CA 94102"
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                }
              />
              <StatItem
                label="Phone"
                value="(555) 123-4567"
                href="tel:5551234567"
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                }
              />
              <StatItem
                label="Hours today"
                value="11:00 AM - 9:00 PM"
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />
              <StatItem
                label="Price range"
                value="$$"
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />
              <StatItem
                label="Rating"
                value="4.5 stars (234 reviews)"
                icon={
                  <svg className="w-4 h-4 text-yellow-400 fill-current" viewBox="0 0 20 20">
                    <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                  </svg>
                }
              />
            </StatRow>
          </SectionCard>
        </div>

        <Divider className="my-8" />

        {/* Divider Example */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Divider Component</h2>
          <p className="text-gray-700 mb-4">Horizontal divider (default):</p>
          <Divider />
          <p className="text-gray-700 mt-4 mb-4">Vertical divider:</p>
          <div className="flex items-center gap-4 h-12">
            <span>Left</span>
            <Divider orientation="vertical" className="h-full" />
            <span>Middle</span>
            <Divider orientation="vertical" className="h-full" />
            <span>Right</span>
          </div>
        </div>

        <Divider className="my-8" />

        {/* Typography Scale */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Typography Scale</h2>
          <div className="space-y-2">
            <div className="text-2xl md:text-3xl lg:text-4xl font-bold">H1: 22-26px → 28-32px</div>
            <div className="text-base md:text-lg font-semibold">Section Title: 16-18px</div>
            <div className="text-sm md:text-base">Body: 14-16px</div>
            <div className="text-sm text-gray-600">Muted: gray-500/600</div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
