"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Stop {
  _id: string;
  recipient_name?: string;
  rx_pharma_id?: string;
  route_title?: string;
  label_status?: string;
  delivery_state?: string;
}

function statusVariant(status: string | undefined) {
  switch (status) {
    case "Match":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "Unmatch":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
    case "Human":
      return "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200";
    default:
      return "";
  }
}

export function RecentStopsTable({ data }: { data: Stop[] }) {
  const rows = data.slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Stops</CardTitle>
        <CardDescription>Last 10 stops processed</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Recipient</TableHead>
              <TableHead>Rx Pharma ID</TableHead>
              <TableHead>Route</TableHead>
              <TableHead>Label Status</TableHead>
              <TableHead>Delivery State</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No recent stops
                </TableCell>
              </TableRow>
            ) : (
              rows.map((stop) => (
                <TableRow key={stop._id}>
                  <TableCell className="font-medium">{stop.recipient_name || "-"}</TableCell>
                  <TableCell>{stop.rx_pharma_id || "-"}</TableCell>
                  <TableCell>{stop.route_title || "-"}</TableCell>
                  <TableCell>
                    {stop.label_status ? (
                      <Badge variant="outline" className={statusVariant(stop.label_status)}>
                        {stop.label_status}
                      </Badge>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    {stop.delivery_state ? <Badge variant="outline">{stop.delivery_state}</Badge> : "-"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
