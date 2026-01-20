import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getBuffetNameBySlug } from '@/lib/data-instantdb';
import Accessibility from '@/components/Accessibility';
import Amenities from '@/components/Amenities';
import Atmosphere from '@/components/Atmosphere';
import FoodOptions from '@/components/FoodOptions';
import Parking from '@/components/Parking';
import Payment from '@/components/Payment';
import ServiceOptionsSection from '@/components/ServiceOptionsSection';
import FoodAndDrink from '@/components/FoodAndDrink';
import Highlights from '@/components/Highlights';
import Planning from '@/components/Planning';

interface BuffetPageProps {
  params: {
    'city-state': string;
    slug: string;
  };
}

export async function generateMetadata({ params }: BuffetPageProps): Promise<Metadata> {
  const buffet = await getBuffetNameBySlug(params['city-state'], params.slug);
  
  if (!buffet) {
    return {
      title: 'Buffet Not Found',
    };
  }

  return {
    title: buffet.name,
    description: buffet.name,
  };
}

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatTime(time: string): string {
  if (!time) return '';
  const clean = time.replace(':', '');
  if (clean.length !== 4) return time;
  const hours = parseInt(clean.slice(0, 2), 10);
  const minutes = clean.slice(2);
  const period = hours >= 12 ? 'PM' : 'AM';
  const normalizedHours = hours % 12 || 12;
  return `${normalizedHours}:${minutes} ${period}`;
}

function formatHoursList(raw: any): Array<{ day: string; ranges: string }> {
  if (!raw) return [];

  if (Array.isArray(raw) && raw.length > 0 && raw[0]?.day && raw[0]?.hours) {
    return raw
      .map((item: any) => ({
        day: String(item.day),
        ranges: String(item.hours),
      }))
      .filter((item: any) => item.day && item.ranges);
  }

  if (Array.isArray(raw) && raw.length > 0 && Array.isArray(raw[0]?.open)) {
    const byDay: Record<string, string[]> = {};
    raw[0].open.forEach((entry: any) => {
      const dayIndex = Number(entry.day);
      const day = dayNames[dayIndex] || String(entry.day);
      const start = formatTime(String(entry.start || ''));
      const end = formatTime(String(entry.end || ''));
      if (!byDay[day]) byDay[day] = [];
      if (start && end) {
        byDay[day].push(`${start} - ${end}`);
      }
    });
    return Object.entries(byDay).map(([day, ranges]) => ({
      day,
      ranges: ranges.join(', '),
    }));
  }

  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return Object.entries(raw)
      .filter(([, value]) => typeof value === 'string')
      .map(([day, ranges]) => ({
        day,
        ranges: String(ranges),
      }));
  }

  return [];
}

function summarizePopularTimes(raw: any): string | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    return `Popular times available (${raw.length} day${raw.length === 1 ? '' : 's'})`;
  }
  if (typeof raw === 'object') {
    const days = Object.keys(raw).length;
    return `Popular times available (${days} day${days === 1 ? '' : 's'})`;
  }
  return 'Popular times available';
}

function normalizePopularTimes(raw: any): Array<{ day: string; entries: Array<{ hour: number; occupancyPercent: number }> }> {
  if (!raw || typeof raw !== 'object') return [];

  const dayOrder = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const dayLabels: Record<string, string> = {
    Su: 'Sun',
    Mo: 'Mon',
    Tu: 'Tue',
    We: 'Wed',
    Th: 'Thu',
    Fr: 'Fri',
    Sa: 'Sat',
  };

  return dayOrder
    .map((day) => ({
      day: dayLabels[day] || day,
      entries: Array.isArray(raw[day]) ? raw[day] : [],
    }))
    .filter((item) => item.entries.length > 0);
}

