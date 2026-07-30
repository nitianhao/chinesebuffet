import { BUFFET_TERMS, INDIAN_CUISINE_TERMS } from '../constants';
import type { CandidateEnrichment, SourceContext, StagedCandidate } from '../types';

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findTerms(text: string, terms: readonly string[]): string[] {
  const lower = text.toLowerCase();
  return terms.filter((term) => lower.includes(term));
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return undefined;
  return stripHtml(match[1]).slice(0, 160);
}

function collectSnippets(text: string, pattern: RegExp, limit = 3): string[] {
  const snippets: string[] = [];
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  for (const sentence of sentences) {
    if (pattern.test(sentence)) {
      snippets.push(sentence.slice(0, 280));
      if (snippets.length >= limit) break;
    }
  }

  return snippets;
}

function discoverRelevantLinks(html: string, currentUrl: string): string[] {
  const baseUrl = new URL(currentUrl);
  const links = new Set<string>();
  const hrefPattern = /href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = hrefPattern.exec(html)) !== null) {
    try {
      const url = new URL(match[1], baseUrl);
      if (url.hostname !== baseUrl.hostname) continue;
      if (!/(menu|buffet|lunch|dinner|catering|special)/i.test(url.pathname)) continue;
      url.hash = '';
      links.add(url.toString());
    } catch {
      // Ignore malformed links.
    }
  }

  return Array.from(links);
}

async function crawlWebsiteForEvidence(
  startUrl: string,
  context: SourceContext,
  canRequest: () => boolean,
  onRequest: () => void
): Promise<{
  evidence: string[];
  enrichment: CandidateEnrichment['website'];
}> {
  const seen = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];
  const evidence = new Set<string>();
  const enrichment: CandidateEnrichment['website'] = {
    crawledUrls: [],
    menuUrls: [],
    titles: [],
    hoursSnippets: [],
    menuSnippets: [],
    buffetSnippets: [],
    contactSnippets: [],
    failedUrls: [],
  };

  while (
    queue.length > 0 &&
    seen.size < context.config.limits.maxWebsitePagesPerDomain &&
    canRequest()
  ) {
    const next = queue.shift();
    if (!next || seen.has(next.url) || next.depth > context.config.limits.maxWebsiteCrawlDepth) continue;

    seen.add(next.url);
    onRequest();
    enrichment.crawledUrls.push(next.url);

    let response: Response;
    try {
      response = await fetch(next.url, {
        headers: { 'User-Agent': 'BuffetLocator Indian buffet discovery dry-run; contact site owner if needed' },
        redirect: 'follow',
      });
    } catch (error) {
      enrichment.failedUrls.push({
        url: next.url,
        reason: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    if (!response.ok) {
      enrichment.failedUrls.push({ url: next.url, reason: `${response.status} ${response.statusText}` });
      continue;
    }

    const html = await response.text();
    const title = extractTitle(html);
    if (title) enrichment.titles.push(title);

    const text = stripHtml(html).slice(0, 20000);
    enrichment.hoursSnippets.push(...collectSnippets(text, /\b(hours?|open|monday|tuesday|wednesday|thursday|friday|saturday|sunday|lunch|dinner)\b/i));
    enrichment.menuSnippets.push(...collectSnippets(text, /\b(menu|order|special|catering|thali|biryani|tandoor|curry|masala)\b/i));
    enrichment.buffetSnippets.push(...collectSnippets(text, /\b(buffet|all you can eat|all-you-can-eat|ayce)\b/i));
    enrichment.contactSnippets.push(...collectSnippets(text, /\b(\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}|contact|reservation|reserve)\b/i));

    for (const term of findTerms(text, INDIAN_CUISINE_TERMS)) {
      evidence.add(`website_indian_term:${term}`);
    }
    for (const term of findTerms(text, BUFFET_TERMS)) {
      evidence.add(`website_buffet_term:${term}`);
    }

    if (next.depth < context.config.limits.maxWebsiteCrawlDepth) {
      for (const link of discoverRelevantLinks(html, next.url)) {
        if (/(menu|lunch|dinner|special|catering)/i.test(link)) {
          enrichment.menuUrls.push(link);
        }
        if (!seen.has(link)) queue.push({ url: link, depth: next.depth + 1 });
      }
    }

    if (queue.length > 0 && canRequest()) {
      await sleep(context.config.limits.requestDelayMsPerDomain);
    }
  }

  enrichment.menuUrls = Array.from(new Set(enrichment.menuUrls));
  enrichment.titles = Array.from(new Set(enrichment.titles));
  enrichment.hoursSnippets = Array.from(new Set(enrichment.hoursSnippets)).slice(0, 8);
  enrichment.menuSnippets = Array.from(new Set(enrichment.menuSnippets)).slice(0, 8);
  enrichment.buffetSnippets = Array.from(new Set(enrichment.buffetSnippets)).slice(0, 8);
  enrichment.contactSnippets = Array.from(new Set(enrichment.contactSnippets)).slice(0, 8);

  return {
    evidence: Array.from(evidence),
    enrichment,
  };
}

export async function enrichCandidatesFromWebsites(
  candidates: StagedCandidate[],
  context: SourceContext
): Promise<StagedCandidate[]> {
  let requestCount = 0;
  const maxWebsiteRequests = Math.min(
    context.config.limits.maxWebsiteRequestsPerRun,
    context.config.limits.maxExternalRequestsPerRun
  );
  const enriched: StagedCandidate[] = [];

  for (const candidate of candidates) {
    if (!candidate.website || requestCount >= maxWebsiteRequests) {
      enriched.push(candidate);
      continue;
    }

    try {
      const websiteResult = await crawlWebsiteForEvidence(
        candidate.website,
        context,
        () => requestCount < maxWebsiteRequests,
        () => {
          requestCount += 1;
        }
      );

      const nextEvidence = Array.from(new Set([...candidate.evidence, ...websiteResult.evidence]));
      const hasIndian = nextEvidence.some((item) => item.includes('indian'));
      const hasBuffet = nextEvidence.some((item) => item.includes('buffet'));

      enriched.push({
        ...candidate,
        evidence: nextEvidence,
        classificationStatus: hasIndian && hasBuffet ? 'likely_indian_buffet' : candidate.classificationStatus,
        confidence: hasIndian && hasBuffet ? Math.max(candidate.confidence, 0.9) : candidate.confidence,
        enrichment: {
          ...candidate.enrichment,
          website: websiteResult.enrichment,
        },
      });
    } catch (error) {
      context.log('warn', 'website_crawl_failed', {
        candidateKey: candidate.candidateKey,
        website: candidate.website,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      enriched.push(candidate);
    }
  }

  context.log('info', 'website_crawl_finished', { requestCount });
  return enriched;
}
