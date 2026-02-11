"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Pagination } from "@heroui/react";
import { ChevronLeft, ChevronRight, Download, Maximize2, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
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
};

export const ProofImageViewer = ({ src, alt = "Proof image", images, className }: ProofImageViewerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const providedImages = images?.filter((image) => Boolean(image.src)) ?? [];
  const resolvedImages = providedImages.length > 0
    ? providedImages
    : (src ? [{ src, alt }] : []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (activeIndex >= resolvedImages.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, resolvedImages.length]);

  useEffect(() => {
    if (!isOpen || resolvedImages.length <= 1) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        setActiveIndex((prev) => (prev - 1 + resolvedImages.length) % resolvedImages.length);
        setRotation(0);
      }
      if (event.key === "ArrowRight") {
        setActiveIndex((prev) => (prev + 1) % resolvedImages.length);
        setRotation(0);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, resolvedImages.length]);

  if (!resolvedImages.length) {
    return null;
  }

  const currentImage = resolvedImages[activeIndex] ?? resolvedImages[0];
  const rotate = () => setRotation((prev) => (prev + 90) % 360);
  const closeViewer = () => {
    setIsOpen(false);
    setRotation(0);
    setActiveIndex(0);
  };

  const goToIndex = (index: number) => {
    setActiveIndex(index);
    setRotation(0);
  };

  const showCarouselControls = resolvedImages.length > 1;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="gap-2"
        onClick={() => {
          setIsOpen(true);
          setActiveIndex(0);
        }}
      >
        <Maximize2 className="h-4 w-4" />
        {showCarouselControls ? `View proofs (${resolvedImages.length})` : "View proof"}
      </Button>

      {isOpen && mounted ? createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-overlay/80 p-6">
          <div className="relative w-full max-w-3xl rounded-2xl border border-divider/40 bg-content1/90 p-4 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-sm font-semibold text-default-600">
                {showCarouselControls
                  ? `Proof image ${activeIndex + 1} of ${resolvedImages.length}`
                  : "Proof image"}
              </h3>
              <div className="flex items-center gap-2">
                <Button
                  as="a"
                  href={currentImage.src}
                  download
                  size="sm"
                  variant="outline"
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={rotate}
                >
                  <RotateCw className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={closeViewer}
                >
                  Close
                </Button>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-center rounded-xl border border-divider/40 bg-content2/70 p-4">
              {showCarouselControls ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mr-2"
                  onClick={() => goToIndex((activeIndex - 1 + resolvedImages.length) % resolvedImages.length)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              ) : null}
              <Image
                src={currentImage.src}
                alt={currentImage.alt ?? alt}
                width={1200}
                height={800}
                className="max-h-[85vh] w-auto rounded-lg object-contain"
                style={{ transform: `rotate(${rotation}deg)` }}
                unoptimized
              />
              {showCarouselControls ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-2"
                  onClick={() => goToIndex((activeIndex + 1) % resolvedImages.length)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
            {showCarouselControls ? (
              <div className="mt-4 flex justify-center">
                <Pagination
                  total={resolvedImages.length}
                  page={activeIndex + 1}
                  onChange={(page) => goToIndex(page - 1)}
                  showControls={false}
                  isCompact
                  size="sm"
                />
              </div>
            ) : null}
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
};
