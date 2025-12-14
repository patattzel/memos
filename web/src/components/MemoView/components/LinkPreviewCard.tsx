import { useEffect, useMemo, useState } from "react";
import useLocalStorage from "react-use/lib/useLocalStorage";
import { cn } from "@/lib/utils";

interface LinkPreviewCardProps {
  content: string;
  memoName: string;
}

interface LinkPreviewData {
  url: string;
  title: string;
  description: string;
  image: string;
}

const FIRST_LINK_REGEX = /((https?:\/\/)?[^\s<>"'()]+\.[^\s<>"'()]+)/i;

const LinkPreviewCard = ({ content, memoName }: LinkPreviewCardProps) => {
  const firstLinkRaw = useMemo(() => {
    const match = content.match(FIRST_LINK_REGEX);
    return match?.[0] ?? "";
  }, [content]);

  const normalizedLink = useMemo(() => {
    if (!firstLinkRaw) return "";
    return /^https?:\/\//i.test(firstLinkRaw) ? firstLinkRaw : `https://${firstLinkRaw}`;
  }, [firstLinkRaw]);

  const [preview, setPreview] = useState<LinkPreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isHidden, setIsHidden] = useLocalStorage<boolean>(`memo-preview-hidden-${memoName}`, false);
  const hostname = useMemo(() => {
    try {
      return new URL(normalizedLink).hostname;
    } catch {
      return normalizedLink;
    }
  }, [normalizedLink]);

  useEffect(() => {
    if (!normalizedLink || isHidden) {
      return;
    }

    const controller = new AbortController();
    const fetchPreview = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/link/preview?url=${encodeURIComponent(normalizedLink)}`, {
          method: "GET",
          credentials: "include",
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`status ${res.status}`);
        }
        const data = (await res.json()) as LinkPreviewData;
        setPreview(data);
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          setError(err?.message || "failed");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchPreview();
    return () => controller.abort();
  }, [normalizedLink, isHidden]);

  if (!firstLinkRaw) return null;

  if (isHidden) {
    return (
      <button
        type="button"
        className="mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setIsHidden(false)}
      >
        Vorschau anzeigen
      </button>
    );
  }

  if (loading) {
    return (
      <div className="w-full mt-1 h-24 rounded-lg border border-border bg-muted animate-pulse">
        <span className="sr-only">Lade Link-Vorschau…</span>
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="w-full mt-1 text-xs text-muted-foreground flex items-center gap-2">
        <span>Keine Vorschau verfügbar</span>
        <button type="button" className="underline" onClick={() => setIsHidden(true)}>
          ausblenden
        </button>
      </div>
    );
  }

  return (
    <div className="w-full mt-2">
      <a
        className={cn(
          "group flex gap-3 rounded-lg border border-border bg-card text-card-foreground overflow-hidden",
          "hover:border-primary/60 transition-colors"
        )}
        href={preview.url || firstLink}
        target="_blank"
        rel="noopener noreferrer"
      >
        <div
          className="w-36 bg-muted shrink-0 aspect-video"
          style={{
            backgroundImage: preview.image ? `url("${preview.image}")` : "none",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="flex-1 py-3 pr-3 min-w-0">
          <div className="text-sm font-semibold truncate">{preview.title || preview.url || firstLinkRaw}</div>
          {preview.description && (
            <div className="text-xs text-muted-foreground line-clamp-2 mt-1">{preview.description}</div>
          )}
          <div className="text-[11px] text-muted-foreground mt-1">{hostname}</div>
        </div>
      </a>
      <div className="mt-1 flex justify-end">
        <button
          type="button"
          className="text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => setIsHidden(true)}
        >
          Vorschau ausblenden
        </button>
      </div>
    </div>
  );
};

export default LinkPreviewCard;
