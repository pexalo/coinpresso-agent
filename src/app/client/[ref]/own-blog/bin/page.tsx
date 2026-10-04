"use client";

import { useParams } from "next/navigation";
import BlogBin from "@/components/BlogBin";

export default function BlogBinPage() {
  const { ref } = useParams<{ ref: string }>();
  return (
    <div className="space-y-6">
      <div className="pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">Bin</h1>
        <p className="mt-1 text-[13px] text-[var(--ink-3)]">
          Posts removed from the Blog queue stay here for 30 days. Restore one to put it back in the queue,
          or delete it for good. After 30 days they are deleted automatically.
        </p>
      </div>
      <BlogBin clientRef={ref} startOpen />
    </div>
  );
}
