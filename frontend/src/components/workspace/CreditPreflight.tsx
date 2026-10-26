import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { authApi } from '../../api/auth';
import { useAuthContext } from '../common/AuthContext';

export function CreditPreflight({ provider, cost }: { provider?: string; cost: number }) {
  const { user } = useAuthContext();
  const balance = useQuery({
    queryKey: ['workspace-budget', user?.id],
    queryFn: authApi.getTokenBalance,
    enabled: !!user && provider === 'anvil',
    staleTime: 0,
  });
  if (provider !== 'anvil') return null;
  return (
    <div className="text-sm space-y-1" role="status">
      <p>
        {typeof balance.data?.balance === 'number'
          ? `Available Anvil budget: ${balance.data.balance} application credits.`
          : 'Available Anvil budget unavailable; the server checks before generation.'}
      </p>
      <p>Application credits are a local usage quota, not money.</p>
      {typeof balance.data?.balance === 'number' && balance.data.balance < cost && (
        <p className="text-amber-800">
          This selection needs {cost} credits. Your brief and saved drafts are kept. Choose fewer
          modules if affordable, edit manually for free, or{' '}
          <Link className="underline" to="/settings">
            select a configured external provider
          </Link>{' '}
          (zero Anvil debit; external billing may apply). An administrator can review your local
          quota.
        </p>
      )}
    </div>
  );
}
