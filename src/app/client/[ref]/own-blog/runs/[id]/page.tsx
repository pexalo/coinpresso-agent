"use client";

import { use } from "react";
import RunDetail from "@/components/RunDetail";

export default function BlogRunPage({
  params,
}: {
  params: Promise<{ ref: string; id: string }>;
}) {
  const { ref, id } = use(params);
  return (
    <RunDetail
      clientRef={ref}
      id={id}
      base={`/client/${ref}/own-blog`}
      backLabel="Blog queue"
    />
  );
}
