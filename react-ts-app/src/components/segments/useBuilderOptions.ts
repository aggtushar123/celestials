import { useEffect, useState } from 'react';
import { fetchAttributes } from '../../features/attributes/attributesApi';
import type { AIAttribute } from '../../features/attributes/types';
import type { PersonRef } from '../../features/segments/segmentTypes';
import { fetchProducts } from '../../pages/settings/productsApi';

/** The workspace's AI attributes: rule fields, and their names in a
 *  sentence. None until read, and none if the read fails (a rule on one then
 *  reads as its key). */
export function useAttributes(): AIAttribute[] {
  const [attributes, setAttributes] = useState<AIAttribute[]>([]);
  useEffect(() => {
    let alive = true;
    fetchAttributes().then(
      (rows) => {
        if (alive) setAttributes(rows);
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, []);
  return attributes;
}

/** The product catalogue (GET /products/, open to every member). */
export function useProducts(): PersonRef[] {
  const [products, setProducts] = useState<PersonRef[]>([]);
  useEffect(() => {
    let alive = true;
    fetchProducts().then(
      (rows) => {
        if (alive) setProducts(rows.map(({ id, name }) => ({ id, name })));
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, []);
  return products;
}
