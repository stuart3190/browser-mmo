/**
 * Minimal, dependency-free metrics registry that renders Prometheus text format.
 *
 * Deliberately tiny: counters and gauges with label sets. If we outgrow it, swap the
 * implementation for prom-client or OpenTelemetry behind the same `Metrics` interface.
 */
type Labels = Record<string, string>;

function labelKey(labels: Labels): string {
  const keys = Object.keys(labels).sort();
  return keys.map((k) => `${k}="${String(labels[k]).replace(/"/g, '\\"')}"`).join(',');
}

class Series {
  readonly values = new Map<string, number>();
  constructor(
    readonly name: string,
    readonly help: string,
    readonly type: 'counter' | 'gauge',
  ) {}
}

export class Metrics {
  private readonly series = new Map<string, Series>();

  private get(name: string, help: string, type: 'counter' | 'gauge'): Series {
    let s = this.series.get(name);
    if (!s) {
      s = new Series(name, help, type);
      this.series.set(name, s);
    }
    return s;
  }

  counter(name: string, help: string) {
    const s = this.get(name, help, 'counter');
    return {
      inc: (labels: Labels = {}, by = 1) => {
        const k = labelKey(labels);
        s.values.set(k, (s.values.get(k) ?? 0) + by);
      },
    };
  }

  gauge(name: string, help: string) {
    const s = this.get(name, help, 'gauge');
    return {
      set: (value: number, labels: Labels = {}) => s.values.set(labelKey(labels), value),
    };
  }

  render(): string {
    const lines: string[] = [];
    for (const s of this.series.values()) {
      lines.push(`# HELP ${s.name} ${s.help}`, `# TYPE ${s.name} ${s.type}`);
      if (s.values.size === 0) lines.push(`${s.name} 0`);
      for (const [k, v] of s.values) lines.push(k ? `${s.name}{${k}} ${v}` : `${s.name} ${v}`);
    }
    return lines.join('\n') + '\n';
  }
}
