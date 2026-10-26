import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userSettingsApi, type AIPreferenceData, type AIProvider } from '../../api/userSettings';
import { useAIPreferences } from '../../hooks/useUserSettings';
import { Card, CardContent, CardHeader } from './Card';
import { Button } from './Button';

export function AIPreferences({userId}: {userId?: string}) {
  const prefs = useAIPreferences(userId);
  return <Card><CardHeader><h3 className="font-medium text-gray-900">AI Assistant</h3></CardHeader>
    <CardContent>{prefs.isPending ? <p>Loading AI preferences…</p> : prefs.data
      ? <PreferenceForm key={JSON.stringify(prefs.data)} prefs={prefs.data} userId={userId} />
      : <p role="alert">Could not load AI preferences. Refresh to try again.</p>}
    </CardContent></Card>;
}

function PreferenceForm({prefs,userId}: {prefs:AIPreferenceData;userId?:string}) {
  const client = useQueryClient();
  const [provider,setProvider] = useState<AIProvider>(prefs.provider);
  const [model,setModel] = useState(prefs.model);
  const [key,setKey] = useState('');
  const [validatedModels,setValidatedModels] = useState<string[] | null>(null);
  const [message,setMessage] = useState('');
  const catalog = useQuery({queryKey:['ai-models',userId,provider],queryFn:()=>userSettingsApi.models(provider),retry:false,enabled:provider !== 'codex_subscription'});
  const models = validatedModels || catalog.data?.models || [];
  const credential = prefs.credentials[provider];
  const validate = useMutation({mutationFn:()=>userSettingsApi.validate(provider,key || undefined),
    onSuccess:data=>{setValidatedModels(data.models);setMessage(data.message);},
    onError:err=>{setValidatedModels(null);setMessage(err.message);}});
  const save = useMutation({mutationFn:()=>userSettingsApi.savePreferences({provider,model,...(key ? {api_key:key} : {})}),
    onSuccess:async()=>{setKey('');await client.invalidateQueries({queryKey:['ai-preferences']});await client.invalidateQueries({queryKey:['ai-models',userId]});},
    onError:err=>setMessage(err.message)});
  const remove = useMutation({mutationFn:()=>userSettingsApi.deleteCredential(provider),
    onSuccess:async()=>{setKey('');await client.invalidateQueries({queryKey:['ai-preferences']});await client.invalidateQueries({queryKey:['ai-models',userId]});},
    onError:err=>setMessage(err.message)});
  const busy = validate.isPending || save.isPending || remove.isPending;
  return <div className="space-y-4">
    {prefs.unavailable_reason && <p role="alert">{prefs.unavailable_reason}</p>}
    <p className="text-sm text-gray-600">Selected: {prefs.provider} / {prefs.model}. {prefs.is_configured ? 'Credential configured.' : 'Credential not configured.'}</p>
    <label className="block text-sm font-medium">Provider
      <select aria-label="Provider" value={provider} disabled={busy} className="block mt-1 border rounded p-2 w-full" onChange={e=>{
        setProvider(e.target.value as AIProvider);setModel('');setKey('');setValidatedModels(null);setMessage('');
      }}>
        {provider === 'codex_subscription' && <option value="codex_subscription" disabled>Codex subscription (retired — choose a provider)</option>}
        <option value="anvil">Anvil (shared local AI)</option><option value="openai">OpenAI / Codex (API key)</option>
        <option value="gemini">Google Gemini</option><option value="anthropic">Anthropic Claude</option>
      </select>
    </label>
    <p className="text-sm text-gray-600">{provider === 'anvil'
      ? 'Anvil uses application credits to account for shared local AI usage: outlines 10, module content 25, flashcards 8, quiz 10.'
      : 'Your provider bills your API key. Successful usage is recorded with no application-credit deduction. OpenAI subscription login is not supported.'}</p>
    {provider !== 'anvil' && provider !== 'codex_subscription' && <div className="space-y-2">
      <p className="text-sm">{credential ? `Saved credential: ${credential.mask}` : 'No saved credential for this provider.'}</p>
      <label className="block text-sm font-medium">API key
        <input aria-label="API key" type="password" autoComplete="off" value={key} disabled={busy}
          className="block border rounded p-2 w-full" placeholder={credential ? 'Enter replacement key' : 'Enter API key'}
          onChange={e=>{setKey(e.target.value);setValidatedModels(null);setMessage('');}} />
      </label>
      <Button variant="secondary" disabled={busy || (!key && !credential)} onClick={()=>validate.mutate()}>Validate credential</Button>
      {credential && <Button variant="secondary" disabled={busy} onClick={()=>remove.mutate()}>Remove saved credential</Button>}
    </div>}
    {catalog.isPending && provider !== 'codex_subscription' && <p>Loading advertised models…</p>}
    {!catalog.isPending && !validatedModels && !catalog.data?.is_available && <p role="status">{catalog.data?.message || 'Model catalog unavailable.'}</p>}
    <label className="block text-sm font-medium">Model
      <select aria-label="Model" value={model} disabled={busy} className="block mt-1 border rounded p-2 w-full" onChange={e=>setModel(e.target.value)}>
        <option value="">Select a model</option>
        {model && !models.includes(model) && <option value={model}>{model} (unavailable)</option>}
        {models.map(item=><option key={item} value={item}>{item}</option>)}
      </select>
    </label>
    {model && !catalog.isPending && !models.includes(model) && <p role="alert">Selected model is unavailable. Choose another advertised model explicitly.</p>}
    <p className="text-sm text-gray-600">No automatic fallback. To use Anvil instead, select Anvil, choose its model and save. An operation already in progress keeps its original provider and model.</p>
    <p className="text-sm text-gray-600">Image generation is currently unavailable; text model selection does not enable images.</p>
    {message && <p role="status">{message}</p>}
    <Button disabled={busy || !models.includes(model) || (provider !== 'anvil' && !!key && !validatedModels)} isLoading={save.isPending} onClick={()=>save.mutate()}>Save AI preferences</Button>
  </div>;
}
