/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_AUTH_DOMAIN: string
  readonly VITE_USER_POOL_ID: string
  readonly VITE_USER_POOL_CLIENT_ID: string
  readonly VITE_AUTH_CALLBACK_URL: string
  readonly VITE_AUTH_LOGOUT_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
