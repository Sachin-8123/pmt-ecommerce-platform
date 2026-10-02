import type { Product } from '../lib/types'; import { ProductCard } from './ProductCard';
export function ProductGrid({ products }: { products: Product[] }) { return <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product} />)}</div>; }
