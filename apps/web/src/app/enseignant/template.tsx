import { TransitionPage } from "@/components/shell/TransitionPage";

export default function Template({ children }: { children: React.ReactNode }) {
  return <TransitionPage>{children}</TransitionPage>;
}
