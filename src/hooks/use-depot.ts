"use client";
import { useEffect, useState } from "react";

interface Depot {
  spoke_depot_id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zipcode: string;
}

export function useDepot(tenantId = 1) {
  const [depot, setDepot] = useState<Depot | null>(null);

  useEffect(() => {
    fetch(`/api/data/spoke-depots?tenant_id=${tenantId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.list?.length > 0) setDepot(d.list[0]);
      })
      .catch(() => null);
  }, [tenantId]);

  return depot;
}
