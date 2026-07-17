"use client";

import useSWR from "swr";

export type OrderRow = {
  rtscan_id: number;
  tracking_number: string;
  recipient_name: string;
  full_address: string;
  delivery_date: string;
  delivery_type: string;
  dispatch_status: string;
  payment_status: string;
  total_amount: number;
  created_at: string;
};

export type OrdersResponse = {
  ok: boolean;
  orders: OrderRow[];
  count: number;
};

export function useOrders(options?: { refreshInterval?: number }) {
  const { data, error, isLoading, mutate } = useSWR<OrdersResponse>("/api/client/orders", {
    refreshInterval: options?.refreshInterval ?? 0,
  });

  return {
    orders: data?.orders ?? [],
    count: data?.count ?? 0,
    isLoading,
    error,
    refresh: mutate,
  };
}
