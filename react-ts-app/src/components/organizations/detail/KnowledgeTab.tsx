import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../../hooks';
import { fetchHeadlinesForCustomer, regenerateHeadlines } from '../../../features/customers/customersSlice';
import { HeadlinesTab } from '../activity/HeadlinesTab';
import { CompanyViewTab } from '../CompanyViewTab';

/** Knowledge (spec §1.9): today's Company View (the brief, who answers, and
 *  questions), then the AI headlines that used to be a feed sub-tab: five
 *  flat cards, none inside another. */
export function KnowledgeTab({ customerId, customerName }: { customerId: number; customerName: string }) {
  const dispatch = useAppDispatch();
  const { headlines, headlinesLoading, headlinesError, headlinesGenerating, headlinesGenerateError } = useAppSelector(
    (state) => state.customers,
  );
  useEffect(() => {
    dispatch(fetchHeadlinesForCustomer(customerId));
  }, [dispatch, customerId]);
  return (
    <div className="flex flex-col gap-4">
      <CompanyViewTab customerId={customerId} customerName={customerName} embedded />
      <HeadlinesTab
        headlines={headlines}
        isLoading={headlinesLoading}
        error={headlinesError}
        onRegenerate={async () => {
          await dispatch(regenerateHeadlines({ customerId }));
        }}
        isRegenerating={headlinesGenerating}
        regenerateError={headlinesGenerateError}
        embedded
      />
    </div>
  );
}
