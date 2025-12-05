import { ChatInterface } from "@/components/ChatInterface";
import HITLPanel from "@/components/HITLPanel";
import CallHistory from "@/components/CallHistory";

export default function Home() {
  return (
    <>
      <ChatInterface />
      <HITLPanel />
      <div className="max-w-6xl mx-auto px-4 py-6">
        <CallHistory />
      </div>
    </>
  );
}
