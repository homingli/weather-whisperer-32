import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The theme change destroys and rebuilds the Map instance (creation effect
// keyed on `dark`). Functional guard for the viewport carry-over: whatever
// the parent's viewport-init effect put on the outgoing map (the GPS center)
// must seed the replacement instead of the constructor default snapping back.

// vi.hoisted so the vi.mock factories below (evaluated during import
// hoisting) can reference the fakes, and the test body can assert on the
// constructed instances.
const { FakeMap, FakeMarker, instances } = vi.hoisted(() => {
  interface FakeMapOptions {
    center: [number, number];
    zoom: number;
  }

  class FakeMap {
    options: FakeMapOptions;
    center: [number, number];
    zoom: number;
    removed = false;
    // Named properties — MapLibreMap toggles map.dragPan.enable() etc.
    dragPan = { enable: () => {}, disable: () => {} };
    scrollZoom = { enable: () => {}, disable: () => {} };
    doubleClickZoom = { enable: () => {}, disable: () => {} };
    boxZoom = { enable: () => {}, disable: () => {} };
    keyboard = { enable: () => {}, disable: () => {} };

    constructor(options: FakeMapOptions) {
      this.options = { ...options };
      this.center = options.center;
      this.zoom = options.zoom;
      registry.instances.push(this);
    }

    getCenter() {
      // Minimal stand-in for maplibre's LngLat.
      return { toArray: () => this.center };
    }

    getZoom() {
      return this.zoom;
    }

    setCenter(center: [number, number]) {
      this.center = center;
    }

    setZoom(zoom: number) {
      this.zoom = zoom;
    }

    isStyleLoaded() {
      return true;
    }

    on() {}
    once() {}
    off() {}
    addControl() {}
    getCanvas() {
      return document.createElement('div');
    }
    getContainer() {
      return document.createElement('div');
    }
    setStyle() {}
    remove() {
      this.removed = true;
    }
  }

  class FakeMarker {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
  }

  const registry = { instances: [] as unknown[] };
  return { FakeMap, FakeMarker, instances: registry.instances };
});

vi.mock('maplibre-gl', () => ({
  setWorkerUrl: () => {},
  Map: FakeMap,
  Marker: FakeMarker,
  NavigationControl: class {},
}));

vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({
  default: 'map-worker-fake.js',
}));

import { MapLibreMap } from './MapLibreMap';

const baseProps = {
  center: [114.10, 22.40] as [number, number],
  zoom: 12,
  minZoom: 6,
  maxZoom: 17,
  dark: false,
  ariaLabel: 'rainfall map',
};

const asMap = (instance: unknown) => instance as InstanceType<typeof FakeMap>;

describe('MapLibreMap viewport carry-over across theme recreation', () => {
  beforeEach(() => {
    instances.length = 0;
  });

  it('seeds the first map from props', () => {
    render(<MapLibreMap {...baseProps} />);
    expect(instances).toHaveLength(1);
    const first = asMap(instances[0]);
    expect(first.options.center).toEqual([114.10, 22.40]);
    expect(first.options.zoom).toBe(12);
  });

  it("re-applies the outgoing map's viewport when the theme rebuilds the map", () => {
    const { rerender, unmount } = render(<MapLibreMap {...baseProps} />);

    // Simulate the parent's one-shot viewport init: center on the GPS fix.
    const first = asMap(instances[0]);
    first.setCenter([-123.12, 49.28]);
    first.setZoom(12);

    rerender(<MapLibreMap {...baseProps} dark />);
    expect(instances).toHaveLength(2);
    expect(first.removed).toBe(true);

    const second = asMap(instances[1]);
    expect(second.options.center).toEqual([-123.12, 49.28]);
    expect(second.options.zoom).toBe(12);

    // The carry-over is one-shot: a plain unmount must not resurrect it.
    unmount();
    expect(instances).toHaveLength(2);
  });
});
