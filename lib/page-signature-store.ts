/**
 * Page Signature Store
 * 
 * Stores page signatures during build for duplicate detection.
 * This is a simple in-memory store for build-time duplicate detection.
 */

import { PageSignature, detectNearDuplicates, DuplicateDetectionResult } from './duplicate-detection';

// In-memory store of page signatures (cleared between builds)
const signatureStore = new Map<string, PageSignature>();

/**
 * Register a page signature
 */
export function registerPageSignature(signature: PageSignature): void {
  signatureStore.set(signature.pagePath, signature);
}

/**
 * Get all registered signatures
 */
export function getAllSignatures(): PageSignature[] {
  return Array.from(signatureStore.values());
}

/**
 * Check for duplicates for a given page
 */
export function checkForDuplicates(
  currentSignature: PageSignature
): DuplicateDetectionResult {
  const otherSignatures = getAllSignatures().filter(
    s => s.pagePath !== currentSignature.pagePath
  );
  
  return detectNearDuplicates(currentSignature, otherSignatures);
}

/**
 * Clear all signatures (useful for testing or between builds)
 */
export function clearSignatures(): void {
  signatureStore.clear();
}

/**
 * Get signature count
 */
export function getSignatureCount(): number {
  return signatureStore.size;
}
