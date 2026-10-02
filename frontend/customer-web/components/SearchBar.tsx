import { FormEvent, useState } from 'react';
import { useRouter } from 'next/router';
export function SearchBar({ initial = '' }: { initial?: string }) {
  const [query, setQuery] = useState(initial); const router = useRouter();
  const submit = (event: FormEvent) => { event.preventDefault(); const value = query.trim(); router.push(value ? `/products?search=${encodeURIComponent(value)}` : '/products'); };
  return <form className="search" onSubmit={submit}><input aria-label="Search products" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products, brands and more" /><button type="submit">Search</button></form>;
}
