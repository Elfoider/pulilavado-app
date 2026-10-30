"use client";
import { useEffect, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../client";
export function useCollection<T extends { id: string }>(
  path: string,
  dateField?: string,
  maximum = 150,
) {
  const [data, setData] = useState<T[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    return onSnapshot(
      dateField
        ? query(
            collection(db, path),
            orderBy(dateField, "desc"),
            limit(maximum),
          )
        : collection(db, path),
      (snap) => {
        setData(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T));
        setLoading(false);
        setError("");
      },
      () => {
        setError(
          "No se pudieron cargar los datos. Revise la conexión y los permisos de Firebase.",
        );
        setLoading(false);
      },
    );
  }, [path, dateField, maximum]);
  return { data, error, loading };
}
