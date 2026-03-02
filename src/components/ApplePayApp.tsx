import { CDPReactProvider } from '@coinbase/cdp-react';
import ApplePayWidget from './ApplePayWidget';

const PROJECT_ID = import.meta.env.PUBLIC_CDP_PROJECT_ID as string;

export default function ApplePayApp() {
  return (
    <CDPReactProvider
      config={{
        projectId: PROJECT_ID,
        ethereum: { createOnLogin: 'eoa' },
        appName: 'Coinbase Onramp — Apple Pay',
      }}
    >
      <ApplePayWidget />
    </CDPReactProvider>
  );
}