export default async function BuffetPage({ params }: BuffetPageProps) {
  const buffet = await getBuffetNameBySlug(params['city-state'], params.slug);

  if (!buffet) {
    notFound();
  }

  const regularHours = formatHoursList(buffet.hours?.hours);
  const secondaryHours = formatHoursList(buffet.hours?.secondaryOpeningHours);
  const popularTimesSummary = summarizePopularTimes(buffet.hours?.popularTimesHistogram);
  const popularTimes = normalizePopularTimes(buffet.hours?.popularTimesHistogram);

  // Parse orderBy - array of {name, orderUrl} objects
  const orderByItems: Array<{ name: string; url?: string }> = [];
  
  if (buffet.contactInfo?.orderBy) {
    const extractUrl = (item: any): string | undefined => {
      return item.orderUrl || item.url || item.link || item.href;
    };
    
    if (typeof buffet.contactInfo.orderBy === 'string') {
      try {
        const parsed = JSON.parse(buffet.contactInfo.orderBy);
        if (Array.isArray(parsed)) {
          orderByItems.push(...parsed.map((item: any) => ({
            name: item.name || item.title || item.service || '',
            url: extractUrl(item)
          })).filter((item: any) => item.name));
        } else if (typeof parsed === 'object' && parsed !== null) {
          orderByItems.push(...Object.entries(parsed).map(([key, value]: [string, any]) => ({
            name: key,
            url: typeof value === 'string' && value.startsWith('http') ? value : extractUrl(value)
          })).filter((item: any) => item.name));
        }
      } catch {
        orderByItems.push({ name: buffet.contactInfo.orderBy });
      }
    } else if (Array.isArray(buffet.contactInfo.orderBy)) {
      orderByItems.push(...buffet.contactInfo.orderBy.map((item: any) => ({
        name: item.name || item.title || item.service || '',
        url: extractUrl(item)
      })).filter((item: any) => item.name));
    } else if (typeof buffet.contactInfo.orderBy === 'object' && buffet.contactInfo.orderBy !== null) {
      orderByItems.push(...Object.entries(buffet.contactInfo.orderBy).map(([key, value]: [string, any]) => ({
        name: key,
        url: typeof value === 'string' && value.startsWith('http') ? value : extractUrl(value)
      })).filter((item: any) => item.name));
    }
  }
  
  const validOrderByItems = orderByItems.filter(item => item.name && item.name.trim() !== '');

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-4">{buffet.name}</h1>
      {buffet.categories && buffet.categories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {buffet.categories.map((category: string, index: number) => (
            <span
              key={index}
              className="px-3 py-1 bg-gray-200 text-gray-700 rounded-full text-sm"
            >
              {category}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        {buffet.address && (
          <div className="text-gray-700">
            {buffet.address}
          </div>
        )}
        {buffet.rating && (
          <div className="flex items-center gap-1">
            <svg className="w-5 h-5 text-yellow-400 fill-current" viewBox="0 0 20 20">
              <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
            </svg>
            <span className="text-gray-900 font-semibold">{buffet.rating.toFixed(1)}</span>
          </div>
        )}
        {buffet.price && (
          <div className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
            {buffet.price}
          </div>
        )}
      </div>
      {buffet.description && (
        <div className="text-gray-700 mb-4">
          {buffet.description}
        </div>
      )}
      {(buffet.images && buffet.images.length > 0) || buffet.imageCount > 0 ? (
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-2xl font-bold">Photos</h2>
            {buffet.imageCount > 0 && (
              <span className="text-sm text-gray-600">({buffet.imageCount} photos)</span>
            )}
          </div>
          {buffet.imageCategories && buffet.imageCategories.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {buffet.imageCategories.map((category: string, index: number) => (
                <span
                  key={index}
                  className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs"
                >
                  {category}
                </span>
              ))}
            </div>
          )}
          {buffet.images && buffet.images.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {buffet.images.map((imageUrl: string, index: number) => (
                <img
                  key={index}
                  src={imageUrl}
                  alt={`${buffet.name} image ${index + 1}`}
                  className="w-full h-48 object-cover rounded-lg"
                />
              ))}
            </div>
          ) : (
            <div className="text-gray-500 text-sm">
              Images available but not loaded
            </div>
          )}
        </div>
      ) : null}
      {buffet.hours && (
        <div className="mb-4">
          <h2 className="text-2xl font-bold mb-3">Opening Hours</h2>
          <div className="space-y-4">
            {regularHours.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Regular Hours</h3>
                <div className="space-y-1 text-gray-700">
                  {regularHours.map((item) => (
                    <div key={item.day} className="flex gap-3">
                      <div className="w-16 font-medium">{item.day}</div>
                      <div>{item.ranges}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {popularTimesSummary && (
              <div>
                <h3 className="font-semibold mb-2">Popular Times</h3>
                {popularTimes.length > 0 ? (
                  <div className="space-y-3">
                    {popularTimes.map((day) => (
                      <div key={day.day}>
                        <div className="text-sm font-medium text-gray-700 mb-1">{day.day}</div>
                        <div className="flex items-end gap-1 h-12">
                          {day.entries.map((entry, idx) => (
                            <div
                              key={`${day.day}-${idx}`}
                              className="w-2 bg-blue-500 rounded-sm"
                              style={{ height: `${Math.max(2, Math.min(100, entry.occupancyPercent))}%` }}
                              title={`${entry.hour}:00 - ${entry.occupancyPercent}%`}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-gray-700">{popularTimesSummary}</div>
                )}
              </div>
            )}
            {secondaryHours.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Secondary Hours</h3>
                <div className="space-y-1 text-gray-700">
                  {secondaryHours.map((item) => (
                    <div key={item.day} className="flex gap-3">
                      <div className="w-16 font-medium">{item.day}</div>
                      <div>{item.ranges}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {buffet.contactInfo && (buffet.contactInfo.phone || buffet.contactInfo.menuUrl || buffet.contactInfo.orderBy) && (
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-4">Contact Information</h2>
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {buffet.contactInfo.phone && (
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-gray-500 mb-1">Phone</div>
                    <a 
                      href={`tel:${buffet.contactInfo.phone}`} 
                      className="text-lg font-medium text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {buffet.contactInfo.phone}
                    </a>
                  </div>
                </div>
              )}
              {buffet.contactInfo.menuUrl && (
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-gray-500 mb-1">Menu</div>
                    <a 
                      href={typeof buffet.contactInfo.menuUrl === 'string' ? buffet.contactInfo.menuUrl : '#'} 
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-lg font-medium text-green-600 hover:text-green-800 hover:underline inline-flex items-center gap-1"
                    >
                      View Menu
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                </div>
              )}
              {validOrderByItems.length > 0 && (
                <div className="md:col-span-2">
                  <div className="text-sm text-gray-500 mb-3">Order Online</div>
                  <div className="flex flex-wrap gap-2">
                    {validOrderByItems.map((item, index) => {
                      // Ensure URL is a string and valid
                      const urlString = typeof item.url === 'string' ? item.url : '';
                      const isValidUrl = urlString && (urlString.startsWith('http://') || urlString.startsWith('https://'));
                      
                      return isValidUrl ? (
                        <a
                          key={index}
                          href={urlString}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium text-sm cursor-pointer"
                        >
                          {item.name}
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      ) : (
                        <span
                          key={index}
                          className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium text-sm"
                        >
                          {item.name}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Accessibility Section */}
      {buffet.accessibility && (Array.isArray(buffet.accessibility) ? buffet.accessibility.length > 0 : Object.keys(buffet.accessibility).length > 0) && (
        <Accessibility data={buffet.accessibility} />
      )}
      
      {/* Amenities Section */}
      {buffet.amenities && typeof buffet.amenities === 'object' && (
        <Amenities data={buffet.amenities} />
      )}

      {/* Atmosphere Section */}
      {buffet.amenities && buffet.amenities.atmosphere && (
        <Atmosphere data={buffet.amenities.atmosphere} />
      )}

      {/* Food Options Section */}
      {buffet.amenities && buffet.amenities['food options'] && (
        <FoodOptions data={buffet.amenities['food options']} />
      )}

      {/* Parking Section */}
      {buffet.amenities && buffet.amenities.parking && (
        <Parking data={buffet.amenities.parking} />
      )}

      {/* Payment Section */}
      {buffet.amenities && buffet.amenities.payments && (
        <Payment data={buffet.amenities.payments} />
      )}

      {/* Service Options Section */}
      {buffet.amenities && buffet.amenities['service options'] && (
        <ServiceOptionsSection data={buffet.amenities['service options']} />
      )}

      {/* Food & Drink Section */}
      {buffet.amenities && buffet.amenities['food and drink'] && (
        <FoodAndDrink data={buffet.amenities['food and drink']} />
      )}

      {/* Highlights Section */}
      {buffet.amenities && buffet.amenities.highlights && (
        <Highlights data={buffet.amenities.highlights} />
      )}

      {/* Planning Section */}
      {buffet.amenities && buffet.amenities.planning && (
        <Planning data={buffet.amenities.planning} />
      )}
      
      {/* Reviews Section */}
      {(buffet.reviewsCount || buffet.reviewsDistribution || buffet.reviewsTags || (buffet.reviews && buffet.reviews.length > 0)) && (
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-4">
            Reviews {buffet.reviewsCount ? `(${buffet.reviewsCount})` : buffet.reviews?.length ? `(${buffet.reviews.length})` : ''}
          </h2>
          
          {/* Reviews Distribution */}
          {buffet.reviewsDistribution && (
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm mb-6">
              <h3 className="text-lg font-semibold mb-4">Rating Distribution</h3>
              <div className="space-y-2">
                {[5, 4, 3, 2, 1].map((stars) => {
                  const starNames: { [key: number]: string } = { 5: 'fiveStar', 4: 'fourStar', 3: 'threeStar', 2: 'twoStar', 1: 'oneStar' };
                  const count = buffet.reviewsDistribution?.[starNames[stars]] || 
                                buffet.reviewsDistribution?.[stars] || 
                                buffet.reviewsDistribution?.[String(stars)] || 0;
                  const total = Object.values(buffet.reviewsDistribution || {}).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
                  const percentage = total > 0 ? (count / total) * 100 : 0;
                  return (
                    <div key={stars} className="flex items-center gap-3">
                      <div className="flex items-center gap-1 w-16">
                        <span className="text-sm font-medium">{stars}</span>
                        <svg className="w-4 h-4 text-yellow-400 fill-current" viewBox="0 0 20 20">
                          <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                        </svg>
                      </div>
                      <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-yellow-400 rounded-full transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <div className="w-12 text-sm text-gray-600 text-right">{count}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* Reviews Tags */}
          {buffet.reviewsTags && buffet.reviewsTags.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">What People Say</h3>
              <div className="flex flex-wrap gap-2">
                {buffet.reviewsTags.map((tag: any, index: number) => (
                  <span
                    key={index}
                    className="px-3 py-1.5 bg-blue-100 text-blue-800 rounded-full text-sm flex items-center gap-1"
                  >
                    {tag.title || tag}
                    {tag.count && (
                      <span className="text-xs text-blue-600 bg-blue-200 rounded-full px-1.5 py-0.5 ml-1">
                        {tag.count}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {/* Individual Reviews */}
          {buffet.reviews && buffet.reviews.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Recent Reviews</h3>
              {buffet.reviews.map((review: any, index: number) => (
                <div key={review.reviewId || index} className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {review.reviewerPhotoUrl && (
                        <img
                          src={review.reviewerPhotoUrl}
                          alt={review.name || 'Reviewer'}
                          className="w-10 h-10 rounded-full"
                        />
                      )}
                      <div>
                        <div className="font-semibold text-gray-900">{review.name || review.author || 'Anonymous'}</div>
                        {review.reviewerNumberOfReviews && (
                          <div className="text-sm text-gray-500">{review.reviewerNumberOfReviews} reviews</div>
                        )}
                        {review.isLocalGuide && (
                          <div className="text-xs text-blue-600 font-medium">Local Guide</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center">
                        {[...Array(5)].map((_, i) => (
                          <svg
                            key={i}
                            className={`w-5 h-5 ${i < (review.stars || review.rating || 0) ? 'text-yellow-400 fill-current' : 'text-gray-300'}`}
                            viewBox="0 0 20 20"
                          >
                            <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                          </svg>
                        ))}
                      </div>
                      {(review.rating || review.stars) && (
                        <span className="text-gray-700 font-medium">
                          {review.rating || review.stars}
                        </span>
                      )}
                    </div>
                  </div>
                  {review.text && (
                    <p className="text-gray-700 mb-3">{review.text}</p>
                  )}
                  {review.textTranslated && review.textTranslated !== review.text && (
                    <p className="text-gray-500 text-sm italic mb-3">{review.textTranslated}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                    {review.publishAt && (
                      <span>{new Date(review.publishAt).toLocaleDateString()}</span>
                    )}
                    {review.relativeTime && (
                      <span>{review.relativeTime}</span>
                    )}
                    {review.visitedIn && (
                      <span>Visited in {review.visitedIn}</span>
                    )}
                    {review.likesCount && review.likesCount > 0 && (
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                        </svg>
                        {review.likesCount}
                      </span>
                    )}
                  </div>
                  {review.responseFromOwnerText && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="text-sm font-semibold text-gray-700 mb-1">Owner Response</div>
                      <p className="text-gray-600 text-sm">{review.responseFromOwnerText}</p>
                      {review.responseFromOwnerDate && (
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(review.responseFromOwnerDate).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  )}
                  {review.reviewImageUrls && Array.isArray(review.reviewImageUrls) && review.reviewImageUrls.length > 0 && (
                    <div className="mt-4 flex gap-2 overflow-x-auto">
                      {review.reviewImageUrls.map((imgUrl: string, imgIndex: number) => (
                        <img
                          key={imgIndex}
                          src={imgUrl}
                          alt={`Review image ${imgIndex + 1}`}
                          className="w-20 h-20 object-cover rounded"
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* Related Buffets Section */}
      {buffet.webResults && buffet.webResults.length > 0 && (
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-4">Related Buffets</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {buffet.webResults.map((result: any, index: number) => (
              <a
                key={index}
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow hover:border-blue-300"
              >
                <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">{result.title}</h3>
                {result.description && (
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">{result.description}</p>
                )}
                {result.displayedUrl && (
                  <div className="flex items-center gap-1 text-xs text-blue-600 mt-auto">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    <span className="truncate">{result.displayedUrl.replace(/https?:\/\//, '').split('/')[0]}</span>
                  </div>
                )}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
