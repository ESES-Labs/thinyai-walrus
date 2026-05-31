import { useEffect } from "react";
import { useSessionsStore } from "../store/sessions.ts";
import { SessionTable } from "../components/sessions/SessionTable.tsx";

export function SessionsPage() {
  const { fetch } = useSessionsStore();

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return <SessionTable />;
}
