import type { Category, Product } from './types';

const catalogPhotos = {
  groceries: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=900&q=80',
  home: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=900&q=80'
};

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function buildCardImage(label: string, subtitle = 'Marketplace') {
  return catalogPhoto(`${label} ${subtitle}`);
}

function catalogPhoto(label: string) {
  const normalized = label.toLowerCase();
  if (/home|household|kitchen|cleaning|laundry|storage|decor|furniture|appliance/.test(normalized)) {
    return catalogPhotos.home;
  }
  if (/grocery|grocer|food|produce|fruit|vegetable|fresh|dairy|bakery|pantry|market/.test(normalized)) {
    return catalogPhotos.groceries;
  }
  return hashString(label) % 2 === 0 ? catalogPhotos.groceries : catalogPhotos.home;
}

export function getProductImage(product: Pick<Product, 'imageUrl' | 'name' | 'category'>) {
  return product.imageUrl || buildCardImage(`${product.name || 'Product'} ${product.category?.name || ''}`, 'Marketplace');
}

export function getCategoryImage(category: Pick<Category, 'imageUrl' | 'name' | 'description'>) {
  return category.imageUrl || buildCardImage(`${category.name || 'Category'} ${category.description || ''}`, 'Collection');
}
