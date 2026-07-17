export interface DashboardKpis {
  total: number;
  total_pct: number | null;
  delivered: number;
  delivered_pct: number | null;
  in_transit: number;
  failed: number;
  cod_total: number;
  signature_required: number;
  outstanding: number;
  month_total: number;
  drafts_total: number;
  stops_by_type: {
    delivery: number;
    pickup: number;
    dropoff: number;
  };
  draft_summary: {
    total: number;
    pending: number;
    approved: number;
  };
}

export interface DashboardPipeline {
  pending: number;
  in_transit: number;
  delivered: number;
  failed: number;
  pickups: number;
  deliveries: number;
}

export interface DashboardStop {
  id: string;
  stop_id: string | null;
  stop_type: string;
  source: string;
  status: string;
  // Spoke's AUTHORITATIVE terminal signal (true=delivered/false=failed/null=pre-
  // terminal) — canonical classification key (lib/status.ts). spoke_state is the
  // raw reason string for DISPLAY ONLY, never the success/fail decision.
  delivery_succeeded?: boolean | null;
  spoke_state?: string | null;
  recipient_name: string;
  delivery_address: string;
  delivery_city: string;
  delivery_state: string;
  delivery_zip: string;
  delivery_lat: number | null;
  delivery_lng: number | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  package_type: string;
  service_type: string | null;
  collect_cod: boolean;
  collect_amount: number | null;
  is_same_day: boolean;
  delivery_date: string | null;
  eta_at: string | null;
  eta: string | null;
  driver_id: string | null;
  driver_name: string | null;
  recipient_phone: string | null;
  zone: string | null;
  requires_signature: boolean;
  return_to_sender: boolean;
  notes: string | null;
  pickup_name: string | null;
  pickup_location_id: string | null;
  pickup_address: string | null;
  tracking_link: string | null;
  route_title: string | null;
  total_price: number;
  created_at: string;
}

export interface DashboardTrendPoint {
  date: string;
  label: string;
  completed: number;
  failed: number;
  total: number;
}

export interface DashboardData {
  kpis: DashboardKpis;
  pipeline: DashboardPipeline;
  stops: DashboardStop[];
  drafts: DashboardStop[];
  trend: DashboardTrendPoint[];
  next_stop: DashboardStop | null;
  cod_queue: DashboardStop[];
  cold_packages: DashboardStop[];
  upcoming: DashboardStop[];
  period: string;
  generated_at: string;
}

export type PipelineKey = keyof DashboardPipeline;
