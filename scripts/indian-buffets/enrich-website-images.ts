import fs from 'fs';
import path from 'path';

interface DraftBundle {
  candidateKey: string;
  buffet: Record<string, unknown>;
  structuredDataDrafts: unknown[];
}

interface ExtractedImage {
  photoReference: string;
  sourceUrl: string;
  alt?: string;
  widthPx?: number;
  heightPx?: number;
  category: string;
  provenance: 'official_website';
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function normalizeImageUrl(rawUrl: string, pageUrl: string): string | null {
  try {
    const url = new URL(rawUrl, pageUrl);
    url.hash = '';
    if (!/^https?:$/.test(url.protocol)) return null;
    const lower = url.toString().toLowerCase();
    if (lower.endsWith('.svg') || lower.includes('favicon') || lower.includes('logo')) return null;
    if (lower.includes('pixel') || lower.includes('tracking') || lower.includes('analytics')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function inferCategory(url: string, alt?: string): string {
  const text = `${url} ${alt || ''}`.toLowerCase();
  if (/\b(menu|dish|food|curry|biryani|tandoor|thali|naan|masala)\b/.test(text)) return 'food';
  if (/\b(interior|dining|room|restaurant)\b/.test(text)) return 'interior';
  if (/\b(exterior|front|storefront)\b/.test(text)) return 'exterior';
  if (/\b(catering|party|event)\b/.test(text)) return 'catering';
  return 'unknown';
}

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*["']([^"']*)["']/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(tag)) !== null) {
    attrs[match[1].toLowerCase()] = match[2];
  }
  return attrs;
}

function firstSrcsetUrl(srcset: string | undefined): string | undefined {
  if (!srcset) return undefined;
  return srcset.split(',')[0]?.trim().split(/\s+/)[0];
}

function extractImagesFromHtml(html: string, pageUrl: string): ExtractedImage[] {
  const images: ExtractedImage[] = [];
  const addImage = (rawUrl: string | undefined, alt?: string, width?: string, height?: string) => {
    if (!rawUrl) return;
    const url = normalizeImageUrl(rawUrl, pageUrl);
    if (!url) return;
    images.push({
      photoReference: url,
      sourceUrl: pageUrl,
      alt,
      widthPx: width ? Number.parseInt(width, 10) || undefined : undefined,
      heightPx: height ? Number.parseInt(height, 10) || undefined : undefined,
      category: inferCategory(url, alt),
      provenance: 'official_website',
    });
  };

  const metaPattern = /<meta\b[^>]*>/gi;
  let metaMatch: RegExpExecArray | null;
  while ((metaMatch = metaPattern.exec(html)) !== null) {
    const attrs = parseAttributes(metaMatch[0]);
    const key = attrs.property || attrs.name;
    if (key && /^(og:image|twitter:image|twitter:image:src)$/i.test(key)) {
      addImage(attrs.content, key);
    }
  }

  const imgPattern = /<img\b[^>]*>/gi;
  let imgMatch: RegExpExecArray | null;
  while ((imgMatch = imgPattern.exec(html)) !== null) {
    const attrs = parseAttributes(imgMatch[0]);
    addImage(attrs.src || attrs['data-src'] || firstSrcsetUrl(attrs.srcset || attrs['data-srcset']), attrs.alt, attrs.width, attrs.height);
  }

  const jsonLdPattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let jsonMatch: RegExpExecArray | null;
  while ((jsonMatch = jsonLdPattern.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        const image = node?.image;
        if (typeof image === 'string') addImage(image, 'json-ld image');
        if (Array.isArray(image)) image.forEach((item) => typeof item === 'string' ? addImage(item, 'json-ld image') : addImage(item?.url, item?.caption));
        if (image && typeof image === 'object') addImage(image.url, image.caption);
      }
    } catch {
      // Ignore malformed JSON-LD.
    }
  }

  return images;
}

async function fetchPageImages(pageUrl: string, timeoutMs: number): Promise<ExtractedImage[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(pageUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'BuffetLocator image enrichment dry-run' },
      redirect: 'follow',
    });
    if (!response.ok) return [];
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return [];
    const html = await response.text();
    return extractImagesFromHtml(html, response.url || pageUrl);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function getCandidateUrls(bundle: DraftBundle, maxPages: number): string[] {
  const urls = new Set<string>();
  if (typeof bundle.buffet.website === 'string') urls.add(bundle.buffet.website);
  if (typeof bundle.buffet.webResults === 'string') {
    try {
      for (const item of JSON.parse(bundle.buffet.webResults)) {
        if (item?.source === 'official_website' && typeof item.url === 'string') urls.add(item.url);
      }
    } catch {
      // Ignore malformed webResults.
    }
  }
  return Array.from(urls)
    .filter((url) => !/facebook|instagram|twitter|x\.com|grubhub|doordash|ubereats|seamless/i.test(url))
    .slice(0, maxPages);
}

async function main(): Promise<void> {
  const inputPath = process.env.INDIAN_BUFFET_IMAGE_INPUT || 'data/indian-buffets/nyc-pilot-poi-enriched-buffet-drafts.json';
  const outputPath = process.env.INDIAN_BUFFET_IMAGE_OUTPUT || 'data/indian-buffets/nyc-pilot-image-enriched-buffet-drafts.json';
  const maxCandidates = Number.parseInt(process.env.INDIAN_BUFFET_IMAGE_MAX_CANDIDATES || '50', 10);
  const maxPagesPerCandidate = Number.parseInt(process.env.INDIAN_BUFFET_IMAGE_MAX_PAGES_PER_CANDIDATE || '3', 10);
  const maxImagesPerCandidate = Number.parseInt(process.env.INDIAN_BUFFET_IMAGE_MAX_IMAGES_PER_CANDIDATE || '12', 10);
  const timeoutMs = Number.parseInt(process.env.INDIAN_BUFFET_IMAGE_TIMEOUT_MS || '8000', 10);

  const bundles = readJson<DraftBundle[]>(inputPath);
  let requests = 0;
  let candidatesWithImages = 0;

  for (const bundle of bundles.slice(0, maxCandidates)) {
    const urls = getCandidateUrls(bundle, maxPagesPerCandidate);
    const imagesByUrl = new Map<string, ExtractedImage>();
    for (const url of urls) {
      requests += 1;
      const images = await fetchPageImages(url, timeoutMs);
      for (const image of images) {
        if (!imagesByUrl.has(image.photoReference)) imagesByUrl.set(image.photoReference, image);
      }
    }
    const images = Array.from(imagesByUrl.values()).slice(0, maxImagesPerCandidate);
    if (images.length) {
      candidatesWithImages += 1;
      bundle.buffet.images = JSON.stringify(images);
      bundle.buffet.imagesCount = images.length;
      bundle.buffet.imageCategories = JSON.stringify(Array.from(new Set(images.map((image) => image.category))));
    }
  }

  writeJson(outputPath, bundles);
  console.log(JSON.stringify({
    event: 'website_image_enrichment_finish',
    inputPath,
    outputPath,
    candidates: bundles.length,
    requests,
    candidatesWithImages,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
