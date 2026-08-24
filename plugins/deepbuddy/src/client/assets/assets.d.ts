/** esbuild inlines .png imports as data URLs (`loader: { '.png': 'dataurl' }`). */
declare module '*.png' {
  const url: string
  export default url
}

declare module '*.woff2' {
  const url: string
  export default url
}

/** esbuild loads xterm's renderer stylesheet as an inline string. */
declare module '*.css' {
  const css: string
  export default css
}
