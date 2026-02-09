type TimingEntry = {
  name: string;
  dur: number;
  desc?: string;
};

const SHOULD_LOG = process.env.SERVER_TIMING_LOG === 'true';

export function createServerTiming(routeLabel: string) {
  const entries: TimingEntry[] = [];

  const add = (name: string, dur: number, desc?: string) => {
    entries.push({ name, dur, desc });
  };

  const time = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    const start = performance.now();
    const result = await fn();
    const dur = Math.round((performance.now() - start) * 100) / 100;
    add(name, dur);
    return result;
  };

  const header = () =>
    entries
      .map((entry) => {
        const desc = entry.desc ? `;desc="${entry.desc}"` : '';
        return `${entry.name};dur=${entry.dur}${desc}`;
      })
      .join(', ');

  const log = () => {
    if (!SHOULD_LOG || entries.length === 0) return;
    const sorted = [...entries].sort((a, b) => b.dur - a.dur);
    console.log(`[server-timing] ${routeLabel}`);
    sorted.forEach((entry) => {
      console.log(`  ${entry.name}: ${entry.dur}ms`);
    });
  };

  return { add, time, header, log };
}
