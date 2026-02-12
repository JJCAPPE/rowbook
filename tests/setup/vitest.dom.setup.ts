import React from "react";

import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

import { setDefaultTestEnv } from "./env-defaults";

setDefaultTestEnv();

vi.mock("next/image", () => ({
  __esModule: true,
  default: (
    props: React.ImgHTMLAttributes<HTMLImageElement> & {
      fill?: boolean;
      unoptimized?: boolean;
      priority?: boolean;
      blurDataURL?: string;
      placeholder?: string;
      loader?: unknown;
    },
  ) => {
    const {
      fill: _fill,
      unoptimized: _unoptimized,
      priority: _priority,
      blurDataURL: _blurDataURL,
      placeholder: _placeholder,
      loader: _loader,
      ...imgProps
    } = props;
    return React.createElement("img", imgProps);
  },
}));

vi.mock("next/link", () => ({
  __esModule: true,
  default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    React.createElement("a", props, props.children),
}));

const navigationMocks = vi.hoisted(() => ({
  router: {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  },
  params: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigationMocks.router,
  usePathname: () => "/",
  useSearchParams: () => navigationMocks.params,
}));

if (!window.matchMedia) {
  window.matchMedia = ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as MediaQueryList) as typeof window.matchMedia;
}

if (!("createObjectURL" in URL)) {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(() => "blob:mock-url"),
  });
}

if (!("revokeObjectURL" in URL)) {
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
}

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// @ts-expect-error test-only polyfill
global.ResizeObserver = ResizeObserverMock;

afterEach(() => {
  vi.restoreAllMocks();
});
