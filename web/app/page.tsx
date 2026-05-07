import { Shell } from "@/components/Shell";
import { TopBar } from "@/components/TopBar";
import { ChatPane } from "@/components/chat/ChatPane";
import { SessionDrawer } from "@/components/sessions/SessionDrawer";
import { RightPane } from "@/components/right-pane/RightPane";

export default function Home() {
  return (
    <Shell
      topBar={<TopBar />}
      drawer={<SessionDrawer />}
      chat={<ChatPane />}
      rightPane={<RightPane />}
    />
  );
}
