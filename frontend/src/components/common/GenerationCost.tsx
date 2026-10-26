import { useAIPreferences } from '../../hooks/useUserSettings';

/** Operation units for local inference accounting; BYOK is billed by the provider. */
export function GenerationCost({amount}: {amount:number}) {
  const {data} = useAIPreferences();
  if (data?.provider === 'codex_subscription') return <span>Selected provider is retired. Choose a provider in Settings before generating.</span>;
  if (!data) return <span>Anvil: {amount} application credits; BYOK: 0 application credits.</span>;
  return <span>{data.provider === 'anvil' ? `${amount} application credits` : '0 application credits (your provider bills your key)'} · {data.provider} / {data.model}</span>;
}
