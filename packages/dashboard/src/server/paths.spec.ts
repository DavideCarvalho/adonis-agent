import { describe, expect, it } from 'vitest';
import {
  apiBaseFor,
  contentTypeFor,
  injectApiBase,
  mountPathFor,
  safeAssetSegments,
  trimSlashes,
} from './paths.js';

describe('trimSlashes', () => {
  it('collapses and strips slashes', () => {
    expect(trimSlashes('/agent//')).toBe('agent');
    expect(trimSlashes('agent')).toBe('agent');
    expect(trimSlashes('/')).toBe('');
  });
});

describe('apiBaseFor', () => {
  it('returns an absolute single-leading-slash base', () => {
    expect(apiBaseFor('agent')).toBe('/agent');
    expect(apiBaseFor('/api/agent/')).toBe('/api/agent');
    expect(apiBaseFor('/')).toBe('/');
  });
});

describe('mountPathFor', () => {
  it('defaults to <agentPath>/dashboard', () => {
    expect(mountPathFor('agent')).toBe('/agent/dashboard');
    expect(mountPathFor('/api/agent/')).toBe('/api/agent/dashboard');
  });
  it('honors an explicit override', () => {
    expect(mountPathFor('agent', '/console')).toBe('/console');
  });
});

describe('contentTypeFor', () => {
  it('maps common extensions', () => {
    expect(contentTypeFor('index.html')).toBe('text/html; charset=utf-8');
    expect(contentTypeFor('app.js')).toBe('text/javascript; charset=utf-8');
    expect(contentTypeFor('main.css')).toBe('text/css; charset=utf-8');
    expect(contentTypeFor('logo.svg')).toBe('image/svg+xml');
  });
  it('falls back to octet-stream', () => {
    expect(contentTypeFor('mystery.xyz')).toBe('application/octet-stream');
  });
});

describe('safeAssetSegments', () => {
  it('normalizes clean paths', () => {
    expect(safeAssetSegments('assets/app.js')).toEqual(['assets', 'app.js']);
    expect(safeAssetSegments(['assets', 'x.css'])).toEqual(['assets', 'x.css']);
  });
  it('denies traversal attempts', () => {
    expect(safeAssetSegments('../secret')).toBeNull();
    expect(safeAssetSegments('assets/../../etc')).toBeNull();
    expect(safeAssetSegments('a\\b')).toBeNull();
  });
});

describe('injectApiBase', () => {
  it('inserts the base global before </head>', () => {
    const html = '<html><head><title>x</title></head><body></body></html>';
    const out = injectApiBase(html, '/agent');
    expect(out).toContain('window.__AGENT_DASHBOARD_BASE__="/agent"');
    expect(out.indexOf('__AGENT_DASHBOARD_BASE__')).toBeLessThan(out.indexOf('</head>'));
  });
});
