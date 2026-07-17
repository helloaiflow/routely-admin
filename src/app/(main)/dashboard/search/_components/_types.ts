export interface SearchResult {
  id: string;
  stop_id: string | null;
  source: "stop" | "draft";
  status: string;
  recipient_name: string;
  recipient_phone: string | null;
  delivery_address: string;
  delivery_city: string;
  delivery_state: string;
  delivery_zip: string;
  delivery_lat: number | null;
  delivery_lng: number | null;
  package_type: string;
  service_type: string | null;
  collect_cod: boolean;
  collect_amount: number | null;
  is_same_day: boolean;
  delivery_date: string | null;
  eta_at: string | null;
  driver_name: string | null;
  route_title: string | null;
  requires_signature: boolean;
  return_to_sender: boolean;
  notes: string | null;
  photos: string[];
  total_price: number;
  created_at: string;
}

export interface SearchCounts {
  total: number;
  pending: number;
  assigned: number;
  in_transit: number;
  delivered: number;
  failed: number;
  drafts: number;
  same_day: number;
  cod: number;
}

export interface SearchResponse {
  results: SearchResult[];
  counts: SearchCounts;
  query: string;
  from_stops: number;
  from_drafts: number;
}
