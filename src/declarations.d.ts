/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
declare module '*.css';
declare module '*.svg?raw' {
  const text: string;
  export default text;
}
declare module '*.css?raw' {
  const text: string;
  export default text;
}
