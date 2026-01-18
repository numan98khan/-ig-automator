/// <reference types="vite/client" />
import type { RefObject } from 'react';

export {};

declare global {
  interface Window {
    gsap?: {
      context: (callback: () => void, scope?: Element | RefObject<Element>) => {
        revert: () => void;
      };
      set: (...args: any[]) => any;
      timeline: (...args: any[]) => any;
    };
  }
}
