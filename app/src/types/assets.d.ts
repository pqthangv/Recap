// Metro turns image imports into asset ids that <Image source={...}> accepts.
declare module '*.png' {
  const asset: number;
  export default asset;
}
