// Augment WXT's ImportMetaEnv to include Vite's DEV flag.
// WXT's auto-generated .wxt/types/globals.d.ts defines ImportMetaEnv but
// omits the DEV property — this extends it for type-safe usage.
interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
}
