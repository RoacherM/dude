import type { DetailedHTMLProps, HTMLAttributes } from 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & { src?: string; allowpopups?: string; partition?: string }
    }
  }
}

export {}
