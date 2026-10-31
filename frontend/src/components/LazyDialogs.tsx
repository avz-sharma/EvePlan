import { lazy, Suspense, useEffect, useState } from "react";
import type { ComponentProps } from "react";

const Wizard = lazy(() => import("./OnboardingWizard").then(module => ({ default: module.OnboardingWizard })));
const QuoteModal = lazy(() => import("./VendorQuoteModal").then(module => ({ default: module.VendorQuoteModal })));

// Keep visited dialogs mounted so closing and reopening preserves entered drafts.
function useVisited(open: boolean): boolean {
  const [visited, setVisited] = useState(open);
  useEffect(() => { if (open) setVisited(true); }, [open]);
  return open || visited;
}

export function LazyWizard(props: ComponentProps<typeof Wizard>) {
  const visited = useVisited(props.isOpen);
  return visited ? <Suspense fallback={null}><Wizard {...props} /></Suspense> : null;
}

export function LazyQuoteModal(props: ComponentProps<typeof QuoteModal>) {
  const visited = useVisited(props.isOpen);
  return visited ? <Suspense fallback={null}><QuoteModal {...props} /></Suspense> : null;
}
