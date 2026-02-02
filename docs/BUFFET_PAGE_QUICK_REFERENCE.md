# Buffet Detail Page - Quick Reference

## Section Order (Canonical)

1. **Decision Header** (H1) - Mandatory
2. **Verdict Module** - User-Only, Always shown
3. **Best For Section** (H3) - User-Only, Always shown
4. **Overview** (H2, id="overview") - Mandatory
5. **Summary Panel** - User-Only, Optional
6. **Photos** (H2, id="photos") - Optional
7. **Hours & Location** (H2, id="hours-location") - Optional
8. **Contact** (H2, id="contact") - Optional
9. **Accessibility & Amenities** (H2, id="accessibility-amenities") - Optional, Mobile Collapsible
10. **Reviews** (H2, id="reviews") - Optional, SEO Always in DOM
11. **FAQs** (H2, id="faqs") - Optional, SEO-Only, Mobile Collapsible
12. **Nearby Highlights** (H2) - Optional, User-Only
13. **Nearby Places** (H2, id="nearby-places") - Optional, SEO-Only, Extended Local Info
14. **Neighborhood Context** (H2) - Optional, SEO-Only, Mobile Collapsible
15. **Related Buffets** (H2, id="related-buffets") - Optional, User-Only
16. **Related Links** (H2, id="related-links") - Optional, User-Only, Mobile Collapsible

## Heading Rules (STRICT)

- **H1**: Exactly one - Buffet name + city + state (e.g., "Golden Dragon Buffet in Salem, Oregon")
- **H2**: Core sections only (Overview, Photos, Hours & Location, Contact, Reviews, FAQs, Nearby Places, Related Buffets, Related Links)
- **H3**: Subsections (POI categories, review themes, sub-sections within H2 sections)
- **H4**: Items (POI group labels, individual POI names, review theme labels, FAQ questions)
- **No skipped levels**: H1 → H2 → H3 → H4 (sequential only)

## Omission Rules

### Never Omit
- Decision Header (H1)
- Overview Section
- Verdict Module
- Best For Section

### Omit If No Data
- Photos: No images AND imageCount === 0
- Hours & Location: No hours data
- Contact: No contact info
- Accessibility & Amenities: No accessibility AND no amenities
- Reviews: No review data
- FAQs: No Q&A data
- Nearby Highlights: No relevant POI data
- Nearby Places: No POI sections have data
- Neighborhood Context: No neighborhood data
- Related Buffets: No nearby buffets
- Related Links: No web results

## SEO Requirements

- All review content: Always in DOM (sr-only when collapsed)
- All FAQ content: Always in DOM
- All POI content: Always in DOM (sr-only when collapsed via ExtendedLocalInfo)
- Structured data: JSON-LD always present

## Mobile Optimization

### Low Priority (Collapsible)
- Accessibility & Amenities
- FAQs
- Neighborhood Context
- Related Links

### Always Expanded
- Decision Header
- Overview
- Verdict Module
- Best For Section
- Photos (if exists)
- Hours & Location (if exists)
- Reviews (if exists)

## Validation Checklist

- [ ] Exactly one H1 (buffet name)
- [ ] Overview section present (H2, id="overview")
- [ ] All H2 sections have unique `id` attributes
- [ ] All H2 sections use `scroll-mt-24`
- [ ] No empty sections rendered
- [ ] All SEO content in DOM
- [ ] Structured data present
- [ ] TOC matches visible sections
