import { Mail, Phone } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SupportPage() {
  return (
    <div className="min-h-[calc(100vh-57px)] bg-muted/40">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
        <div className="space-y-4">
          <div>
            <h1 className="type-page-title">Support</h1>
            <p className="text-muted-foreground">Get help from the Routely team</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <a href="tel:+18889201907">
              <Card className="cursor-pointer transition-colors hover:border-primary/30">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Phone size={16} className="text-primary" />
                    <CardTitle className="text-sm">Call us</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="font-medium text-sm">+1 (888) 920-1907</p>
                  <p className="mt-0.5 text-muted-foreground text-xs">Mon&ndash;Fri, 8am&ndash;6pm EST</p>
                </CardContent>
              </Card>
            </a>
            <a href="mailto:support@routelypro.com">
              <Card className="cursor-pointer transition-colors hover:border-primary/30">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Mail size={16} className="text-primary" />
                    <CardTitle className="text-sm">Email us</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="font-medium text-sm">support@routelypro.com</p>
                  <p className="mt-0.5 text-muted-foreground text-xs">We respond within 2 hours</p>
                </CardContent>
              </Card>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
