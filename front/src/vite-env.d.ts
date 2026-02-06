import 'vite/client';

interface ImportMetaEnv {
  readonly VITE_API_BASE: string
  readonly VITE_INVENTORY_BASE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
