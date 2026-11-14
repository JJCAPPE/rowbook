"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { Pagination } from "@heroui/react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";
import { cn } from "@/lib/utils";

type ProofImage = {
  id?: string;
  src: string;
  alt?: string;
};

type ProofImageViewerProps = {
  src?: string;
  alt?: string;
  images?: ProofImage[];
  className?: string;
  onRefresh?: () => Promise<unknown> | unknown;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

export const ProofImageViewer = ({
  src,
  alt = "Proof image",
  images,
  className,
  onRefresh,
}: ProofImageViewerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hasImageError, setHasImageError] = useState(false);
  const [imageRetryKey, setImageRetryKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const pressedOutsideRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const providedImages = images?.filter((image) => Boolean(image.src)) ?? [];
  const resolvedImages = providedImages.length > 0
    ? providedImages
    : (src ? [{ src, alt }] : []);
  const currentImage = resolvedImages[activeIndex] ?? resolvedImages[0];

  const resetImageView = useCallback(() => {
    setRotation(0);
    setZoom(MIN_ZOOM);
    setHasImageError(false);
    setImageRetryKey(0);
  }, []);

  const closeViewer = useCallback(() => {
    setIsOpen(false);
    setActiveIndex(0);
    resetImageView();
  }, [resetImageView]);

  useEffect(() => {
    if (activeIndex >= resolvedImages.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, resolvedImages.length]);

  useEffect(() => {
    resetImageView();
  }, [currentImage?.src, resetImageView]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const dialog = dialogRef.current;
    dialog?.querySelector("[data-proof-viewer-initial-focus]")?.setAttribute("autofocus", "");
    dialog?.showModal();
    return () => dialog?.close();
  }, [isOpen]);

  if (!resolvedImages.length) {
    return null;
  }

  const rotate = () => setRotation((prev) => (prev + 90) % 360);
  const zoomOut = () => setZoom((current) => Math.max(MIN_ZOOM, current - ZOOM_STEP));
  const zoomIn = () => setZoom((current) => Math.min(MAX_ZOOM, current + ZOOM_STEP));

  const goToIndex = (index: number) => {
    setActiveIndex(index);
    resetImageView();
  };

  const showCarouselControls = resolvedImages.length > 1;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="gap-2"
        onClick={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          setIsOpen(true);
          setActiveIndex(0);
          resetImageView();
        }}
      >
        <Maximize2 className="h-4 w-4" aria-hidden="true" />
        {showCarouselControls ? `View proofs (${resolvedImages.length})` : "View proof"}
      </Button>

      {isOpen ? (
          <dialog
            ref={dialogRef}
            data-proof-viewer
            closedby="any"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            onClose={closeViewer}
            onKeyDown={(event) => {
              if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || !showCarouselControls) return;
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                const direction = event.key === "ArrowLeft" ? -1 : 1;
                goToIndex((activeIndex + direction + resolvedImages.length) % resolvedImages.length);
              }
            }}
            onPointerDown={(event) => {
              if ("closedBy" in HTMLDialogElement.prototype) return;
              const rect = event.currentTarget.getBoundingClientRect();
              pressedOutsideRef.current = event.clientX < rect.left || event.clientX > rect.right
                || event.clientY < rect.top || event.clientY > rect.bottom;
            }}
            onPointerUp={(event) => {
              if ("closedBy" in HTMLDialogElement.prototype || !pressedOutsideRef.current) return;
              pressedOutsideRef.current = false;
              const rect = event.currentTarget.getBoundingClientRect();
              if (event.clientX < rect.left || event.clientX > rect.right
                || event.clientY < rect.top || event.clientY > rect.bottom) {
                event.currentTarget.close();
              }
            }}
            className="fixed inset-0 m-auto h-[calc(100dvh-1rem)] max-h-none w-[calc(100%-1rem)] max-w-4xl flex-col overflow-hidden overscroll-contain rounded-2xl border border-divider/40 bg-content1/95 p-3 text-foreground shadow-lg outline-none backdrop-blur backdrop:overflow-hidden backdrop:overscroll-contain backdrop:bg-overlay/80 open:flex sm:h-[min(48rem,calc(100dvh-3rem))] sm:w-[calc(100%-3rem)] sm:p-4"
          >
            <div className="flex flex-col gap-3 border-b border-divider/40 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 id={titleId} className="text-sm font-semibold text-default-600" aria-live="polite" aria-atomic="true">
                {showCarouselControls
                  ? `Proof image ${activeIndex + 1} of ${resolvedImages.length}`
                  : "Proof image"}
                </h2>
                <p id={descriptionId} className="sr-only">
                  Use the controls to zoom, rotate, download, or move between proof images.
                  Press Escape to close the viewer.
                </p>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                <Button
                  as="a"
                  href={currentImage.src}
                  download
                  size="sm"
                  variant="outline"
                  isIconOnly
                  aria-label={`Download proof image ${activeIndex + 1}`}
                  title="Download proof image"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  isIconOnly
                  aria-label="Zoom out"
                  title="Zoom out"
                  disabled={zoom <= MIN_ZOOM}
                  onClick={zoomOut}
                >
                  <ZoomOut className="h-4 w-4" aria-hidden="true" />
                </Button>
                <span
                  className="min-w-10 text-center text-xs font-semibold tabular-nums text-default-500"
                  aria-live="polite"
                >
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  isIconOnly
                  aria-label="Zoom in"
                  title="Zoom in"
                  disabled={zoom >= MAX_ZOOM}
                  onClick={zoomIn}
                >
                  <ZoomIn className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  isIconOnly
                  aria-label="Rotate proof image clockwise"
                  title="Rotate proof image"
                  onClick={rotate}
                >
                  <RotateCw className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => dialogRef.current?.close()}
                  data-proof-viewer-initial-focus
                >
                  Close
                </Button>
              </div>
            </div>

            <div className="relative mt-3 min-h-0 flex-1 overflow-hidden rounded-xl border border-divider/40 bg-content2/70">
              <div className="h-full w-full overflow-auto overscroll-contain p-4 sm:p-8">
                <div className="flex min-h-full min-w-full items-center justify-center">
                  {isRefreshing ? (
                    <AppLoadingScreen compact />
                  ) : hasImageError ? (
                    <div
                      role="status"
                      className="mx-auto max-w-sm space-y-3 rounded-2xl border border-divider/40 bg-content1/90 p-5 text-center"
                    >
                      <p className="font-semibold text-foreground">Proof image unavailable</p>
                      <p className="text-sm text-default-500">
                        This image could not be loaded. Its link may have expired.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isRefreshing}
                        onClick={async () => {
                          setIsRefreshing(true);
                          try {
                            await onRefresh?.();
                            setHasImageError(false);
                            setImageRetryKey((current) => current + 1);
                          } finally {
                            setIsRefreshing(false);
                          }
                        }}
                      >
                        Try again
                      </Button>
                    </div>
                  ) : (
                    <Image
                      key={`${currentImage.src}-${imageRetryKey}`}
                      src={currentImage.src}
                      alt={currentImage.alt ?? alt}
                      width={1200}
                      height={800}
                      className="max-h-[calc(100dvh-14rem)] max-w-full select-none rounded-lg object-contain transition-transform duration-200 ease-out motion-reduce:transition-none sm:max-h-[calc(100dvh-12rem)]"
                      style={{ transform: `rotate(${rotation}deg) scale(${zoom})` }}
                      onError={() => setHasImageError(true)}
                      draggable={false}
                      unoptimized
                    />
                  )}
                </div>
              </div>

              {showCarouselControls ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  isIconOnly
                  aria-label="View previous proof image"
                  title="Previous proof image"
                  className="absolute left-2 top-1/2 z-10 -translate-y-1/2 bg-content1/90 shadow-sm"
                  onClick={() => goToIndex((activeIndex - 1 + resolvedImages.length) % resolvedImages.length)}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
              ) : null}
              {showCarouselControls ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  isIconOnly
                  aria-label="View next proof image"
                  title="Next proof image"
                  className="absolute right-2 top-1/2 z-10 -translate-y-1/2 bg-content1/90 shadow-sm"
                  onClick={() => goToIndex((activeIndex + 1) % resolvedImages.length)}
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              ) : null}
            </div>

            {showCarouselControls ? (
              <div className="mt-3 flex justify-center">
                <Pagination
                  aria-label="Select proof image"
                  total={resolvedImages.length}
                  page={activeIndex + 1}
                  onChange={(page) => goToIndex(page - 1)}
                  showControls={false}
                  isCompact
                  size="sm"
                />
              </div>
            ) : null}
          </dialog>
      ) : null}
    </div>
  );
};
