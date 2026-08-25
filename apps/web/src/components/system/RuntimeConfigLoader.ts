import Script from 'next/script';
import { createElement, type ReactNode } from 'react';

export function RuntimeConfigLoader(): ReactNode {
  return createElement(Script, {
    src: '/runtime-config.js',
    strategy: 'beforeInteractive',
  });
}
