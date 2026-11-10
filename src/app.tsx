import React, { useEffect, useState } from "react";
import { Box, useStdin } from "ink";
import { ShepherdState } from "./shepherd/state.js";
import { SummaryView } from "./shepherd/render/summary-view.js";
import { DiffView } from "./shepherd/render/diff-view.js";

interface AppProps {
  state: ShepherdState;
}

export function App({ state }: AppProps) {
  const { stdin, setRawMode } = useStdin();
  const [viewMode, setViewMode] = useState(state.getViewMode());

  useEffect(() => {
    // Enable mouse tracking
    if (stdin && typeof stdin.setRawMode === "function") {
      setRawMode(true);
      stdin.write("\x1b[?1000h"); // Enable mouse tracking
      stdin.write("\x1b[?1002h"); // Enable button-event tracking
      stdin.write("\x1b[?1006h"); // Enable SGR extended mode
    }

    return () => {
      // Disable mouse tracking on exit
      if (stdin && typeof stdin.setRawMode === "function") {
        stdin.write("\x1b[?1000l"); // Disable mouse tracking
        setRawMode(false);
      }
    };
  }, [stdin, setRawMode]);

  useEffect(() => {
    const unsubscribe = state.subscribe(() => {
      setViewMode(state.getViewMode());
    });
    return unsubscribe;
  }, [state]);

  if (viewMode === "diff") {
    return <DiffView key="diff-view" state={state} />;
  }

  return <SummaryView key="summary-view" state={state} />;
}
