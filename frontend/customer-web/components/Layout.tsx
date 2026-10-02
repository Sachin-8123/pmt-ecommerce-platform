import { Header } from './Header';
export function Layout({ children }: { children: React.ReactNode }) { return <><Header /><main className="page">{children}</main><footer>PMT Marketplace · Shop thoughtfully, save time.</footer></>; }
