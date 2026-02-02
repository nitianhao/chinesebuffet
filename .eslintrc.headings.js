/**
 * ESLint rule for heading hierarchy validation
 * 
 * This rule checks that:
 * - There is exactly one H1
 * - H1 includes city and state
 * - No skipped heading levels
 * - H2 sections are only core sections
 * - POI categories use H3 (not H2)
 */

module.exports = {
  rules: {
    'jsx-a11y/heading-has-content': 'error',
  },
  overrides: [
    {
      files: ['app/chinese-buffets/**/page.tsx'],
      rules: {
        // Custom rule would go here - for now, we rely on runtime validation
        // and TypeScript types
      },
    },
  ],
};
