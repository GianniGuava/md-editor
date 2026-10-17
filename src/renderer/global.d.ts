import type { MdApi } from '../preload/preload';

declare global {
  interface Window {
    md: MdApi;
  }
}

export {};
