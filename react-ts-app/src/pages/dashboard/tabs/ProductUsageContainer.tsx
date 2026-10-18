import { Outlet } from 'react-router-dom';
import { useAppSelector } from '../../../hooks';
import { DashboardToolbar } from '../shared/DashboardToolbar';
import { bookFilters } from '../shared/bookFilters';
import { toQuery, useDashboardFilters } from '../shared/useDashboardFilters';
import { useSubViews } from '../useSubViews';
import type { ProductUsageContext } from './product-usage/ControlsView';

const KEYS = ['product', 'owner', 'lifecycle'];

/**
 * The Product Usage shell and its bar.
 *
 * Product leads the filters here — it is the axis of the screen, and filtering
 * to one product turns the comparison into a single-product read. The options
 * come from the book rather than a table, because there is no product table;
 * the same gap the attribution note names.
 *
 * No window control, for the same reason as the Customer Overview: the health
 * and seat figures are statements about now, while churn is all-time, and one
 * window across both would mean two different things.
 */
export function ProductUsageContainer() {
  const subViews = useSubViews();
  const options = useAppSelector((state) => state.products.stats?.filters);
  const customers = useAppSelector((state) => state.products.stats?.kpis.customers ?? 0);
  const { values } = useDashboardFilters(KEYS);
  const context: ProductUsageContext = { query: toQuery(values) };

  return (
    <div className="flex flex-col h-full w-full">
      <DashboardToolbar
        subViews={subViews}
        count={`${customers} ${customers === 1 ? 'customer' : 'customers'}`}
        filters={[
          {
            key: 'product',
            label: 'Product',
            options: [
              { value: '', label: 'All' },
              ...(options?.products ?? []).map((o) => ({ value: o.value, label: o.name })),
            ],
          },
          ...bookFilters(options).slice(0, 2),
        ]}
      />
      <div className="flex-1 w-full">
        <Outlet context={context} />
      </div>
    </div>
  );
}
