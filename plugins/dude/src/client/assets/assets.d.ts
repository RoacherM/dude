/** esbuild inlines .woff2 imports as data URLs (`loader: { '.woff2': 'dataurl' }`). */
declare module '*.woff2' {
  const url: string
  export default url
}
