import { AccountSection, NotAvailableNotice } from './AccountSection';

export function ResponsibleGamblingSection() {
  return (
    <AccountSection title="Responsible gambling">
      <NotAvailableNotice text="Deposit limits, loss limits, session limits, and self-exclusion aren't available yet." />
    </AccountSection>
  );
}
