import type { SourceCandidate, SourceContext } from '../types';

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

function buildIndianRestaurantQuery(bbox: string): string {
  return `
    [out:json][timeout:25];
    (
      node["amenity"="restaurant"]["cuisine"~"indian",i](${bbox});
      way["amenity"="restaurant"]["cuisine"~"indian",i](${bbox});
      relation["amenity"="restaurant"]["cuisine"~"indian",i](${bbox});
      node["amenity"="restaurant"]["name"~"Indian|Tandoor|Tandoori|Curry|Biryani|Masala|Buffet",i](${bbox});
      way["amenity"="restaurant"]["name"~"Indian|Tandoor|Tandoori|Curry|Biryani|Masala|Buffet",i](${bbox});
      relation["amenity"="restaurant"]["name"~"Indian|Tandoor|Tandoori|Curry|Biryani|Masala|Buffet",i](${bbox});
    );
    out center;
  `;
}

export async function discoverOverpassCandidates(context: SourceContext): Promise<SourceCandidate[]> {
  const bbox = context.config.overpassBbox;
  if (!bbox) {
    context.log('warn', 'overpass_skipped', { reason: 'INDIAN_BUFFET_BBOX is not set' });
    return [];
  }

  if (context.config.limits.maxExternalRequestsPerRun < 1 || context.config.limits.maxOverpassRequestsPerRun < 1) {
    context.log('warn', 'overpass_skipped', { reason: 'request limit is 0' });
    return [];
  }

  const response = await fetch(context.config.overpassEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'BuffetLocator Indian buffet discovery dry-run',
    },
    body: new URLSearchParams({ data: buildIndianRestaurantQuery(bbox) }),
  });

  if (!response.ok) {
    throw new Error(`Overpass request failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as OverpassResponse;
  const candidates = (data.elements || []).map((element): SourceCandidate => {
    const tags = element.tags || {};
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;

    return {
      source: 'overpass',
      sourceId: `osm:${element.type}:${element.id}`,
      name: tags.name || 'Unnamed Indian restaurant',
      street: [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
      cityName: tags['addr:city'],
      state: tags['addr:state'],
      stateAbbr: tags['addr:state'],
      postalCode: tags['addr:postcode'],
      address: [tags['addr:housenumber'], tags['addr:street'], tags['addr:city'], tags['addr:state'], tags['addr:postcode']]
        .filter(Boolean)
        .join(', '),
      phone: tags.phone || tags['contact:phone'],
      website: tags.website || tags['contact:website'],
      lat,
      lng,
      categories: [tags.amenity, tags.cuisine].filter((value): value is string => Boolean(value)),
      rawTags: tags,
      discoveredAt: new Date().toISOString(),
    };
  });

  context.log('info', 'overpass_candidates_loaded', { count: candidates.length, bbox });
  return candidates;
}
