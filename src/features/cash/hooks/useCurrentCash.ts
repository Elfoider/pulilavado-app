"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../../infrastructure/firebase/client";
import { isCashSession, type CashSession } from "../../operations/domain/model";

export function useCurrentCash() {
  const [state, setState] = useState<{
    session: CashSession | null;
    loading: boolean;
    error: string;
  }>({ session: null, loading: true, error: "" });

  useEffect(() => {
    let generation = 0;
    let unsubscribeSession: (() => void) | undefined;
    const fail = () => setState({ session: null, loading: false, error: "No se pudo consultar el saldo de Caja." });
    const unsubscribeControl = onSnapshot(doc(db, "cashControl", "current"), (control) => {
      const currentGeneration = ++generation;
      unsubscribeSession?.();
      unsubscribeSession = undefined;
      const sessionId = control.data()?.sessionId;
      if (sessionId == null) {
        setState({ session: null, loading: false, error: "" });
        return;
      }
      if (typeof sessionId !== "string" || !sessionId || sessionId.includes("/")) {
        fail();
        return;
      }
      setState({ session: null, loading: true, error: "" });
      unsubscribeSession = onSnapshot(doc(db, "cashSessions", sessionId), (snapshot) => {
        if (currentGeneration !== generation) return;
        const data = snapshot.data();
        if (!isCashSession(data)) {
          fail();
          return;
        }
        setState({ session: data.status === "open" ? { ...data, id: snapshot.id } : null, loading: false, error: "" });
      }, () => { if (currentGeneration === generation) fail(); });
    }, () => {
      ++generation;
      unsubscribeSession?.();
      unsubscribeSession = undefined;
      fail();
    });
    return () => {
      ++generation;
      unsubscribeSession?.();
      unsubscribeControl();
    };
  }, []);

  return state;
}
