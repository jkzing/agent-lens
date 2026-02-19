export type TraceSummary = {
  trace_id: string;
  span_count: number;
  duration_ns: number | null;
  root_span_name: string;
  start_ns: number | null;
  end_ns: number | null;
  first_received_at: string;
  last_received_at: string;
  input_tokens?: number;
  output_tokens?: number;
  service_names?: string[];
  primary_service_name?: string;
};

export type SpanRow = {
  id: number;
  received_at: string;
  trace_id: string;
  span_id: string | null;
  parent_span_id: string | null;
  name: string | null;
  kind: number | null;
  start_time_unix_nano: string | null;
  end_time_unix_nano: string | null;
  duration_ns: number | null;
  attributes: string | null;
  status_code: number | null;
  resource_attributes: string | null;
  events: string | null;
  has_parent: boolean;
  depth: number;
};
