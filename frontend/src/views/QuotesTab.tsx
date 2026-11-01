import { Button } from "../components/ui";
import { planActions } from "../state/planStore";
import { SavedQuotes } from "../components/SavedQuotes";
export const QuotesTab = () => <div className="space-y-4"><h1 className="text-2xl">Quotes</h1><p>Save vendor quotations for comparison and select the finalized offer for your budget.</p><SavedQuotes /><Button onClick={planActions.openQuotes}>Snap a quote</Button></div>;
