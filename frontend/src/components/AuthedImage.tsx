import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import { api } from "../services/api";

/** An <img> for API URLs that need the bearer token. */
export function AuthedImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const blob = useQuery({ queryKey: ["blob", src], queryFn: () => api.blob(src), staleTime: Infinity });
  const url = useMemo(() => (blob.data ? URL.createObjectURL(blob.data) : null), [blob.data]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  if (blob.isError)
    return (
      <div className={`${className} flex aspect-video items-center justify-center bg-slate-100 text-sm text-slate-500`}>
        Image unavailable
      </div>
    );
  if (!url) return <div className={`${className} aspect-video animate-pulse bg-slate-100`} />;
  return <img src={url} alt={alt} className={className} />;
}
