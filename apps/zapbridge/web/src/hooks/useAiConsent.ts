import { useEffect, useState } from 'react';
import { aiApi, AiSettings } from '../api/ai';
import { isDevPreview } from '../dev/devPreview';

export function useAiConsent() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isDevPreview()) {
      setSettings({ consented: true, suggestionsEnabled: true } as AiSettings);
      setLoading(false);
      return;
    }
    aiApi
      .getConsent()
      .then((r) => setSettings(r.settings))
      .catch(() => setSettings(null))
      .finally(() => setLoading(false));
  }, []);

  const accept = async () => {
    try {
      const s = await aiApi.accept({ suggestionsEnabled: true });
      setSettings(s);
    } catch {
      /* ignore */
    }
  };

  return {
    aiOn: !!settings?.consented,
    suggestionsEnabled: !!settings?.suggestionsEnabled,
    settings,
    loading,
    accept,
  };
}
