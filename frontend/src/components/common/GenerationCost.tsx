import { useAIPreferences } from '../../hooks/useUserSettings';

/** Operation units for local inference accounting; BYOK is billed by the provider. */
export function GenerationCost({amount}: {amount:number}) {
  const {data} = useAIPreferences();
  if (!data) return <span>Anvil: {amount} application credits; BYOK/subscription: 0 application credits.</span>;
  return <span>{data.provider === 'anvil' ? `${amount} application credits` : data.provider === 'codex_subscription' ? '0 application credits (subscription limits apply)' : '0 application credits (your provider bills your key)'} · {data.provider} / {data.model}</span>;
}
