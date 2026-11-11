const SESSION_KEY = 'smart-temple.session'
const PENDING_KEY = 'smart-temple.oauth-pending'
const STAFF_GROUP = 'temple-staff'

export interface UserSession {
  idToken: string
  accessToken: string
  refreshToken: string
  expiresAt: number
}

interface PendingAuth {
  state: string
  verifier: string
  nonce: string
}

interface TokenResponse {
  id_token?: string
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

const authDomain = (import.meta.env.VITE_AUTH_DOMAIN || '').replace(/\/+$/, '')
const clientId = import.meta.env.VITE_USER_POOL_CLIENT_ID || ''
const callbackUrl = import.meta.env.VITE_AUTH_CALLBACK_URL || ''
const logoutUrl = import.meta.env.VITE_AUTH_LOGOUT_URL || ''
let callbackPromise: Promise<UserSession> | null = null

export function isAuthConfigured(): boolean {
  return Boolean(authDomain && clientId && callbackUrl && logoutUrl)
}

export async function beginSignIn(): Promise<void> {
  requireAuthConfig()

  const pending: PendingAuth = {
    state: randomToken(),
    verifier: randomToken(),
    nonce: randomToken(),
  }
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))

  const challengeBytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(pending.verifier),
  )
  const challenge = base64Url(new Uint8Array(challengeBytes))
  const authorizeUrl = new URL(`${authDomain}/oauth2/authorize`)
  authorizeUrl.search = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: callbackUrl,
    state: pending.state,
    nonce: pending.nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString()

  window.location.assign(authorizeUrl.toString())
}

export function completeSignIn(): Promise<UserSession> {
  if (!callbackPromise) {
    callbackPromise = completeSignInOnce().catch((error: unknown) => {
      callbackPromise = null
      throw error
    })
  }
  return callbackPromise
}

async function completeSignInOnce(): Promise<UserSession> {
  requireAuthConfig()
  const callback = new URL(window.location.href)
  const providerError = callback.searchParams.get('error_description')
    || callback.searchParams.get('error')
  if (providerError) {
    sessionStorage.removeItem(PENDING_KEY)
    throw new Error(providerError.replaceAll('+', ' '))
  }

  const code = callback.searchParams.get('code')
  const returnedState = callback.searchParams.get('state')
  const rawPending = sessionStorage.getItem(PENDING_KEY)
  if (!code || !returnedState || !rawPending) {
    throw new Error('The sign-in link expired. Start again to sign in.')
  }

  const pending = JSON.parse(rawPending) as PendingAuth
  if (returnedState !== pending.state) {
    sessionStorage.removeItem(PENDING_KEY)
    throw new Error('The sign-in response could not be verified. Start again.')
  }

  const tokens = await requestTokens(new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    redirect_uri: callbackUrl,
    code_verifier: pending.verifier,
  }))
  if (!tokens.id_token || !tokens.access_token || !tokens.refresh_token) {
    sessionStorage.removeItem(PENDING_KEY)
    throw new Error('The sign-in service did not return a complete session.')
  }

  const claims = decodeClaims(tokens.id_token)
  if (claims.nonce !== pending.nonce) {
    sessionStorage.removeItem(PENDING_KEY)
    throw new Error('The sign-in response could not be verified. Start again.')
  }

  const session: UserSession = {
    idToken: tokens.id_token,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  sessionStorage.removeItem(PENDING_KEY)
  return session
}

export async function getSession(): Promise<UserSession | null> {
  const stored = sessionStorage.getItem(SESSION_KEY)
  if (!stored) return null

  let session: UserSession
  try {
    session = JSON.parse(stored) as UserSession
  } catch {
    sessionStorage.removeItem(SESSION_KEY)
    return null
  }
  if (session.expiresAt > Date.now() + 60_000) return session
  if (!session.refreshToken) {
    sessionStorage.removeItem(SESSION_KEY)
    return null
  }

  try {
    const tokens = await requestTokens(new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: session.refreshToken,
    }))
    if (!tokens.id_token || !tokens.access_token) {
      throw new Error('The sign-in session has expired.')
    }
    const refreshed: UserSession = {
      idToken: tokens.id_token,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || session.refreshToken,
      expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(refreshed))
    return refreshed
  } catch {
    sessionStorage.removeItem(SESSION_KEY)
    return null
  }
}

export async function getIdToken(): Promise<string | null> {
  return (await getSession())?.idToken || null
}

export function signedInEmail(session: UserSession | null): string {
  if (!session) return ''
  const email = decodeClaims(session.idToken).email
  return typeof email === 'string' ? email : ''
}

export function isStaffSession(session: UserSession | null): boolean {
  if (!session) return false
  const groups = decodeClaims(session.idToken)['cognito:groups']
  return Array.isArray(groups) && groups.includes(STAFF_GROUP)
}

export function signOut(): void {
  sessionStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(PENDING_KEY)
  if (!isAuthConfigured()) {
    window.location.assign('/')
    return
  }
  const url = new URL(`${authDomain}/logout`)
  url.search = new URLSearchParams({
    client_id: clientId,
    logout_uri: logoutUrl,
  }).toString()
  window.location.assign(url.toString())
}

async function requestTokens(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(`${authDomain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const tokens = await response.json() as TokenResponse
  if (!response.ok) {
    throw new Error(tokens.error_description || tokens.error || 'Sign-in could not be completed.')
  }
  return tokens
}

function requireAuthConfig(): void {
  if (!isAuthConfigured()) {
    throw new Error('This website is not connected to a deployed sign-in service yet.')
  }
}

function randomToken(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)))
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function decodeClaims(token: string): Record<string, unknown> {
  try {
    const encoded = token.split('.')[1]
    const base64 = encoded.replaceAll('-', '+').replaceAll('_', '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
  } catch {
    return {}
  }
}
