"use client";

import { useRef, useState } from "react";

import { useUser } from "@clerk/nextjs";
import { Camera, Loader2, Lock, ShieldCheck } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export function AccountTab() {
  const { user } = useUser();
  const companyName = (user?.publicMetadata?.companyName as string) || "";
  const fullName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : "User";
  const email = user?.emailAddresses?.[0]?.emailAddress || "";
  const initials =
    ((user?.firstName?.[0] || "") + (user?.lastName?.[0] || "")).toUpperCase() || email[0]?.toUpperCase() || "R";

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");

  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      setAvatarError("Please choose an image file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setAvatarError("Image must be under 10 MB.");
      return;
    }
    setAvatarError("");
    setUploading(true);
    try {
      await user.setProfileImage({ file });
      await user.reload();
    } catch {
      setAvatarError("Could not update photo. Try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {/* Identity summary */}
      <Card className="relative overflow-hidden lg:col-span-1">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 -right-10 size-40 rounded-full bg-primary/15 blur-2xl"
        />
        <CardContent className="relative flex flex-col items-center gap-3 py-8 text-center">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onAvatarChange} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="group/av relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Change profile photo"
          >
            <Avatar className="size-20 ring-2 ring-primary/20">
              <AvatarImage src={user?.imageUrl} />
              <AvatarFallback className="bg-gradient-to-br from-primary to-primary/70 font-bold text-white text-xl">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover/av:opacity-100">
              {uploading ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <Camera className="size-5" aria-hidden="true" />}
            </span>
            <span className="absolute right-0 bottom-0 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground ring-2 ring-card">
              <Camera className="size-3" aria-hidden="true" />
            </span>
          </button>
          <div>
            <p className="font-semibold text-base leading-tight">{fullName}</p>
            <p className="text-muted-foreground text-sm">{email}</p>
            {companyName && <p className="mt-1 text-muted-foreground text-xs">{companyName}</p>}
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-primary text-xs font-medium hover:underline disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Change photo"}
          </button>
          {avatarError && <p className="text-destructive text-xs">{avatarError}</p>}
          <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 font-medium text-success text-xs">
            <ShieldCheck className="size-3.5" aria-hidden="true" /> Verified account
          </div>
        </CardContent>
      </Card>

      {/* Profile + security */}
      <div className="space-y-5 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="font-medium text-sm">Full Name</Label>
                <Input defaultValue={fullName} className="h-9" readOnly />
              </div>
              <div className="space-y-2">
                <Label className="font-medium text-sm">Email</Label>
                <Input defaultValue={email} className="h-9" readOnly />
              </div>
              <div className="space-y-2">
                <Label className="font-medium text-sm">Company</Label>
                <Input defaultValue={companyName} className="h-9" />
              </div>
              <div className="space-y-2">
                <Label className="font-medium text-sm">Phone</Label>
                <Input placeholder="(305) 555-0100" className="h-9" />
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              Name and email are managed by your authentication provider.
            </p>
            <Button className="h-9" size="sm">
              Update account
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="size-4" aria-hidden="true" /> Security
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="font-medium text-sm">New Password</Label>
                <Input type="password" className="h-9" placeholder="Min 8 characters" />
              </div>
              <div className="space-y-2">
                <Label className="font-medium text-sm">Confirm</Label>
                <Input type="password" className="h-9" />
              </div>
            </div>
            <Separator />
            <Button variant="outline" className="h-9" size="sm">
              Update password
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
