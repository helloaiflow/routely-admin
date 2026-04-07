import { BookMarked } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export default function DictionaryPage() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl">Dictionary</h1>
          <p className="text-muted-foreground text-sm">Manage custom dictionary and terminology</p>
        </div>
        <Badge variant="secondary">Coming Soon</Badge>
      </div>
      <div className="flex h-96 items-center justify-center rounded-lg border border-dashed">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <BookMarked className="h-8 w-8" />
          <p className="text-sm">This section is under development</p>
        </div>
      </div>
    </div>
  );
}
