import { describe, expect, it } from 'vitest';
import { Metrics } from './metrics';

describe('Metrics', () => {
  it('renders counters and gauges in Prometheus text format', () => {
    const m = new Metrics();
    const c = m.counter('http_requests_total', 'HTTP requests');
    c.inc({ route: '/x', status: '200' });
    c.inc({ status: '200', route: '/x' });
    m.gauge('ws_connections', 'Open sockets').set(3);
    const out = m.render();
    expect(out).toContain('http_requests_total{route="/x",status="200"} 2');
    expect(out).toContain('ws_connections 3');
    expect(out).toContain('# TYPE http_requests_total counter');
  });
});
