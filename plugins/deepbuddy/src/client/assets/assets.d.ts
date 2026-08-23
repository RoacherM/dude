/** esbuild inlines .png imports as data URLs (`loader: { '.png': 'dataurl' }`). */
declare module '*.png' {
  const url: string
  export default url
}

declare module '*.woff2' {
  const url: string
  export default url
}
