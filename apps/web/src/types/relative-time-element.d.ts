import type { RelativeTimeElement } from '@github/relative-time-element';
import type React from 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'relative-time': React.DetailedHTMLProps<
        React.HTMLAttributes<RelativeTimeElement>,
        RelativeTimeElement
      > & {
        datetime: string;
        format?: 'relative';
        threshold?: string;
        precision?: 'minute';
        prefix?: string;
        year?: 'numeric';
        month?: '2-digit';
        day?: '2-digit';
        hour?: '2-digit';
        minute?: '2-digit';
        second?: '2-digit';
        'format-style'?: 'long';
      };
    }
  }
}

export {};
