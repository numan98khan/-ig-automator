import { requireEnv } from './env'

export const getAppUrl = () => requireEnv('VITE_APP_URL').replace(/\/$/, '')
export const getSiteUrl = () => requireEnv('VITE_SITE_URL').replace(/\/$/, '')
