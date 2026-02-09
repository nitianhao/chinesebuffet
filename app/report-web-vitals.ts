import type { Metric } from 'next/web-vitals';

const LOG_TARGET = process.env.NEXT_PUBLIC_VITALS_LOG || '';

export function reportWebVitals(metric: Metric) {
  if (!LOG_TARGET) return;

  if (LOG_TARGET === 'console') {
    console.log('[web-vitals]', metric);
    return;
  }

  if (LOG_TARGET === 'endpoint') {
    const payload = {
      id: metric.id,
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
      navigationType: metric.navigationType,
    };

    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon('/api/vitals', blob);
    } else {
      fetch('/api/vitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify(payload),
      }).catch(() => {});
    }
  }
}
