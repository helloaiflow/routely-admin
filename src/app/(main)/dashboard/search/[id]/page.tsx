// Mobile full-page view — uses the shared StopDetailView component
import { StopDetailView } from "../_components/stop-detail-view";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SearchDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <div className="flex flex-1 flex-col bg-card min-h-full">
      <StopDetailView id={decodeURIComponent(id)} mode="page" />
    </div>
  );
}
