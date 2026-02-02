# Performance Budgets

This project enforces strict performance budgets that will **fail builds** if exceeded.

## Budget Limits

Current budgets are defined in `performance-budgets.json`:

- **Initial JS**: ≤ 130 KB (first load JavaScript)
- **Total JS**: ≤ 300 KB (all JavaScript chunks combined)
- **LCP**: ≤ 2.5s (Largest Contentful Paint)
- **DOM Nodes**: ≤ 1500 (total DOM elements)

## How It Works

When you run `npm run build`, the build process will:

1. Build the Next.js application
2. Check bundle sizes against budgets
3. Start a local server and run Lighthouse audit
4. Check LCP and DOM node metrics
5. **Fail the build** if any budget is exceeded

## Customizing Budgets

Edit `performance-budgets.json` to adjust limits:

```json
{
  "budgets": {
    "initialJS": {
      "maxSizeKB": 130,
      "description": "Initial JavaScript bundle size (first load)"
    },
    "totalJS": {
      "maxSizeKB": 300,
      "description": "Total JavaScript bundle size across all chunks"
    },
    "lcp": {
      "maxTimeMs": 2500,
      "description": "Largest Contentful Paint"
    },
    "domNodes": {
      "maxCount": 1500,
      "description": "Maximum DOM nodes in the page"
    }
  }
}
```

## Scripts

- `npm run build` - Build with performance budget checks (fails on violation)
- `npm run build:skip-budgets` - Build without performance checks (for debugging)

## Individual Checks

You can run individual checks:

- `node scripts/check-bundle-budgets.js` - Check JS bundle sizes only
- `node scripts/check-lighthouse-budgets.js` - Check LCP and DOM nodes only
- `node scripts/check-performance-budgets.js` - Run all checks

## Troubleshooting

### Build Fails Due to Bundle Size

If bundle size budgets are exceeded:

1. **Code splitting**: Use dynamic imports for large components
   ```tsx
   const HeavyComponent = dynamic(() => import('./HeavyComponent'));
   ```

2. **Remove unused dependencies**: Audit your `package.json`

3. **Optimize imports**: Import only what you need
   ```tsx
   // Bad
   import * as utils from './utils';
   
   // Good
   import { specificFunction } from './utils';
   ```

4. **Tree shaking**: Ensure your bundler can eliminate dead code

### Build Fails Due to LCP

If LCP exceeds 2.5s:

1. **Optimize images**: Use `next/image` with proper sizing
2. **Reduce initial HTML size**: Minimize server-rendered content
3. **Preload critical resources**: Use `<link rel="preload">`
4. **Optimize fonts**: Use `next/font` and subset fonts

### Build Fails Due to DOM Nodes

If DOM nodes exceed 1500:

1. **Simplify component structure**: Reduce nesting
2. **Lazy load below-the-fold content**: Use dynamic imports
3. **Virtualize long lists**: Use libraries like `react-window`
4. **Avoid unnecessary wrapper divs**: Use React fragments

## CI/CD Integration

The performance budgets are automatically enforced in the build process. If you're using CI/CD:

- Builds will fail if budgets are exceeded
- You can temporarily skip checks with `build:skip-budgets` for debugging
- Consider setting up alerts for budget violations

## Notes

- Lighthouse checks require a running server, so they take longer
- Bundle size checks are fast and run first
- All checks must pass for the build to succeed
