import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { AuthProvider } from '../lib/auth'
import { CartProvider } from '../lib/cart'

export default function App({ Component, pageProps }: AppProps) {
  return <AuthProvider><CartProvider><Component {...pageProps} /></CartProvider></AuthProvider>
}
